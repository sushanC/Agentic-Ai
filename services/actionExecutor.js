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
} from "./researchAgent.js";

import {
  getResearch
} from "./researchCache.js";

import {
  extractTasks
} from "./taskExtractor.js";

import {
  addActivity
} from "../storage/activityStorage.js";

import {
  askAI
} from "./ai.js";

import {
  incrementStat
} from "../storage/statsStorage.js";

/**
 * Execute a structured action plan produced
 * by actionPlanner.js.
 *
 * @param {Object} plan - { actions: Array<{ tool, input }> }
 * @returns {Promise<string[]>} - Results for each action
 */
export async function executeActions(plan) {

  if (!plan.actions) {
    return ["❌ Invalid plan format"];
  }

  const results = [];

  console.log("\n⚙️ EXECUTING PLAN:");
  console.log(JSON.stringify(plan, null, 2));

  for (const action of plan.actions) {

    console.log("\n▶ ACTION:");
    console.log(action);

    // =====================
    // RESEARCH
    // =====================

    if (action.tool === "research") {

      const report = await researchTopic(
        action.input
      );

      addActivity(`Researched: ${action.input}`);
      results.push(report);
    }

    // =====================
    // WEB SEARCH
    // =====================

    else if (action.tool === "web_search") {

      try {

        const searchResults =
          await webSearch(action.input);

        const topResults = searchResults
          .slice(0, 3)
          .map(result => `• ${result.title}`)
          .join("\n");

        results.push(
          `🔍 Search Results:\n\n${topResults}`
        );

      } catch (err) {

        console.log(err.message);
        results.push("❌ Search failed");
      }
    }

    // =====================
    // SUMMARIZE
    // =====================

    else if (action.tool === "summarize") {

      const prompt = `
Summarize the following topic clearly and concisely.

Topic: ${action.input}

Format:
- Overview (2-3 sentences)
- Key Points (bullet list)
- Why it matters

Keep it brief and useful.
`;

      const summary = await askAI(prompt, "chat");
      addActivity(`Summarized: ${action.input}`);
      results.push(`📋 Summary:\n\n${summary}`);
    }

    // =====================
    // ANALYZE
    // =====================

    else if (action.tool === "analyze") {

      const prompt = `
Analyze the following and provide insights.

Topic: ${action.input}

Format:
- Analysis
- Pros
- Cons
- Recommendation

Be concise and direct.
`;

      const analysis = await askAI(prompt, "chat");
      addActivity(`Analyzed: ${action.input}`);
      results.push(`🔍 Analysis:\n\n${analysis}`);
    }

    // =====================
    // PLAN
    // =====================

    else if (action.tool === "plan") {

      const prompt = `
Create a clear, structured plan for the following goal.

Goal: ${action.input}

Format:
- Phase 1: ...
- Phase 2: ...
- Phase 3: ...
- Key milestones
- Resources needed

Be practical and actionable.
`;

      const planResult = await askAI(
        prompt,
        "planning"
      );

      addActivity(`Created plan: ${action.input}`);
      results.push(`📅 Plan:\n\n${planResult}`);
    }

    // =====================
    // SAVE NOTE
    // =====================

    else if (action.tool === "save_note") {

      const notes = await loadNotes();

      notes.push({
        id: Date.now(),
        content: action.input
      });

      await saveNotes(notes);
      await incrementStat("notes_saved");
      addActivity(`Saved note`);

      results.push(
        `📝 Note saved: ${action.input}`
      );
    }

    // =====================
    // SAVE RESEARCH NOTE
    // =====================

    else if (action.tool === "save_research_note") {

      const report = getResearch();

      if (!report) {
        results.push(
          "⚠️ No research result to save. Run research first."
        );
        continue;
      }

      const notes = await loadNotes();

      notes.push({
        id: Date.now(),
        content: report
      });

      await saveNotes(notes);
      await incrementStat("notes_saved");
      addActivity(`Saved research note`);

      results.push("📝 Research note saved");
    }

    // =====================
    // CREATE TASK
    // =====================

    else if (action.tool === "create_task") {

      const tasks = await loadTasks();

      tasks.push({
        id: Date.now(),
        text: action.input,
        completed: false
      });

      await saveTasks(tasks);
      await incrementStat("tasks_created");
      addActivity(`Created task: ${action.input}`);

      results.push(
        `✅ Task created: ${action.input}`
      );
    }

    // =====================
    // CREATE STUDY TASKS
    // =====================

    else if (action.tool === "create_study_tasks") {

      const report = getResearch();

      const studyTasks = await extractTasks(report);

      const tasks = await loadTasks();

      for (const task of studyTasks) {

        tasks.push({
          id: Date.now() + Math.random(),
          text: task,
          completed: false
        });
      }

      await saveTasks(tasks);
      await incrementStat("tasks_created");
      addActivity(`Created ${studyTasks.length} study tasks`);

      results.push(
        `✅ ${studyTasks.length} study tasks created`
      );
    }

    // =====================
    // UNKNOWN ACTION
    // =====================

    else {
      results.push(
        `⚠️ Unknown action: ${action.tool}`
      );
    }
  }

  return results;
}