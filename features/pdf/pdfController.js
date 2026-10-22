import { loadPDFMemory, deletePDF } from "./pdfStorage.js";
import { askPDF } from "./pdfRetriever.js";
import { searchPDFChunks } from "./pdfSearch.js";
import { uploadAndProcessPDF, executePDFAction } from "./pdfService.js";
import { logSafeError } from "../../services/httpSecurity.js";
import fs from "node:fs/promises";

export async function uploadPDF(req, res) {
  if (!req.file) return res.status(400).json({ error: "A PDF file is required." });
  try {
    const header = await fs.open(req.file.path, "r");
    let signature;
    try {
      const bytes = Buffer.alloc(5);
      const { bytesRead } = await header.read(bytes, 0, 5, 0);
      signature = bytes.subarray(0, bytesRead).toString("ascii");
    } finally {
      await header.close();
    }
    if (signature !== "%PDF-") return res.status(400).json({ error: "Uploaded file is not a valid PDF." });
    const result = await uploadAndProcessPDF(req.file.path, req.file.originalname);
    res.json(result);
  } catch (err) {
    logSafeError("PDF upload failed", err);
    if (err.code === "PDF_TOO_MANY_PAGES") return res.status(400).json({ error: "PDF exceeds the 100-page processing limit." });
    if (err.code === "PDF_OCR_PAGE_LIMIT") return res.status(400).json({ error: "Scanned PDF exceeds the 25-page OCR limit." });
    res.status(500).json({ error: "Upload failed" });
  } finally {
    await fs.unlink(req.file.path).catch(() => {});
  }
}

export async function listPDFs(req, res) {
  const memory = await loadPDFMemory();
  res.json(Object.keys(memory));
}

export async function askPDFController(req, res) {
  try {
    const { pdfName, question } = req.body;

    const answer = await askPDF(pdfName, question);
    res.json({ answer });
  } catch (err) {
    logSafeError("PDF question failed", err);
    res.status(500).json({ error: "PDF question failed." });
  }
}

export async function deletePDFController(req, res) {
  try {
    await deletePDF(req.params.name);
    res.json({ success: true });
  } catch (err) {
    logSafeError("PDF deletion failed", err);
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
    logSafeError("PDF search failed", err);
    res.status(500).json({ error: "PDF search failed." });
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
    logSafeError("PDF action failed", err);
    res.status(500).json({ error: "PDF action failed." });
  }
}
