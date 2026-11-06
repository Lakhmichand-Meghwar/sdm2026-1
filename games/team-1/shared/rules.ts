/** Static rules data: levels, clues, codes and puzzle answers. Browser-safe, no state. */

export const LEVEL_COUNT = 3;

export interface LevelInfo {
  id: number;
  name: string;
  story: string;
  rule: string;
}

export const LEVEL_INFO: readonly LevelInfo[] = [
  {
    id: 1,
    name: "The Office",
    story: "A rain-soaked detective office. The exit is locked behind a laptop.",
    rule: "Find the year and unlock the exit door. The painting is heavy: you both have to push.",
  },
  {
    id: 2,
    name: "The Archive",
    story: "Rows of shelves and a locked filing cabinet. Someone left a case open.",
    rule: "A wrong move costs time. The door keypad has two halves, one for each of you.",
  },
  {
    id: 3,
    name: "The Vault",
    story: "No windows, no lights. The safe holds the way out.",
    rule: "Each of you works one side of the power panel. The safe needs something you learned in the first room.",
  },
];

export function levelInfo(level: number): LevelInfo {
  const info = LEVEL_INFO[level - 1];
  if (!info) throw new Error(`unknown level ${level}`);
  return info;
}

export const CLUE_DEFS = {
  blue4: { text: "Blue — 4", detail: "a blue object in the room, interact exactly 4 times", level: 1 },
  findyear: {
    text: "Find the year on the photograph",
    detail: "look for a photograph hidden in the room",
    level: 1,
  },
  year1998: {
    text: "The year is 1998",
    detail: "enter 1998 on the laptop to unlock the exit",
    level: 1,
  },
  shelforder: { text: "Books: blue, red, green, amber", detail: "index card in the archive", level: 2 },
  day17: { text: "Day: 17", detail: "circled on the wall calendar", level: 2 },
  month04: { text: "Month: 04", detail: "case folder in the filing cabinet", level: 2 },
  switchpattern: { text: "Switches: up, down, up, up", detail: "poster in the vault", level: 3 },
  safecode: { text: "Safe code: the photo year, reversed", detail: "vault terminal", level: 3 },
} as const;

export type ClueId = keyof typeof CLUE_DEFS;

export function isClueId(id: string): id is ClueId {
  return id in CLUE_DEFS;
}

export const CODE_KINDS = ["laptop", "archive", "vault"] as const;
export type CodeKind = (typeof CODE_KINDS)[number];

/** The room each code belongs to. */
export const CODE_LEVEL: Record<CodeKind, number> = { laptop: 1, archive: 2, vault: 3 };

export const CODE_DIGITS: Record<CodeKind, number> = { laptop: 4, archive: 2, vault: 4 };

export const CODES = {
  laptop: "1998",
  /** Detective 1 enters the month, detective 2 the day. */
  archive: { 1: "04", 2: "17" },
  vault: "8991",
} as const;

/** Archive shelf: indexes into red, blue, green, amber. */
export const SHELF_ORDER: readonly number[] = [1, 0, 2, 3];

/** Vault panel as a bit mask, bit n = switch n up: up, down, up, up. */
export const SWITCH_TARGET_MASK = 0b1101;

/** Detective 1 reaches switches 0 and 1, detective 2 reaches 2 and 3. */
export function switchOwner(index: number): 1 | 2 {
  return index < 2 ? 1 : 2;
}

/** Every clickable thing in the three rooms, and the room it lives in. */
export const TARGET_LEVEL = {
  note: 1,
  painting: 1,
  key: 1,
  cabinet: 1,
  photo: 1,
  laptop: 1,
  door1: 1,
  card: 2,
  calendar: 2,
  book0: 2,
  book1: 2,
  book2: 2,
  book3: 2,
  key2: 2,
  filing: 2,
  folder: 2,
  door2: 2,
  poster: 3,
  sw0: 3,
  sw1: 3,
  sw2: 3,
  sw3: 3,
  terminal: 3,
  safe: 3,
  door3: 3,
} as const;

export type Target = keyof typeof TARGET_LEVEL;

export const TARGETS = Object.keys(TARGET_LEVEL) as [Target, ...Target[]];
