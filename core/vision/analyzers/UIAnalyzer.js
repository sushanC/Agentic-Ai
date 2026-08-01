/**
 * UIAnalyzer.js
 *
 * Specialized Vision Analyzer for User Interface (UI) Screenshots.
 * Detects buttons, menus, input forms, dialogs, icons, layout structures,
 * and suggests actionable recommendations.
 */
export class UIAnalyzer {
  constructor() {
    this.name = "ui";
  }

  getSystemPrompt() {
    return `You are an expert User Interface (UI/UX) & Desktop/Web Automation AI.
Analyze the provided UI screenshot and return JSON matching:
{
  "summary": "Overall UI layout description",
  "detectedElements": {
    "buttons": ["button 1", "button 2"],
    "inputs": ["search field", "email input"],
    "menus": ["navigation bar", "settings dropdown"],
    "dialogs": ["confirmation modal"],
    "icons": ["trash icon", "settings icon"]
  },
  "layout": "Grid / Flexbox / Sidebar description",
  "recommendations": ["Click 'Submit' button", "Fill email field"],
  "possibleIssues": ["Hidden modal", "Disabled submit button"]
}
Return valid JSON only.`;
  }

  parse(rawText) {
    try {
      const clean = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(clean);
      return {
        summary: parsed.summary || rawText,
        detectedElements: parsed.detectedElements || { buttons: [], inputs: [], menus: [], dialogs: [], icons: [] },
        layout: parsed.layout || "Standard UI",
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
        possibleIssues: Array.isArray(parsed.possibleIssues) ? parsed.possibleIssues : [],
      };
    } catch {
      return {
        summary: rawText,
        detectedElements: { buttons: [], inputs: [], menus: [], dialogs: [], icons: [] },
        layout: "Standard UI",
        recommendations: [],
        possibleIssues: [],
      };
    }
  }
}
