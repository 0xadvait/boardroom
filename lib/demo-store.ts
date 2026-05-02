import type { DemoState } from "./types";
import { createInitialState } from "./demo-engine";

declare global {
  // eslint-disable-next-line no-var
  var __boardroom_state: DemoState | undefined;
}

export function getDemoState(): DemoState {
  if (!globalThis.__boardroom_state) {
    globalThis.__boardroom_state = createInitialState();
  }

  return globalThis.__boardroom_state;
}

export function setDemoState(state: DemoState): DemoState {
  globalThis.__boardroom_state = state;
  return state;
}

export function resetDemoState(): DemoState {
  globalThis.__boardroom_state = createInitialState();
  return globalThis.__boardroom_state;
}
