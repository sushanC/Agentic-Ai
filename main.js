import 'dotenv/config';
import { GoogleGenAI } from "@google/genai";
import fs from 'fs/promises';

const ai = new GoogleGenAI({
  apiKey: process.env.API_KEY
});

async function main() {
  const tasks = await fs.readFile("./tasks.txt", "utf-8");

  const prompt = `
You are a personal productivity assistant.

Given the following tasks:

${tasks}

Return:
1. High Priority
2. Medium Priority
3. Low Priority

Also explain why each task was placed in that category.
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  console.log(response.text);

  await fs.writeFile(
    "./sorted_tasks.txt",
    response.text
  );

  console.log("Tasks saved successfully.");
}

main();