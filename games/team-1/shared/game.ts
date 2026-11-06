/**
 * Time Loop Escape rules. Pure and browser-safe: no clocks, no Math.random(). Time comes from the
 * tick counter, so the same inputs always give the same game.
 */
import type { GameDefinition, SimContext } from "@sdm/core/sim";
import rawConfig from "../config/game.json" with { type: "json" };
import {
  GAME_ID,
  GameEvent,
  Player,
  type TimeLoopConfig,
  TimeLoopConfigSchema,
  type TimeLoopInput,
  TimeLoopInputSchema,
  TimeLoopJoinOptionsSchema,
  TimeLoopState,
} from "./index.ts";
import {
  type ClueId,
  CODE_LEVEL,
  CODES,
  type CodeKind,
  LEVEL_COUNT,
  levelInfo,
  SHELF_ORDER,
  SWITCH_TARGET_MASK,
  switchOwner,
  TARGET_LEVEL,
  type Target,
} from "./rules.ts";

type Ctx = SimContext<TimeLoopState, TimeLoopConfig>;
type Slot = 1 | 2;

/** Checked at load: a bad config file stops the server at startup with the zod message. */
const config = TimeLoopConfigSchema.parse(rawConfig);

const MAX_EVENTS = 8;
const BOOK_NAMES = ["red", "blue", "green", "amber"] as const;

// ── helpers ───────────────────────────────────────────────────────────────────

function say(ctx: Ctx, kind: string, text: string, by = 0, extra = ""): void {
  const s = ctx.state;
  const event = new GameEvent();
  s.eventSeq += 1;
  event.n = s.eventSeq;
  event.kind = kind;
  event.text = text;
  event.by = by;
  event.extra = extra;
  s.events.push(event);
  while (s.events.length > MAX_EVENTS) s.events.shift();
}

function hasClue(ctx: Ctx, id: ClueId): boolean {
  for (const clue of ctx.state.clues) if (clue === id) return true;
  return false;
}

/** Records a clue the first time it is found. Returns false when the team already had it. */
function learn(ctx: Ctx, id: ClueId, text: string): boolean {
  if (hasClue(ctx, id)) return false;
  ctx.state.clues.push(id);
  say(ctx, "success", text);
  return true;
}

function nameOf(ctx: Ctx, slot: Slot): string {
  for (const player of ctx.state.players.values()) if (player.slot === slot) return player.name;
  return `Player ${slot}`;
}

function bitOf(slot: Slot): number {
  return slot === 1 ? 1 : 2;
}

function connectedSeats(ctx: Ctx): number {
  let n = 0;
  for (const seat of ctx.state.seats.values()) if (seat.connected) n += 1;
  return n;
}

function levelConfig(ctx: Ctx): TimeLoopConfig["levels"][number] {
  const level = ctx.config.levels[ctx.state.level - 1];
  if (!level) throw new Error(`no config for level ${ctx.state.level}`);
  return level;
}

function clearRoom(ctx: Ctx): void {
  const s = ctx.state;
  s.paintClicks = 0;
  s.paintMask = 0;
  s.paintTick = 0;
  s.keyVisible = false;
  s.keyHolder = 0;
  s.cabinetOpen = false;
  s.laptopDone = false;
  s.shelfStep = 0;
  s.archiveCabinetOpen = false;
  s.archiveMask = 0;
  s.archiveDone = false;
  s.switchMask = 0;
  s.powered = false;
  s.safeOpen = false;
}

// ── level flow ────────────────────────────────────────────────────────────────

function beginLevel(ctx: Ctx, level: number, previous: string): void {
  const s = ctx.state;
  s.level = level;
  s.loop = 1;
  clearRoom(ctx);
  s.timeLeft = levelConfig(ctx).duration;
  s.subTick = 0;
  s.readyMask = 0;
  s.previous = previous;
  s.phase = "briefing";
}

function newGame(ctx: Ctx): void {
  const s = ctx.state;
  s.clues.clear();
  s.totalLoops = 0;
  s.finalTime = 0;
  beginLevel(ctx, 1, "");
}

function completeLevel(ctx: Ctx): void {
  const s = ctx.state;
  const cleared = levelInfo(s.level);
  const loop = s.loop;
  const left = s.timeLeft;
  s.totalLoops += 1;
  if (s.level >= LEVEL_COUNT) {
    s.finalTime = left;
    s.phase = "won";
    return;
  }
  beginLevel(ctx, s.level + 1, `${cleared.name} cleared in loop ${loop} with ${left}s left`);
}

