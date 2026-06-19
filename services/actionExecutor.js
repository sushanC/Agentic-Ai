import {
  loadNotes,
  saveNotes
} from "../storage/notesStorage.js";

import {
  loadTasks,
  saveTasks
} from "../storage/tasksStorage.js";

import {
  webSearch
} from "./webSearchService.js";

import {
  researchTopic
}
from "./researchAgent.js";

import {
  getResearch
}
from "./researchCache.js";

import {
  extractTasks
}
from "./taskExtractor.js";

import {
  addActivity
}
from "../storage/activityStorage.js";


export async function executeActions(
  plan
) {

  if (!plan.actions) {

  return [
    "❌ Invalid plan format"
  ];
}

  const results = [];

  console.log(
    "\n⚙️ EXECUTING PLAN:"
  );

  console.log(
    JSON.stringify(
      plan,
      null,
      2
    )
  );

  for (
    const action
    of plan.actions
  ) {

    console.log(
      "\n▶ ACTION:"
    );

    console.log(
      action
    );

if (
  action.tool ===
  "research"
) {

  const report =
    await researchTopic(
      action.input
    );

  results.push(
    report
  );
}

    else if (
      action.tool ===
      "save_note"
    ) {

      const notes =
        await loadNotes();

      notes.push({

        id: Date.now(),

        content:
          action.input
      });

      await saveNotes(
        notes
      );

      results.push(
        `📝 Note saved: ${action.input}`
      );
    }

    else if (
      action.tool ===
      "create_task"
    ) {

      const tasks =
        await loadTasks();

      tasks.push({

        id: Date.now(),

        text:
          action.input,

        completed:
          false
      });

      await saveTasks(
        tasks
      );

      results.push(
        `✅ Task created: ${action.input}`
      );
    }

else if (
  action.tool ===
  "web_search"
) {

  try {

    const searchResults =
      await webSearch(
        action.input
      );

    const topResults =
      searchResults
        .slice(0, 3)
        .map(
          result =>
            `• ${result.title}`
        )
        .join("\n");

    results.push(
      `🔍 Search Results:\n\n${topResults}`
    );

  } catch (err) {

    console.log(
      err.message
    );

    results.push(
      "❌ Search failed"
    );
  }
}

    else if (
  action.tool ===
  "save_research_note"
) {

  const report =
    getResearch();

  const notes =
    await loadNotes();

  notes.push({

    id: Date.now(),

    content:
      report
  });

  await saveNotes(
    notes
  );

  results.push(
    "📝 Research note saved"
  );
}   

    else if (
  action.tool ===
  "create_study_tasks"
) {

  const report =
    getResearch();

  const studyTasks =
    await extractTasks(
      report
    );

  const tasks =
    await loadTasks();

  for (
    const task
    of studyTasks
  ) {

    tasks.push({

      id: Date.now()
        + Math.random(),

      text: task,

      completed: false
    });
  }

  await saveTasks(
    tasks
  );

  results.push(
    `✅ ${studyTasks.length} study tasks created`
  );
}

    else {

      results.push(
        `⚠️ Unknown action: ${action.tool}`
      );
    }
  }

  return results;
}