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

import {
  getEmbedding,
  cosineSimilarity
} from "../services/embeddingService.js";


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

const chunks =
  chunkText(text);

const embeddedChunks =
  [];

for (
  const chunk of chunks
) {

  const embedding =
    await getEmbedding(
      chunk
    );

  embeddedChunks.push({
    text: chunk,
    embedding
  });
}

pdfMemory[pdfPath] =
  embeddedChunks;

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
  userMessage
    .toLowerCase()
    .startsWith(
      "search pdf "
    )
) {

  const keyword =
    userMessage
      .replace(
        /^search pdf /i,
        ""
      )
      .trim();

  const pdfMemory =
    await loadPDFMemory();

  const queryEmbedding =
    await getEmbedding(
      keyword
    );

  const scored =
    [];

  for (
    const [file, chunks]
    of Object.entries(
      pdfMemory
    )
  ) {

    chunks.forEach(
      chunk => {

        scored.push({

          file,

          text:
            chunk.text,

          score:
            cosineSimilarity(
              queryEmbedding,
              chunk.embedding
            )
        });
      }
    );
  }

  scored.sort(
    (a, b) =>
      b.score - a.score
  );

  const matches =
    scored
      .filter(
        item =>
          item.score > 0.30
      )
      .slice(0, 5);

  if (
    matches.length === 0
  ) {

    console.log(
      "\nAI: No matches found.\n"
    );

    return true;
  }

  console.log(
    "\n📚 Search Results:\n"
  );

  matches.forEach(
    item => {

      console.log(
        `Score: ${item.score.toFixed(3)}`
      );

      console.log(
        `PDF: ${item.file}`
      );

      console.log(
        item.text.slice(0, 400)
      );

      console.log(
        "\n-------------------\n"
      );
    }
  );

  return true;
}
if (
  userMessage
    .toLowerCase()
    .startsWith(
      "ask pdf "
    )
) {

  const query =
    userMessage
      .replace(
        /^ask pdf /i,
        ""
      )
      .trim();

  const firstSpace =
    query.indexOf(" ");

  if (
    firstSpace === -1
  ) {

    console.log(
      "\nUsage:\nask pdf <PDFNAME> <question>\n"
    );

    return true;
  }

  const pdfName =
    query.substring(
      0,
      firstSpace
    );

  const question =
    query.substring(
      firstSpace + 1
    );

  const pdfMemory =
    await loadPDFMemory();

  const pdfKey =
    Object.keys(
      pdfMemory
    ).find(
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

  const queryEmbedding =
    await getEmbedding(
      question
    );

  const scored =
    chunks.map(
      chunk => ({

        text:
          chunk.text,

        score:
          cosineSimilarity(
            queryEmbedding,
            chunk.embedding
          )
      })
    );

  scored.sort(
    (a, b) =>
      b.score - a.score
  );

  const topChunks =
    scored
      .filter(
        item =>
          item.score > 0.25
      )
      .slice(0, 3);

  if (
    topChunks.length === 0
  ) {

    console.log(
      "\nAI: Answer not found in this PDF.\n"
    );

    return true;
  }

  const context =
    topChunks
      .map(
        item =>
          item.text
      )
      .join(
        "\n\n"
      );

  const prompt = `
You are a PDF question-answering assistant.

Answer ONLY from the PDF content below.

PDF Content:
${context}

Question:
${question}

Rules:
- Use only the provided PDF content.
- Do not make up information.
- If the answer is missing, reply:
"Answer not found in this PDF."
`;

  const answer =
    await askAI(
      prompt
    );

  console.log(
    "\n📄 PDF Answer:\n"
  );

  console.log(
    answer
  );

  console.log(
    "\n📊 Retrieved Chunks:\n"
  );

  topChunks.forEach(
    item => {

      console.log(
        `Score: ${item.score.toFixed(3)}`
      );
    }
  );

  console.log();

  return true;
}

  return false;
}