function startReset(ctx: Ctx): void {
  const s = ctx.state;
  s.phase = "resetting";
  s.countdown = Math.ceil(ctx.config.resetSeconds * ctx.config.tickRate);
}

/** Takes time off the clock for a mistake. Returns the seconds lost. */
function penalize(ctx: Ctx): number {
  const seconds = levelConfig(ctx).penalty;
  if (seconds === 0) return 0;
  const s = ctx.state;
  s.timeLeft = Math.max(0, s.timeLeft - seconds);
  if (s.timeLeft === 0) startReset(ctx);
  return seconds;
}

function tickClock(ctx: Ctx): void {
  const s = ctx.state;
  if (s.phase === "playing") {
    // The clock only runs while both detectives are connected.
    if (connectedSeats(ctx) < 2) return;
    s.subTick += 1;
    if (s.subTick < ctx.config.tickRate) return;
    s.subTick = 0;
    if (s.timeLeft > 0) s.timeLeft -= 1;
    if (s.timeLeft === 0) startReset(ctx);
  } else if (s.phase === "resetting") {
    if (s.countdown > 0) s.countdown -= 1;
    if (s.countdown === 0) {
      s.loop += 1;
      s.totalLoops += 1;
      s.timeLeft = levelConfig(ctx).duration;
      s.subTick = 0;
      clearRoom(ctx);
      s.phase = "playing";
    }
  }
}

// ── actions ───────────────────────────────────────────────────────────────────

function pushPainting(ctx: Ctx, slot: Slot, name: string): void {
  const s = ctx.state;
  if (s.keyVisible) {
    say(ctx, "info", "The painting is open. The key is below it.");
    return;
  }
  const bit = bitOf(slot);
  const windowTicks = Math.ceil(ctx.config.paintWindowSeconds * ctx.config.tickRate);
  if (s.paintMask !== 0 && ctx.tick - s.paintTick > windowTicks) s.paintMask = 0;
  if (s.paintMask === 0) s.paintTick = ctx.tick;
  if ((s.paintMask & bit) !== 0) return;
  s.paintMask |= bit;
  if (s.paintMask !== 3) {
    say(ctx, "info", `${name} pushes the painting. It is heavy: the other detective has to push too.`);
    return;
  }
  s.paintMask = 0;
  s.paintClicks += 1;
  if (s.paintClicks < 4) {
    const msgs = [
      "The painting shifts slightly.",
      "The painting swings. Something hides behind it.",
      "Almost there. One more push together.",
    ];
    say(ctx, "info", msgs[s.paintClicks - 1] ?? "The painting moves.");
  } else {
    s.keyVisible = true;
    say(ctx, "success", "You swing the painting open together. A key drops!");
  }
}

function pickUpKey(ctx: Ctx, slot: Slot, name: string): void {
  const s = ctx.state;
  if (!s.keyVisible) return;
  if (s.keyHolder !== 0) {
    say(ctx, "info", "The key is already held.");
    return;
  }
  s.keyHolder = slot;
  say(ctx, "success", `${name} picks up the key.`);
}

function pullBook(ctx: Ctx, name: string, book: number): void {
  const s = ctx.state;
  if (s.keyVisible) {
    say(ctx, "info", "The shelf is already open.");
    return;
  }
  if (SHELF_ORDER[s.shelfStep] !== book) {
    s.shelfStep = 0;
    const lost = penalize(ctx);
    say(ctx, "warn", `Wrong book. The shelf resets${lost ? ` and you lose ${lost}s` : ""}.`);
    return;
  }
  s.shelfStep += 1;
  const label = BOOK_NAMES[book] ?? "book";
  if (s.shelfStep === SHELF_ORDER.length) {
    s.keyVisible = true;
    say(ctx, "success", `${name} pulls the ${label} book. A drawer slides open.`);
  } else {
    say(ctx, "info", `${name} pulls the ${label} book. ${s.shelfStep} of ${SHELF_ORDER.length}.`);
  }
}

function flipSwitch(ctx: Ctx, slot: Slot, index: number): void {
  const s = ctx.state;
  if (s.powered) {
    say(ctx, "info", "The power is already on.");
    return;
  }
  if (switchOwner(index) !== slot) {
    say(ctx, "warn", "That switch is on the other detective's side of the panel.");
    return;
  }
  s.switchMask ^= 1 << index;
  if (s.switchMask === SWITCH_TARGET_MASK) {
    s.powered = true;
    say(ctx, "success", "Power restored. The terminal wakes up.");
  }
}

function prompt(ctx: Ctx, slot: Slot, kind: CodeKind, hint: string): void {
  say(ctx, "prompt", hint, slot, kind);
}

