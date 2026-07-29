/**
 * VoiceStateMachine.js
 *
 * Manages the state transitions for the Jarvis voice assistant.
 * States: 'idle', 'listening', 'processing', 'speaking', 'error'.
 */
export class VoiceStateMachine {
  /**
   * @param {function(string, string)} onStateChange - Callback (newState, oldState)
   */
  constructor(onStateChange) {
    this._state = "idle";
    this._onStateChange = onStateChange || (() => {});
  }

  /**
   * Get the current state.
   * @returns {string}
   */
  get state() {
    return this._state;
  }

  /**
   * Transition to a new state if valid.
   * Any state can transition to 'idle' or 'error' for recovery/reset.
   * @param {string} newState
   * @returns {boolean} - True if transition was successful
   */
  transitionTo(newState) {
    const oldState = this._state;
    if (oldState === newState) return false;

    const validTransitions = {
      idle: ["listening"],
      listening: ["processing", "idle"],
      processing: ["speaking", "error", "idle"],
      speaking: ["listening", "processing", "idle"],
      error: ["idle"]
    };

    const isAllowed =
      newState === "idle" ||
      newState === "error" ||
      (validTransitions[oldState] && validTransitions[oldState].includes(newState));

    if (!isAllowed) {
      console.warn(`[VoiceStateMachine] Invalid state transition: ${oldState} -> ${newState}`);
      return false;
    }

    this._state = newState;
    console.log(`[VoiceStateMachine] State changed: ${oldState.toUpperCase()} -> ${newState.toUpperCase()}`);

    try {
      this._onStateChange(newState, oldState);
    } catch (err) {
      console.error("[VoiceStateMachine] Error in state change listener:", err);
    }

    return true;
  }

  /**
   * Reset the state machine to idle.
   */
  reset() {
    this.transitionTo("idle");
  }
}
