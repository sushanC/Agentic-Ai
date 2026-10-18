import path from "path";
import { createJsonFileStore } from "./jsonFile.js";

const store = createJsonFileStore(path.resolve("./ai_mode.json"), {
  fallbackValue: { provider: "groq" },
  validate: value => value !== null && typeof value === "object" && !Array.isArray(value),
  mode: 0o600,
});

export const loadAIMode = () => store.read();
export const saveAIMode = mode => store.write(mode);
