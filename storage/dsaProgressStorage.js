import path from "path";
import { createJsonFileStore } from "./jsonFile.js";

const store = createJsonFileStore(path.resolve("./dsa_progress.json"), {
  fallbackValue: {},
  validate: value => value !== null && typeof value === "object" && !Array.isArray(value),
  mode: 0o600,
});

export const loadDSAProgress = () => store.read();
export const saveDSAProgress = progress => store.write(progress);
