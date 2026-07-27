import { loadPDF, chunkText } from "./pdfParser.js";
import { loadPDFMemory, savePDFMemory } from "./pdfStorage.js";
import { getEmbedding, cosineSimilarity } from "../../services/embeddingService.js";
import { askAI } from "../../services/ai.js";
import { incrementStat } from "../../storage/statsStorage.js";
import { searchPDFMemory } from "./pdfSearch.js";

export async function uploadAndProcessPDF(filePath, originalName) {
  const text = await loadPDF(filePath);
  const chunks = chunkText(text);

  const embeddedChunks = [];

  for (const chunk of chunks) {
    const embedding = await getEmbedding(chunk);
    embeddedChunks.push({
      text: chunk,
      embedding
    });
  }

  const memory = await loadPDFMemory();
  memory[originalName] = embeddedChunks;
  await savePDFMemory(memory);

  return { success: true, file: originalName };
}

export async function executePDFAction(pdfName, action) {
  const memory = await loadPDFMemory();
  const chunks = memory[pdfName];

  if (!chunks) {
    return { error: `PDF "${pdfName}" not found`, status: 404 };
  }

  const content = chunks
    .slice(0, 10)
    .map(c => c.text)
    .join("\n\n");

  const docLabel = pdfName
    .split("/")
    .pop()
    .replace(/\.[^/.]+$/, "")
    .replace(/[_-]/g, " ");

  const PROMPTS = {
    summarize: `
You are an expert study assistant.
Summarize the document "${docLabel}" using this exact format:

# Summary: ${docLabel}

## Main Topics
- ...

## Important Concepts
- ...

## Key Definitions
- ...

## Exam-Important Points
- ...

## Quick Revision (5 bullets)
- ...

Document Content:
${content}
`,
    quiz: `
You are an exam paper setter.
Using ONLY the document "${docLabel}", create:

# Quiz: ${docLabel}

## Multiple Choice Questions (5)
For each: question, 4 options (A–D), correct answer marked.

## Short Answer Questions (5)
Q: ...
A: ...

## Long Answer Questions (2)
Q: ...
A: ...

Document Content:
${content}
`,
    flashcards: `
You are a study assistant.
Create 15 flashcards from "${docLabel}".

# Flashcards: ${docLabel}

Format each as:
**Q:** Question here
**A:** Answer here
---

Keep answers short and revision-friendly.

Document Content:
${content}
`,
    notes: `
You are a precise note-taker.
Create structured study notes from "${docLabel}".

# Study Notes: ${docLabel}

For each major topic in the document, use this format:

## [Topic Name]
- Key point 1
- Key point 2
- Key point 3

> **Definition:** important term: its meaning

Include all major topics covered.

Document Content:
${content}
`,
    explain: `
You are a tutor explaining "${docLabel}" to a student.
Explain the core concepts in simple, clear language.

# Plain English Explanation: ${docLabel}

## What is this document about?
...

## Key Ideas (explained simply)
...

## Analogies and Examples
...

## What you need to remember
...

Document Content:
${content}
`
  };

  const prompt = PROMPTS[action];

  if (!prompt) {
    return {
      error: `Unknown action: "${action}". Valid: summarize, quiz, flashcards, notes, explain`,
      status: 400
    };
  }

  await incrementStat("pdf_queries");

  const result = await askAI(prompt, "pdf");

  return { result, action, pdfName };
}