function interact(ctx: Ctx, slot: Slot, target: Target): void {
  const s = ctx.state;
  if (TARGET_LEVEL[target] !== s.level) return;
  const name = nameOf(ctx, slot);

  switch (target) {
    // room 1 · the office
    case "note":
      if (!learn(ctx, "blue4", `${name} reads the note: "Blue — 4"`)) {
        say(ctx, "info", "Already noted: Blue — 4");
      }
      return;
    case "painting":
      pushPainting(ctx, slot, name);
      return;
    case "key":
    case "key2":
      pickUpKey(ctx, slot, name);
      return;
    case "cabinet":
      if (s.cabinetOpen) {
        say(ctx, "info", "The wardrobe is open. Check the corkboard.");
      } else if (s.keyHolder === 0) {
        say(ctx, "warn", "The wardrobe is locked. Find the key first.");
      } else {
        s.cabinetOpen = true;
        if (!hasClue(ctx, "findyear")) s.clues.push("findyear");
        say(ctx, "success", `${name} unlocks the wardrobe. A photograph is pinned inside.`);
      }
      return;
    case "photo":
      if (!s.cabinetOpen) {
        say(ctx, "warn", "The wardrobe is locked. Can't see anything.");
      } else if (!learn(ctx, "year1998", `${name}: the photograph shows a year, 1998`)) {
        say(ctx, "info", "The photograph shows a year: 1998");
      }
      return;
    case "laptop":
      if (s.laptopDone) {
        say(ctx, "success", "The door is unlocked. Go!");
        return;
      }
      prompt(
        ctx,
        slot,
        "laptop",
        hasClue(ctx, "year1998")
          ? "You have the year. Enter it now."
          : hasClue(ctx, "findyear")
            ? "Find the year on the photograph first."
            : "Enter the correct 4-digit year to unlock the door.",
      );
      return;
    case "door1":
      if (!s.laptopDone) say(ctx, "warn", "The door is locked. Find the code.");
      else completeLevel(ctx);
      return;

    // room 2 · the archive
    case "card":
      if (!learn(ctx, "shelforder", `${name} reads the card: blue, red, green, amber`)) {
        say(ctx, "info", "Already noted: blue, red, green, amber");
      }
      return;
    case "calendar":
      if (!learn(ctx, "day17", `${name} sees a circled date: the 17th`)) {
        say(ctx, "info", "Already noted: the 17th");
      }
      return;
    case "book0":
    case "book1":
    case "book2":
    case "book3":
      pullBook(ctx, name, Number(target.slice(4)));
      return;
    case "filing":
      if (s.archiveCabinetOpen) {
        say(ctx, "info", "The cabinet is open. Check the folder on top.");
      } else if (s.keyHolder === 0) {
        say(ctx, "warn", "The filing cabinet is locked. Find the key.");
      } else {
        s.archiveCabinetOpen = true;
        say(ctx, "success", `${name} unlocks the cabinet. A case folder.`);
      }
      return;
    case "folder":
      if (!s.archiveCabinetOpen) return;
      if (!learn(ctx, "month04", `${name} opens the folder: filed in month 04`)) {
        say(ctx, "info", "Already noted: month 04");
      }
      return;
    case "door2":
      if (s.archiveDone) {
        completeLevel(ctx);
      } else if ((s.archiveMask & bitOf(slot)) !== 0) {
        say(ctx, "info", "Your half is already in. Waiting for the other detective.");
      } else {
        prompt(
          ctx,
          slot,
          "archive",
          slot === 1
            ? "You enter the month, two digits. The other detective enters the day."
            : "You enter the day, two digits. The other detective enters the month.",
        );
      }
      return;

    // room 3 · the vault
    case "poster":
      if (!learn(ctx, "switchpattern", `${name} studies the poster: up, down, up, up`)) {
        say(ctx, "info", "Already noted: up, down, up, up");
      }
      return;
    case "sw0":
    case "sw1":
    case "sw2":
    case "sw3":
      flipSwitch(ctx, slot, Number(target.slice(2)));
      return;
    case "terminal":
      if (!s.powered) {
        say(ctx, "warn", "The terminal is dead. Restore the power.");
      } else if (!learn(ctx, "safecode", `${name}: safe code is the photo year, reversed`)) {
        say(ctx, "info", "Safe code: the photo year, reversed");
      }
      return;
    case "safe":
      if (s.safeOpen) {
        say(ctx, "info", "The safe is open. Take the hatch.");
      } else if (!s.powered) {
        say(ctx, "warn", "The safe keypad is dead. Restore the power.");
      } else {
        prompt(
          ctx,
          slot,
          "vault",
          hasClue(ctx, "safecode") ? "The photo year, reversed." : "The terminal may know.",
        );
      }
      return;
    case "door3":
      if (!s.safeOpen) say(ctx, "warn", "The hatch is sealed. Open the safe.");
      else completeLevel(ctx);
      return;
  }
}

