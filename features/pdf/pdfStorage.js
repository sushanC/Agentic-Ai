import { getStoragePath } from "../../storage/storagePath.js";
import { createJsonFileStore } from "../../storage/jsonFile.js";

const store = createJsonFileStore(getStoragePath("pdf_memory.json"), {
  fallbackValue: {},
  validate: value => value !== null && typeof value === "object" && !Array.isArray(value),
  mode: 0o600,
});

export const loadPDFMemory = () => store.read();
export const savePDFMemory = memory => store.write(memory);
export const updatePDFMemory = updater => store.update(updater);

export async function deletePDF(pdfName) {
  await store.update(memory => {
    delete memory[pdfName];
    return memory;
  });
}
