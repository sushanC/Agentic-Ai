export const INTENT_CONFIGS = {
  Greeting: {
    includeMemory: false,
    summaryLevel: "None", // None, Short, Medium, Long
    historyLimit: 0
  },
  GeneralChat: {
    includeMemory: true,
    summaryLevel: "Medium",
    historyLimit: 10
  },
  Programming: {
    includeMemory: true,
    memoryKeys: ["programming_languages", "favorite_technologies", "favorite_database", "favorite_framework"],
    summaryLevel: "Short",
    historyLimit: 3
  },
  Memory: {
    includeMemory: true,
    semanticMemoryOnly: true,
    summaryLevel: "None",
    historyLimit: 2
  },
  Email: {
    includeMemory: true,
    memoryKeys: ["contacts", "name", "email_preferences", "email_context"],
    summaryLevel: "Short",
    historyLimit: 4
  },
  Research: {
    includeMemory: false,
    summaryLevel: "Medium",
    historyLimit: 2
  },
  Planning: {
    includeMemory: true,
    memoryKeys: ["goals", "tasks", "notes"],
    summaryLevel: "Medium",
    historyLimit: 5
  },
  PDF: {
    includeMemory: false,
    summaryLevel: "None",
    historyLimit: 3
  },
  Vision: {
    includeMemory: false,
    summaryLevel: "None",
    historyLimit: 2
  },
  WebSearch: {
    includeMemory: false,
    summaryLevel: "Short",
    historyLimit: 2
  },
  Filesystem: {
    includeMemory: true,
    memoryKeys: ["working_directory", "terminal_preferences"],
    summaryLevel: "Short",
    historyLimit: 3
  },
  Browser: {
    includeMemory: false,
    summaryLevel: "Short",
    historyLimit: 3
  },
  Calendar: {
    includeMemory: true,
    memoryKeys: ["calendar_events", "schedule_preferences"],
    summaryLevel: "Short",
    historyLimit: 3
  },
  ToolCalling: {
    includeMemory: true,
    semanticMemoryOnly: true,
    summaryLevel: "Short",
    historyLimit: 4
  },
  AgentWorkflow: {
    includeMemory: true,
    semanticMemoryOnly: true,
    summaryLevel: "Medium",
    historyLimit: 8
  },
  Summary: {
    includeMemory: false,
    summaryLevel: "None",
    historyLimit: 100
  },
  MemoryExtraction: {
    includeMemory: false,
    summaryLevel: "None",
    historyLimit: 0
  },
  ActionPlanning: {
    includeMemory: false,
    summaryLevel: "None",
    historyLimit: 0
  },
  ToolRouting: {
    includeMemory: false,
    summaryLevel: "None",
    historyLimit: 0
  },
  EmailDraft: {
    includeMemory: true,
    memoryKeys: ["contacts", "name", "user_name"],
    summaryLevel: "Short",
    historyLimit: 4
  },
  EmailExtraction: {
    includeMemory: false,
    summaryLevel: "None",
    historyLimit: 0
  }
};

export function getContextConfig(intent) {
  // Normalize intent names in case they match tool names
  const normalized = intent === "summary" ? "Summary" :
                     intent === "memory_extraction" ? "MemoryExtraction" :
                     intent === "planning" ? "Planning" :
                     intent === "agent" ? "AgentWorkflow" :
                     intent;
  return INTENT_CONFIGS[normalized] || INTENT_CONFIGS.GeneralChat;
}