function rejectCode(ctx: Ctx, slot: Slot): void {
  const lost = penalize(ctx);
  say(ctx, "codebad", lost ? `Incorrect code · −${lost}s` : "Incorrect code", slot);
}

function submitCode(ctx: Ctx, slot: Slot, kind: CodeKind, value: string): void {
  const s = ctx.state;
  if (CODE_LEVEL[kind] !== s.level) return;
  const name = nameOf(ctx, slot);

  if (kind === "laptop") {
    if (s.laptopDone) return;
    if (value !== CODES.laptop) {
      rejectCode(ctx, slot);
      return;
    }
    s.laptopDone = true;
    say(ctx, "codeok", "Access granted", slot);
    say(ctx, "success", `${name} unlocks the laptop. The exit door is open.`);
  } else if (kind === "archive") {
    if (s.archiveDone || (s.archiveMask & bitOf(slot)) !== 0) return;
    if (value !== CODES.archive[slot]) {
      rejectCode(ctx, slot);
      return;
    }
    s.archiveMask |= bitOf(slot);
    say(ctx, "codeok", "Accepted", slot);
    if (s.archiveMask === 3) {
      s.archiveDone = true;
      say(ctx, "success", "Both halves accepted. The archive door opens.");
    } else {
      say(ctx, "info", `${name} entered their half. The other detective has to enter theirs.`);
    }
  } else {
    if (!s.powered || s.safeOpen) return;
    if (value !== CODES.vault) {
      rejectCode(ctx, slot);
      return;
    }
    s.safeOpen = true;
    say(ctx, "codeok", "Access granted", slot);
    say(ctx, "success", `${name} cracks the safe. The hatch is open.`);
  }
}

function handle(ctx: Ctx, playerId: string, input: TimeLoopInput): void {
  const s = ctx.state;
  const player = s.players.get(playerId);
  if (!player || (player.slot !== 1 && player.slot !== 2)) return;
  const slot: Slot = player.slot;

  switch (input.type) {
    case "ready":
      if (s.phase !== "briefing") return;
      s.readyMask |= bitOf(slot);
      if (s.readyMask === 3) s.phase = "playing";
      return;
    case "restart":
      if (s.phase === "won") newGame(ctx);
      return;
    case "code":
      if (s.phase === "playing") submitCode(ctx, slot, input.kind, input.value);
      return;
    case "interact":
      if (s.phase === "playing") interact(ctx, slot, input.target);
      return;
  }
}

// ── definition ────────────────────────────────────────────────────────────────

export const timeLoopGame: GameDefinition<TimeLoopState, TimeLoopInput, TimeLoopConfig> = {
  id: GAME_ID,
  createState: () => new TimeLoopState(),
  inputSchema: TimeLoopInputSchema,
  joinOptionsSchema: TimeLoopJoinOptionsSchema,
  config,
  configSchema: TimeLoopConfigSchema,

  init() {},

  join(ctx, playerId, options) {
    const taken = new Set<number>();
    for (const other of ctx.state.players.values()) taken.add(other.slot);
    const slot = taken.has(1) ? 2 : 1;
    const player = new Player();
    player.slot = slot;
    player.name = String(options.name ?? "").trim() || `Player ${slot}`;
    ctx.state.players.set(playerId, player);
  },

  leave(ctx, playerId) {
    const player = ctx.state.players.get(playerId);
    if (player) ctx.state.readyMask &= ~bitOf(player.slot === 2 ? 2 : 1);
    ctx.state.players.delete(playerId);
  },

  step(ctx, inputs) {
    const s = ctx.state;
    if (s.phase === "waiting" && s.players.size >= 2) newGame(ctx);
    for (const input of inputs) handle(ctx, input.playerId, input.data);
    tickClock(ctx);
  },

  commands: {
    /** Jump to a room for testing: `level 3`. */
    level(ctx, [raw]) {
      const level = Number(raw);
      if (!Number.isInteger(level) || level < 1 || level > LEVEL_COUNT) {
        throw new Error(`usage: level <1-${LEVEL_COUNT}>`);
      }
      beginLevel(ctx, level, "");
      return `now in ${levelInfo(level).name}`;
    },
  },
};
