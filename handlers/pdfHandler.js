import {
  loadPDF,
  chunkText
} from "../services/pdfService.js";

import {
  loadPDFMemory,
  savePDFMemory
} from "../storage/pdfStorage.js";

import {
  askAI
} from "../services/ai.js";


export async function handlePDF(
  userMessage
) {
    if (
  userMessage.toLowerCase() ===
  "list pdfs"
) {

  const pdfMemory =
    await loadPDFMemory();

  const pdfs =
    Object.keys(pdfMemory);

  if (pdfs.length === 0) {

    console.log(
      "\nAI: No PDFs loaded.\n"
    );

    return true;
  }

  console.log(
    "\n📚 Loaded PDFs:\n"
  );

  pdfs.forEach(pdf =>
    console.log(pdf)
  );

  console.log();

  return true;
}

if (
  userMessage.toLowerCase() ===
  "pdf info"
) {

  const pdfMemory =
    await loadPDFMemory();

  const pdfs =
    Object.entries(pdfMemory);

  if (pdfs.length === 0) {

    console.log(
      "\nAI: No PDFs loaded.\n"
    );

    return true;
  }

  console.log(
    "\n📄 PDF Info:\n"
  );

  pdfs.forEach(
    ([file, chunks]) => {

      console.log(
        `${file} -> ${chunks.length} chunks`
      );
    }
  );

  console.log();

  return true;
}
if (
  userMessage
    .toLowerCase()
    .startsWith(
      "load pdf "
    )
) {

  const pdfPath =
    userMessage
      .replace(
        /^load pdf /i,
        ""
      )
      .trim();

  try {

    const text =
      await loadPDF(
        pdfPath
      );

    const pdfMemory =
      await loadPDFMemory();

    pdfMemory[pdfPath] =
      chunkText(text);

    await savePDFMemory(
      pdfMemory
    );

    console.log(
      "\n📄 PDF Loaded Successfully\n"
    );

  } catch (err) {

    console.log(
      "\nAI: Could not load PDF.\n"
    );

    console.error(
      err
    );
  }

  return true;
}

if (
  userMessage.toLowerCase().startsWith(
    "search pdf "
  )
) {

  const keyword =
    userMessage
      .replace(/^search pdf /i, "")
      .trim()
      .toLowerCase();

  const pdfMemory =
    await loadPDFMemory();

  let found = false;

  console.log(
    "\n📚 Search Results:\n"
  );

  for (
    const [file, chunks]
    of Object.entries(pdfMemory)
  ) {

    chunks.forEach(
      (chunk, index) => {

        if (
          chunk
            .toLowerCase()
            .includes(keyword)
        ) {

          found = true;

          console.log(
            `\n📄 ${file}`
          );

          console.log(
            `Chunk ${index + 1}`
          );

          console.log(
            chunk.slice(0, 500)
          );

          console.log(
            "\n-------------------"
          );
        }
      }
    );
  }

  if (!found) {

    console.log(
      "\nAI: No matches found.\n"
    );
  }
  return true;
}

if (
  userMessage.toLowerCase().startsWith(
    "ask pdf "
  )
) {

const query = userMessage
  .replace(/^ask pdf /i, "")
  .trim();

const firstSpace =
  query.indexOf(" ");

if (firstSpace === -1) {

  console.log(
    "\nUsage:\nask pdf <PDFNAME> <question>\n"
  );

  return true;
}

const pdfName =
  query.substring(0, firstSpace);

const question =
  query.substring(firstSpace + 1);

  const pdfMemory =
    await loadPDFMemory();

const pdfKey =
  Object.keys(pdfMemory).find(
    file =>
      file
        .toLowerCase()
        .includes(
          pdfName.toLowerCase()
        )
  );

if (!pdfKey) {

  console.log(
    `\nAI: PDF "${pdfName}" not found.\n`
  );

  return true;
}

  const chunks =
  pdfMemory[pdfKey];

  const questionWords =
  question
    .toLowerCase()
    .split(" ");


    const relevantChunks =
  chunks.filter(chunk => {

    const lowerChunk =
      chunk.toLowerCase();

    return questionWords.some(
      word =>
        lowerChunk.includes(word)
    );
  });

  const context =
  relevantChunks
    .slice(0, 3)
    .join("\n\n");

    if (
  relevantChunks.length === 0
) {

  console.log(
    "\nAI: Answer not found in this PDF.\n"
  );

  return true;
}

const prompt = `
You are a PDF question-answering assistant.

Answer ONLY from the PDF.

Relevant PDF Content:
${context}

Question:
${question}

If answer is missing,
reply:
"Answer not found in this PDF."
`;

  const answer =
    await askAI(prompt);

  console.log(
    "\n📄 PDF Answer:\n"
  );

  console.log(answer);
  console.log();

  return true;
}


  return false;
}