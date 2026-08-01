/**
 * SceneAnalyzer.js
 *
 * Specialized Vision Analyzer for Scene & Object Understanding.
 */
export class SceneAnalyzer {
  constructor() {
    this.name = "scene";
  }

  getSystemPrompt() {
    return `You are a Visual Scene Understanding AI agent.
Analyze the image and return JSON matching:
{
  "summary": "Full scene description",
  "objects": ["object 1", "object 2"],
  "environment": "indoor / outdoor / office / street",
  "spatialRelationships": ["laptop on top of desk"],
  "activities": ["working on code"]
}
Return valid JSON only.`;
  }

  parse(rawText) {
    try {
      const clean = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(clean);
      return {
        summary: parsed.summary || rawText,
        objects: Array.isArray(parsed.objects) ? parsed.objects : [],
        environment: parsed.environment || "general scene",
        spatialRelationships: Array.isArray(parsed.spatialRelationships) ? parsed.spatialRelationships : [],
        activities: Array.isArray(parsed.activities) ? parsed.activities : [],
      };
    } catch {
      return {
        summary: rawText,
        objects: [],
        environment: "general scene",
        spatialRelationships: [],
        activities: [],
      };
    }
  }
}
