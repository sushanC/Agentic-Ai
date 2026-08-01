/**
 * ChartAnalyzer.js
 *
 * Specialized Vision Analyzer for Charts, Graphs, and Diagrams (bar, line, pie, scatter plots).
 */
export class ChartAnalyzer {
  constructor() {
    this.name = "chart";
  }

  getSystemPrompt() {
    return `You are a Data Visualization & Chart Analysis AI agent.
Analyze the chart image and return JSON matching:
{
  "chartType": "bar | line | pie | scatter | diagram",
  "title": "Chart Title",
  "xAxisLabel": "X Axis",
  "yAxisLabel": "Y Axis",
  "dataPoints": [{"label": "Category A", "value": 100}],
  "trends": "Overall trend explanation",
  "keyTakeaways": ["Sales increased in Q3"]
}
Return valid JSON only.`;
  }

  parse(rawText) {
    try {
      const clean = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(clean);
      return {
        chartType: parsed.chartType || "chart",
        title: parsed.title || "Chart",
        xAxisLabel: parsed.xAxisLabel || "",
        yAxisLabel: parsed.yAxisLabel || "",
        dataPoints: Array.isArray(parsed.dataPoints) ? parsed.dataPoints : [],
        trends: parsed.trends || rawText,
        keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
      };
    } catch {
      return {
        chartType: "chart",
        title: "Chart",
        xAxisLabel: "",
        yAxisLabel: "",
        dataPoints: [],
        trends: rawText,
        keyTakeaways: [],
      };
    }
  }
}
