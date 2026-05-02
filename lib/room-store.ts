import type { RoomState } from "./types";
import { createInitialState } from "./room-engine";

declare global {
  // eslint-disable-next-line no-var
  var __team_manager_state: RoomState | undefined;
}

export function getRoomState(): RoomState {
  if (!globalThis.__team_manager_state) {
    globalThis.__team_manager_state = createInitialState();
  }

  return globalThis.__team_manager_state;
}

export function setRoomState(state: RoomState): RoomState {
  globalThis.__team_manager_state = state;
  return state;
}

export function resetRoomState(): RoomState {
  globalThis.__team_manager_state = createInitialState();
  return globalThis.__team_manager_state;
}
