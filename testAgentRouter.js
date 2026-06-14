import "dotenv/config";
import {
  decideTool
} from "./services/agentRouter.js";

console.log(
  await decideTool(
    "My favorite color is blue"
  )
);

console.log(
  await decideTool(
    "Add task study DAA"
  )
);

console.log(
  await decideTool(
    "What is GCD?"
  )
);

console.log(
  await decideTool(
    "Latest AI news"
  )
);

console.log(
  await decideTool(
    "Current React version"
  )
);