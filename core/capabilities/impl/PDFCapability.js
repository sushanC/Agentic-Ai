import { BaseCapability } from "../BaseCapability.js";
import { CapabilityResult } from "../CapabilityResult.js";
import { ContextAssembly } from "../../context/ContextAssembly.js";
import { askPDF } from "../../../features/pdf/index.js";

/**
 * PDFCapability.js
 *
 * Handles PDF search and document question answering.
 */
export class PDFCapability extends BaseCapability {
  constructor() {
    super("pdf", "PDF Document Capability", 82);
  }

  canHandle(context) {
    if (context.includesAny("pdf", "in the document", "uploaded pdf", "search pdf")) {
      return 0.85;
    }
    return 0.0;
  }

  async execute(context) {
    const pdfName = await ContextAssembly.findBestPDF(context.prompt);
    if (!pdfName) {
      return CapabilityResult.create({
        success: false,
        capability: this.name,
        tool: "pdf",
        answer: "No PDFs uploaded yet. Please upload a PDF first.",
        executedSteps: [{ name: "pdf_search", status: "failed" }],
      });
    }

    const answer = await askPDF(pdfName, context.prompt);
    return CapabilityResult.create({
      capability: this.name,
      tool: "pdf",
      answer,
      executedSteps: [{ name: "pdf_search", status: "completed" }],
    });
  }
}
