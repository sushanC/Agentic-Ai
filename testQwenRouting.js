import 'dotenv/config';
import { decideModel } from './services/modelRouter.js';
import { resolveModel } from './services/modelRegistry.js';

// Define test cases
const testCases = [
  { name: "Research Query", message: "Research AI trends in 2026", tool: "chat" },
  { name: "Comparison Query", message: "Compare Kubernetes and Docker", tool: "chat" },
  { name: "Summarize PDF", message: "summarize pdf Operating Systems", tool: "chat" },
  { name: "Long Explanation", message: "Explain Kubernetes in technical documentation detail", tool: "chat" },
  { name: "PDF Research", message: "Analyze the database design from the PDF", tool: "chat" }
];

console.log("=== Verification of Qwen Routing ===");
testCases.forEach((tc) => {
  const resolved = decideModel(tc.message, tc.tool);
  console.log(`\nTest: ${tc.name}`);
  console.log(`Query: "${tc.message}" (Tool: ${tc.tool})`);
  console.log(`Mapped Capability: ${resolved.matchedCapability}`);
  console.log(`Resolved Model: ${resolved.name} (${resolved.modelId})`);
  console.log(`Provider: ${resolved.provider}`);
});
