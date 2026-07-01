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
  }
};

export function getContextConfig(intent) {
  return INTENT_CONFIGS[intent] || INTENT_CONFIGS.GeneralChat;
}
