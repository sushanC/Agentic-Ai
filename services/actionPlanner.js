import { askModelCie } from "./ai.js";

/**
 * actionPlanner.js
 *
 * Takes a user request and returns a structured
 * action plan as JSON for actionExecutor to run.
 *
 * Available actions:
 *   research              — search the web and synthesize a report
 *   web_search            — raw web search results
 *   summarize             — summarize a topic or content
 *   analyze               — analyze content or data
 *   plan                  — create a structured plan or roadmap
 *   save_note             — save specific text as a note
 *   save_research_note    — save the last research result as a note
 *   create_task           — create a single task
 *   create_study_tasks    — extract and create multiple study tasks
 *   memory_lookup         — retrieve from memory
 *   pdf_search            — search uploaded PDFs
 *   email_draft           — prepare an email draft for user confirmation (Phase 3)
 *   deep_research         — execute autonomous multi-step deep research
 *   code_analysis         — analyze, debug, refactor, or generate unit tests for code
 *   vision_analysis       — perform OCR and multimodal vision reasoning on images/screenshots
 *
 *   --- Phase 2: Desktop Control ---
 *   desktop_open_app      — open/launch an application by name (e.g. VS Code, Chrome, Terminal)
 *   desktop_open_folder   — open a folder in the file manager
 *   desktop_open_file     — open a file with the default app
 *   desktop_open_url      — open a URL in the browser
 *   desktop_search_files  — search for files by name, type, size, date
 *   desktop_take_screenshot — take a screenshot (full screen or active window)
 *   desktop_clipboard     — get or set clipboard contents
 *   desktop_volume        — get or set system volume level
 *   desktop_brightness    — get or set screen brightness level
 *   desktop_system_info   — get OS, hostname, platform, architecture info
 *   desktop_battery       — get battery level and charging status
 *   desktop_cpu           — get current CPU usage percentage
 *   desktop_memory        — get RAM usage statistics
 *   desktop_disk          — get disk usage statistics
 *   desktop_network       — get network connection status
 *   desktop_lock          — lock the screen (HIGH risk — requires confirmation)
 *   desktop_sleep         — put the computer to sleep (HIGH risk — requires confirmation)
 *   desktop_restart       — restart the computer (HIGH risk — requires confirmation)
 *   desktop_shutdown      — shut down the computer (HIGH risk — requires confirmation)
 *   desktop_create_folder — create a new folder at a given path
 *   desktop_copy_file     — copy a file to a destination (MEDIUM risk)
 *   desktop_move_file     — move a file to a destination (MEDIUM risk)
 *   desktop_delete_file   — permanently delete a file (HIGH risk — requires confirmation)
 *   desktop_rename_file   — rename a file (MEDIUM risk)
 *   desktop_duplicate_file — duplicate a file (MEDIUM risk)
 *   desktop_zip           — compress files into a zip archive
 *   desktop_unzip         — extract a zip archive
 *   desktop_reveal_file   — reveal a file in the file manager
 *   desktop_metadata      — get metadata (size, dates, type) of a file
 */
export async function planActions(
  message
) {

  console.log("\n🧠 PLANNING:");
  console.log(message);

  try {

    const response = await askModelCie("groq", message, "ActionPlanning");

    console.log("\n📋 RAW PLAN:");
    console.log(response);

    const cleaned = response
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const plan = JSON.parse(cleaned);

    if (!plan.actions) {
      return { actions: [plan] };
    }

    return plan;

  } catch (err) {

    console.log("\n❌ PLANNER ERROR:");
    console.log(err);

    return { actions: [] };
  }
}