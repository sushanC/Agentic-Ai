import path from "path";
import { createJsonFileStore } from "./jsonFile.js";

const store = createJsonFileStore(path.resolve("./dsa_session.json"), {
  fallbackValue: {},
  validate: value => value !== null && typeof value === "object" && !Array.isArray(value),
  mode: 0o600,
});

export const loadDSASession = () => store.read();
export const saveDSASession = session => store.write(session);
