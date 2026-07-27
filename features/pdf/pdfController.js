import { loadPDFMemory, deletePDF } from "./pdfStorage.js";
import { askPDF } from "./pdfRetriever.js";
import { searchPDFChunks } from "./pdfSearch.js";
import { uploadAndProcessPDF, executePDFAction } from "./pdfService.js";

export async function uploadPDF(req, res) {
  try {
    const result = await uploadAndProcessPDF(req.file.path, req.file.originalname);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed" });
  }
}

export async function listPDFs(req, res) {
  const memory = await loadPDFMemory();
  res.json(Object.keys(memory));
}

export async function askPDFController(req, res) {
  try {
    const { pdfName, question } = req.body;
    console.log("PDF:", pdfName);
    console.log("Question:", question);

    const answer = await askPDF(pdfName, question);
    res.json({ answer });
  } catch (err) {
    console.error("PDF ASK ERROR:");
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}

export async function deletePDFController(req, res) {
  try {
    await deletePDF(req.params.name);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete PDF" });
  }
}

export async function searchPDFController(req, res) {
  try {
    const { q, pdf } = req.query;

    if (!q || !pdf) {
      return res.status(400).json({ error: "Missing required query params: q, pdf" });
    }

    const results = await searchPDFChunks(q, pdf);

    if (results === null) {
      return res.status(404).json({ error: `PDF "${pdf}" not found in memory` });
    }

    res.json({ results });
  } catch (err) {
    console.error("PDF SEARCH ERROR:", err);
    res.status(500).json({ error: err.message });
  }
}

export async function actionPDFController(req, res) {
  try {
    const { pdfName, action } = req.body;

    if (!pdfName || !action) {
      return res.status(400).json({ error: "pdfName and action are required" });
    }

    const resultObj = await executePDFAction(pdfName, action);

    if (resultObj.error) {
      return res.status(resultObj.status || 500).json({ error: resultObj.error });
    }

    res.json(resultObj);
  } catch (err) {
    console.error("PDF ACTION ERROR:", err);
    res.status(500).json({ error: err.message });
  }
}
