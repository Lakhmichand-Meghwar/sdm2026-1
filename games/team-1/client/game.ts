/** Game state types and pure logic — no DOM access here. */

export type GamePhase = "start" | "intro" | "briefing" | "playing" | "resetting" | "won";
export type PlayerId = 1 | 2;

export interface LevelDef {
  id: number;
  name: string;
  duration: number;
  penalty: number;
  story: string;
  rule: string;
}

export const LEVELS: readonly LevelDef[] = [
  {
    id: 1,
    name: "The Office",
    duration: 90,
    penalty: 0,
    story: "A rain-soaked detective office. The exit is locked behind a laptop.",
    rule: "Find the year and unlock the exit door.",
  },
  {
    id: 2,
    name: "The Archive",
    duration: 80,
    penalty: 5,
    story: "Rows of shelves and a locked filing cabinet. Someone left a case open.",
    rule: "New: a wrong move now costs 5 seconds.",
  },
  {
    id: 3,
    name: "The Vault",
    duration: 70,
    penalty: 5,
    story: "No windows, no lights. The safe holds the way out.",
    rule: "Restore power first. You will need something you learned in the first room.",
  },
];

export interface Clue {
  id: string;
  level: number;
  loop: number;
  text: string;
  detail: string;
}

export interface GameState {
  phase: GamePhase;
  level: number;
  loop: number;
  totalLoops: number;
  timeLeft: number;
  timerHandle: ReturnType<typeof setInterval> | null;

  // Per-loop state (reset each loop)
  paintClicks: number;
  keyVisible: boolean;
  keyHolder: PlayerId | null;
  cabinetOpen: boolean;
  laptopDone: boolean;
  shelfStep: number;
  archiveCabinetOpen: boolean;
  archiveDone: boolean;
  switches: boolean[];
  powered: boolean;
  safeOpen: boolean;

  // Persistent across loops and levels
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
  shelforder: {
    text: "Books: blue, red, green, amber",
    detail: "index card in the archive",
  },
  day17: {
    text: "Day: 17",
    detail: "circled on the wall calendar",
  },
  month04: {
    text: "Month: 04",
    detail: "case folder in the filing cabinet",
  },
  switchpattern: {
    text: "Switches: up, down, up, up",
    detail: "poster in the vault",
  },
  safecode: {
    text: "Safe code: the photo year, reversed",
    detail: "vault terminal",
  },
};

export type CodeKind = "laptop" | "archive" | "vault";

export const CODES: Record<CodeKind, string> = {
  laptop: "1998",
  archive: "0417",
  vault: "8991",
};

export const SHELF_COLORS = ["red", "blue", "green", "amber"] as const;
export const SHELF_ORDER: readonly number[] = [1, 0, 2, 3];
export const SWITCH_TARGET: readonly boolean[] = [true, false, true, true];

export function levelDef(level: number): LevelDef {
  const def = LEVELS[level - 1];
  if (!def) throw new Error(`unknown level ${level}`);
  return def;
}

export function makeState(): GameState {
  return {
    phase: "start",
    level: 1,
    loop: 1,
    totalLoops: 0,
    timeLeft: levelDef(1).duration,
    timerHandle: null,
    paintClicks: 0,
    keyVisible: false,
    keyHolder: null,
    cabinetOpen: false,
    laptopDone: false,
    shelfStep: 0,
    archiveCabinetOpen: false,
    archiveDone: false,
    switches: [false, false, false, false],
    powered: false,
    safeOpen: false,
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
  state.clues.push({ id, level: state.level, loop: state.loop, text: def.text, detail: def.detail });
  return true;
}

function clearRoom(state: GameState): void {
  state.paintClicks = 0;
  state.keyVisible = false;
  state.keyHolder = null;
  state.cabinetOpen = false;
  state.laptopDone = false;
  state.shelfStep = 0;
  state.archiveCabinetOpen = false;
  state.archiveDone = false;
  state.switches = [false, false, false, false];
  state.powered = false;
  state.safeOpen = false;
}

export function stopTimer(state: GameState): void {
  if (state.timerHandle !== null) {
    clearInterval(state.timerHandle);
    state.timerHandle = null;
  }
}

/** Time ran out: the room resets, clues stay. */
export function resetLoop(state: GameState): void {
  stopTimer(state);
  state.loop += 1;
  state.totalLoops += 1;
  state.timeLeft = levelDef(state.level).duration;
  clearRoom(state);
}

/** The exit was reached: move to the next room. Returns false after the last level. */
export function advanceLevel(state: GameState): boolean {
  stopTimer(state);
  state.totalLoops += 1;
  if (state.level >= LEVELS.length) return false;
  state.level += 1;
  state.loop = 1;
  state.timeLeft = levelDef(state.level).duration;
  clearRoom(state);
  return true;
}

export function switchPlayer(state: GameState): void {
  state.activePlayer = state.activePlayer === 1 ? 2 : 1;
}

export type BookResult = "correct" | "solved" | "wrong";

/** Pull a book in the archive. A wrong book starts the sequence over. */
export function pullBook(state: GameState, book: number): BookResult {
  if (SHELF_ORDER[state.shelfStep] !== book) {
    state.shelfStep = 0;
    return "wrong";
  }
  state.shelfStep += 1;
  if (state.shelfStep === SHELF_ORDER.length) {
    state.keyVisible = true;
    return "solved";
  }
  return "correct";
}

/** Flip a vault switch. Returns true once the pattern powers the vault. */
export function toggleSwitch(state: GameState, index: number): boolean {
  state.switches[index] = !state.switches[index];
  state.powered = SWITCH_TARGET.every((on, i) => state.switches[i] === on);
  return state.powered;
}

export function checkCode(kind: CodeKind, value: string): boolean {
  return CODES[kind] === value;
}

export function resetCount(state: GameState): number {
  return state.totalLoops - LEVELS.length;
}
