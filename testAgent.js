import "dotenv/config";
import {
  decideTool
} from "./services/agentRouter.js";

const result =
  await decideTool(
    "What is deadlock?"
  );

console.log(result);