export async function handlePDF(userMessage) {
  // list pdfs
  if (userMessage.toLowerCase() === "list pdfs") {
    const pdfMemory = await loadPDFMemory();
    const pdfs = Object.keys(pdfMemory);

    if (pdfs.length === 0) {
      console.log("\nAI: No PDFs loaded.\n");
      return true;
    }

    console.log("\n📚 Loaded PDFs:\n");
    pdfs.forEach(pdf => console.log(pdf));
    console.log();
    return true;
  }

  // pdf info
  if (userMessage.toLowerCase() === "pdf info") {
    const pdfMemory = await loadPDFMemory();
    const pdfs = Object.entries(pdfMemory);

    if (pdfs.length === 0) {
      console.log("\nAI: No PDFs loaded.\n");
      return true;
    }

    console.log("\n📄 PDF Info:\n");
    pdfs.forEach(([file, chunks]) => {
      console.log(`${file} -> ${chunks.length} chunks`);
    });
    console.log();
    return true;
  }

  // load pdf <path>
  if (userMessage.toLowerCase().startsWith("load pdf ")) {
    const pdfPath = userMessage.replace(/^load pdf /i, "").trim();

    try {
      const text = await loadPDF(pdfPath);
      const pdfMemory = await loadPDFMemory();
      const chunks = chunkText(text);
      const embeddedChunks = [];

      for (const chunk of chunks) {
        const embedding = await getEmbedding(chunk);
        embeddedChunks.push({
          text: chunk,
          embedding
        });
      }

      pdfMemory[pdfPath] = embeddedChunks;
      await savePDFMemory(pdfMemory);

      console.log("\n📄 PDF Loaded Successfully\n");
    } catch (err) {
      console.log("\nAI: Could not load PDF.\n");
      console.error(err);
    }

    return true;
  }

  // search pdf <keyword>
  if (userMessage.toLowerCase().startsWith("search pdf ")) {
    const keyword = userMessage.replace(/^search pdf /i, "").trim();
    return await searchPDFMemory(keyword);
  }

  // ask pdf <pdfName> <question>
  if (userMessage.toLowerCase().startsWith("ask pdf ")) {
    const query = userMessage.replace(/^ask pdf /i, "").trim();
    const firstSpace = query.indexOf(" ");

    if (firstSpace === -1) {
      console.log("\nUsage:\nask pdf <PDFNAME> <question>\n");
      return true;
    }

    const pdfName = query.substring(0, firstSpace);
    const question = query.substring(firstSpace + 1);

    const pdfMemory = await loadPDFMemory();
    const pdfKey = Object.keys(pdfMemory).find(file =>
      file.toLowerCase().includes(pdfName.toLowerCase())
    );

    if (!pdfKey) {
      console.log(`\nAI: PDF "${pdfName}" not found.\n`);
      return true;
    }

    const chunks = pdfMemory[pdfKey];
    const queryEmbedding = await getEmbedding(question);

    const scored = chunks.map(chunk => ({
      text: chunk.text,
      score: cosineSimilarity(queryEmbedding, chunk.embedding)
    }));

    scored.sort((a, b) => b.score - a.score);

    const topChunks = scored
      .filter(item => item.score > 0.25)
      .slice(0, 3);

    if (topChunks.length === 0) {
      console.log("\nAI: Answer not found in this PDF.\n");
      return true;
    }

    const context = topChunks.map(item => item.text).join("\n\n");

    const prompt = `
You are answering questions from OCR extracted study notes.

The OCR text may contain spelling mistakes.

Use the provided content to infer the intended meaning.

Do not invent information that is not supported by the content.

PDF Content:
${context}

Question:
${question}
`;

    const answer = await askAI(prompt);

    console.log("\n📄 PDF Answer:\n");
    console.log(answer);
    console.log("\n📊 Retrieved Chunks:\n");
    topChunks.forEach(item => {
      console.log(`Score: ${item.score.toFixed(3)}`);
    });
    console.log();

    return true;
  }

  // summarize pdf <pdfName>
  if (userMessage.toLowerCase().startsWith("summarize pdf ")) {
    const pdfName = userMessage.replace(/^summarize pdf /i, "").trim();
    const pdfMemory = await loadPDFMemory();
    const pdfKey = Object.keys(pdfMemory).find(file =>
      file.toLowerCase().includes(pdfName.toLowerCase())
    );

    if (!pdfKey) {
      console.log(`\nAI: PDF "${pdfName}" not found.\n`);
      return true;
    }

    const chunks = pdfMemory[pdfKey];
    const content = chunks.slice(0, 8).map(chunk => chunk.text).join("\n\n");

    const prompt = `
You are an expert study assistant.

Summarize the PDF using this format:

1. Main Topics

2. Important Concepts

3. Key Definitions

4. Important Algorithms / Methods

5. Exam Important Points

6. 5 Quick Revision Notes

PDF Content:
${content}
`;

    const summary = await askAI(prompt);
    console.log("\n📚 PDF Summary:\n");
    console.log(summary);
    console.log();
    return true;
  }

  // quiz pdf <pdfName>
  if (userMessage.toLowerCase().startsWith("quiz pdf ")) {
    const pdfName = userMessage.replace(/^quiz pdf /i, "").trim();
    const pdfMemory = await loadPDFMemory();
    const pdfKey = Object.keys(pdfMemory).find(file =>
      file.toLowerCase().includes(pdfName.toLowerCase())
    );

    if (!pdfKey) {
      console.log(`\nAI: PDF "${pdfName}" not found.\n`);
      return true;
    }

    const chunks = pdfMemory[pdfKey];
    const content = chunks.slice(0, 8).map(chunk => chunk.text).join("\n\n");

    const prompt = `
You are an exam paper setter.

Using ONLY the PDF content,
create:

1. Five MCQs
   (with answers)

2. Five Short Answer Questions

3. Two Long Answer Questions

PDF Content:
${content}
`;

    const quiz = await askAI(prompt);
    console.log("\n📝 PDF Quiz:\n");
    console.log(quiz);
    console.log();
    return true;
  }

  // flashcards pdf <pdfName>
  if (userMessage.toLowerCase().startsWith("flashcards pdf ")) {
    const pdfName = userMessage.replace(/^flashcards pdf /i, "").trim();
    const pdfMemory = await loadPDFMemory();
    const pdfKey = Object.keys(pdfMemory).find(file =>
      file.toLowerCase().includes(pdfName.toLowerCase())
    );

    if (!pdfKey) {
      console.log(`\nAI: PDF "${pdfName}" not found.\n`);
      return true;
    }

    const chunks = pdfMemory[pdfKey];
    const content = chunks.slice(0, 8).map(chunk => chunk.text).join("\n\n");

    const prompt = `
You are a study assistant.

Using ONLY the PDF content,
create 15 flashcards.

Format:

Q: Question

A: Answer

Keep answers short and easy to revise.

PDF Content:
${content}
`;

    const flashcards = await askAI(prompt);
    console.log("\n🃏 Flashcards:\n");
    console.log(flashcards);
    console.log();
    return true;
  }

  return false;
}
