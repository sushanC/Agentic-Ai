/**
 * SelectionDiagnostics.js — Model Selection Engine
 *
 * Phase 8 — Formats and emits a structured decision log after every model
 * selection. Backend logs only — zero frontend impact.
 *
 * Output format:
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *   [MSE] Intent      : Programming (confidence: 0.85)
 *   [MSE] Candidates  : 5 evaluated, 3 available
 *   ─────────────────────────────────────────────
 *   [MSE] gemini      Score:  74  Health: 88%  Latency: Fast     Cap: 65%  ✅
 *   [MSE] deepseek    Score:  97  Health: 99%  Latency: Medium   Cap: 100% ✅ ← SELECTED
 *   [MSE] gpt-oss     Score:  41  Health: 95%  Latency: Medium   Cap: 20%  ✅
 *   [MSE] qwen        ❌ CoolingDown (429, 45s left)
 *   [MSE] ollama      ❌ Disabled
 *   ─────────────────────────────────────────────
 *   [MSE] Selected    : deepseek (Score: 97)
 *   [MSE] Reason      : Highest weighted score for Programming intent
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

const COL_WIDTH_KEY = 14;
const DIVIDER_SHORT = "  ─────────────────────────────────────────────────────────────";
const DIVIDER_FULL  = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

/** Left-pad a string to a fixed width */
function padRight(str, width) {
  return String(str).padEnd(width, " ");
}

/** Format latency tier to display string */
function fmtLatency(tier) {
  const map = {
    very_fast: "VeryFast",
    fast:      "Fast    ",
    medium:    "Medium  ",
    slow:      "Slow    ",
    variable:  "Variable",
    unknown:   "Unknown ",
  };
  return map[tier] || "Unknown ";
}

/** Format a cooldown duration in seconds */
function fmtCooldown(ms) {
  if (ms === Infinity) return "permanent";
  if (ms <= 0) return "0s";
  return `${Math.ceil(ms / 1000)}s`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} DiagnosticsInput
 * @property {string}  intent            - Primary intent string
 * @property {number}  confidence        - IntentDetector confidence
 * @property {string|null} secondaryIntent
 * @property {string}  capability        - Resolved capability key
 * @property {Array}   allCandidates     - Full candidate list from CandidateBuilder
 * @property {Array}   availabilityResults - Results from AvailabilityFilter.filterAvailable()
 * @property {Array}   capabilityResults - Results from CapabilityFilter.filterByCapability()
 * @property {Array}   scoredCandidates  - [{candidate, score, breakdown}] — sorted
 * @property {object}  selected          - The winning CandidateModel
 * @property {string}  selectionReason   - Human-readable reason
 * @property {string|null} overrideApplied - model key if user override was used
 */

/**
 * Log a complete MSE decision diagnostic to the backend console.
 *
 * @param {DiagnosticsInput} input
 */
export function logSelectionDiagnostics(input) {
  const {
    intent,
    confidence,
    secondaryIntent,
    capability,
    allCandidates,
    availabilityResults,
    scoredCandidates,
    selected,
    selectionReason,
    overrideApplied,
  } = input;

  const totalCandidates  = allCandidates.length;
  const availableCount   = scoredCandidates.length;
  const confidenceStr    = confidence != null ? ` (confidence: ${confidence.toFixed(2)})` : "";
  const secondaryStr     = secondaryIntent ? ` | secondary: ${secondaryIntent}` : "";

  // Build a quick lookup of scored candidates by key
  const scoreMap = {};
  for (const sc of (scoredCandidates || [])) {
    scoreMap[sc.candidate.key] = sc;
  }

  // Build a lookup for availability results
  const availMap = {};
  for (const ar of (availabilityResults || [])) {
    availMap[ar.candidate.key] = ar;
  }

  console.log("\n" + DIVIDER_FULL);
  console.log(`  [MSE] Intent      : ${intent}${confidenceStr}${secondaryStr}`);
  console.log(`  [MSE] Capability  : ${capability}`);
  console.log(`  [MSE] Candidates  : ${totalCandidates} evaluated, ${availableCount} available`);
  if (overrideApplied) {
    console.log(`  [MSE] Override    : User override applied → ${overrideApplied}`);
  }
  console.log(DIVIDER_SHORT);

  // Print every candidate with its status
  for (const candidate of allCandidates) {
    const key = candidate.key;
    const pad = padRight(key, COL_WIDTH_KEY);
    const avail = availMap[key];

    if (avail && !avail.available) {
      const cooldown = avail.cooldownRemainingMs
        ? ` (${fmtCooldown(avail.cooldownRemainingMs)} remaining)`
        : "";
      console.log(`  [MSE] ${pad} ❌ ${avail.rejectionReason}${cooldown}`);
      continue;
    }

    const sc = scoreMap[key];
    if (!sc) {
      // Passed availability but filtered by capability
      console.log(`  [MSE] ${pad} ⚠️  Filtered (UnsupportedCapability)`);
      continue;
    }

    const { score, breakdown } = sc;
    const isSelected = selected && selected.key === key;
    const selectedMark = isSelected ? " ← SELECTED" : "";
    const healthStr = `${breakdown.health}%`.padStart(4);
    const latencyStr = fmtLatency(candidate.latencyTier || candidate.latency);
    const capStr = `${breakdown.capability}%`.padStart(4);
    const scoreStr = String(score).padStart(3);

    console.log(
      `  [MSE] ${pad} ✅  Score: ${scoreStr}  Health: ${healthStr}  Latency: ${latencyStr}  Cap: ${capStr}${selectedMark}`
    );
  }

  console.log(DIVIDER_SHORT);
  if (selected) {
    console.log(`  [MSE] Selected    : ${selected.displayName} (key: ${selected.key}, Score: ${scoreMap[selected.key]?.score ?? "N/A"})`);
    console.log(`  [MSE] Reason      : ${selectionReason}`);
    console.log(`  [MSE] Model ID    : ${selected.modelId}`);
    console.log(`  [MSE] Provider    : ${selected.provider}`);
  } else {
    console.log(`  [MSE] Selected    : ⚠️  NONE — falling back to registry default`);
    console.log(`  [MSE] Reason      : ${selectionReason}`);
  }
  console.log(DIVIDER_FULL + "\n");
}

/**
 * Build a machine-readable diagnostics summary (for attaching to responses or debugging APIs).
 *
 * @param {DiagnosticsInput} input
 * @returns {object}
 */
export function buildDiagnosticsSummary(input) {
  const { intent, confidence, capability, scoredCandidates, selected, selectionReason, overrideApplied } = input;

  return {
    intent,
    confidence,
    capability,
    selected: selected ? {
      key:         selected.key,
      displayName: selected.displayName,
      provider:    selected.provider,
      modelId:     selected.modelId,
    } : null,
    reason: selectionReason,
    overrideApplied: overrideApplied || null,
    candidates: (scoredCandidates || []).map(sc => ({
      key:        sc.candidate.key,
      score:      sc.score,
      health:     sc.breakdown.health,
      latency:    sc.breakdown.latency,
      capability: sc.breakdown.capability,
    })),
  };
}
