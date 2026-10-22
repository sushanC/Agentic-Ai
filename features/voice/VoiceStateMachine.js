/** Authoritative lifecycle for a single voice interaction. */
export const VOICE_STATES = Object.freeze([
  "idle", "starting", "greeting", "listening", "transcribing",
  "thinking", "speaking", "interrupted", "error", "stopping"
]);

const ALLOWED = Object.freeze({
  idle: ["starting"],
  starting: ["greeting", "listening", "error", "stopping", "interrupted"],
  greeting: ["starting", "listening", "error", "stopping", "interrupted"],
  listening: ["transcribing", "interrupted", "error", "stopping"],
  transcribing: ["thinking", "starting", "listening", "idle", "interrupted", "error", "stopping"],
  thinking: ["speaking", "starting", "listening", "idle", "interrupted", "error", "stopping"],
  speaking: ["starting", "listening", "idle", "interrupted", "error", "stopping"],
  interrupted: ["listening", "idle", "starting", "stopping", "error"],
  error: ["idle", "starting", "stopping"],
  stopping: ["idle"]
});

export class VoiceStateMachine {
  constructor(onStateChange = () => {}) {
    this._state = "idle";
    this._onStateChange = onStateChange;
  }

  get state() { return this._state; }

  transitionTo(next) {
    if (!VOICE_STATES.includes(next) || next === this._state) return false;
    if (!ALLOWED[this._state].includes(next)) return false;
    const previous = this._state;
    this._state = next;
    try { this._onStateChange(next, previous); } catch (error) {
      console.error("[VoiceStateMachine] state listener failed", { code: error?.code || "LISTENER_ERROR" });
    }
    return true;
  }

  reset() {
    if (this._state !== "idle") {
      this._state = "idle";
      try { this._onStateChange("idle", "reset"); } catch {}
    }
  }
}
