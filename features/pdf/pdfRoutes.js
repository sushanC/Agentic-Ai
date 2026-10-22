import express from "express";
import multer from "multer";
import fs from "node:fs/promises";
import { getStoragePath } from "../../storage/storagePath.js";
import {
  uploadPDF,
  listPDFs,
  askPDFController,
  deletePDFController,
  searchPDFController,
  actionPDFController
} from "./pdfController.js";

export const PDF_UPLOAD_LIMITS = Object.freeze({ fileSize: 10 * 1024 * 1024, files: 1, fields: 20, fieldSize: 64 * 1024 });

export function createPdfUploadMiddleware({ destination = getStoragePath("uploads") } = {}) {
  const storage = multer.diskStorage({
    destination(_req, _file, callback) {
      fs.mkdir(destination, { recursive: true, mode: 0o700 })
        .then(async () => {
          const stat = await fs.lstat(destination);
          if (!stat.isDirectory()) throw new Error("PDF upload path must be a real directory.");
          await fs.chmod(destination, 0o700);
        })
        .then(() => callback(null, destination), callback);
    },
  });
  const upload = multer({
    storage,
    limits: PDF_UPLOAD_LIMITS,
    fileFilter(_req, file, callback) {
      if (file.mimetype !== "application/pdf" || !/\.pdf$/i.test(file.originalname || "")) {
        const error = new Error("Only PDF uploads are accepted.");
        error.code = "UPLOAD_TYPE_INVALID";
        return callback(error);
      }
      callback(null, true);
    },
  });
  return upload.single("pdf");
}

const router = express.Router();

router.post("/upload", createPdfUploadMiddleware(), uploadPDF);
router.get("/list", listPDFs);
router.post("/ask", askPDFController);
router.delete("/:name", deletePDFController);
router.get("/search", searchPDFController);
router.post("/action", actionPDFController);

export default router;
