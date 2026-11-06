/** Game state types and pure logic — no DOM access here. */

export type GamePhase = "start" | "playing" | "resetting" | "won";
export type PlayerId = 1 | 2;

export interface Clue {
  id: string;
  loop: number;
  text: string;
  detail: string;
}

export interface GameState {
  phase: GamePhase;
  loop: number;
  timeLeft: number;
  timerHandle: ReturnType<typeof setInterval> | null;

  // Per-loop state (reset each loop)
  paintClicks: number;
  keyVisible: boolean;
  keyHolder: PlayerId | null;  // which player holds the key
  cabinetOpen: boolean;
  laptopDone: boolean;

  // Persistent across loops
  clues: Clue[];
  activePlayer: PlayerId;
}

export const CLUE_DEFS: Record<string, { text: string; detail: string }> = {
  blue4: {
    text: "Blue — 4",
    detail: "a blue object in the room, interact exactly 4 times",
  },
  findyear: {
    text: "Find the year on the photograph",
    detail: "look for a photograph hidden in the room",
  },
  year1998: {
    text: "The year is 1998",
    detail: "enter 1998 on the laptop to unlock the exit",
  },
};

export const CODE_ANSWER = "1998";
export const LOOP_DURATION = 90;

export function makeState(): GameState {
  return {
    phase: "start",
    loop: 1,
    timeLeft: LOOP_DURATION,
    timerHandle: null,
    paintClicks: 0,
    keyVisible: false,
    keyHolder: null,
    cabinetOpen: false,
    laptopDone: false,
    clues: [],
    activePlayer: 1,
  };
}

export function hasClue(state: GameState, id: string): boolean {
  return state.clues.some((c) => c.id === id);
}

export function addClue(state: GameState, id: string): boolean {
  if (hasClue(state, id)) return false;
  const def = CLUE_DEFS[id];
  if (!def) return false;
  state.clues.push({ id, loop: state.loop, text: def.text, detail: def.detail });
  return true;
}

export function resetLoop(state: GameState): void {
  if (state.timerHandle !== null) {
    clearInterval(state.timerHandle);
    state.timerHandle = null;
  }
  state.loop += 1;
  state.timeLeft = LOOP_DURATION;
  state.paintClicks = 0;
  state.keyVisible = false;
  state.keyHolder = null;
  state.cabinetOpen = false;
  state.laptopDone = false;
  // clues and activePlayer persist across loops
}

export function switchPlayer(state: GameState): void {
  state.activePlayer = state.activePlayer === 1 ? 2 : 1;
}
