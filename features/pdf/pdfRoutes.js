import express from "express";
import multer from "multer";
import {
  uploadPDF,
  listPDFs,
  askPDFController,
  deletePDFController,
  searchPDFController,
  actionPDFController
} from "./pdfController.js";

const upload = multer({ dest: "uploads/" });
const router = express.Router();

router.post("/upload", upload.single("pdf"), uploadPDF);
router.get("/list", listPDFs);
router.post("/ask", askPDFController);
router.delete("/:name", deletePDFController);
router.get("/search", searchPDFController);
router.post("/action", actionPDFController);

export default router;
