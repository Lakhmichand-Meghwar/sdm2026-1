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
  CLUE_DEFS,
  type ClueId,
  CODE_LEVEL,
  CODES,
  type CodeKind,
  LEVEL_COUNT,
  levelInfo,
  OWNER,
  SHELF_ORDER,
  SWITCH_TARGET_MASK,
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

function journal(ctx: Ctx, slot: Slot): TimeLoopState["clues1"] {
  return slot === 1 ? ctx.state.clues1 : ctx.state.clues2;
}

function hasClue(ctx: Ctx, slot: Slot, id: ClueId): boolean {
  for (const clue of journal(ctx, slot)) if (clue === id) return true;
  return false;
}

function otherSlot(slot: Slot): Slot {
  return slot === 1 ? 2 : 1;
}

/**
 * A detective reads something. The details go only to their own journal and screen; everybody
 * sees that they looked. Returns false when they already had the clue.
 */
function learn(ctx: Ctx, slot: Slot, id: ClueId, detail: string, publicText: string): boolean {
  if (hasClue(ctx, slot, id)) return false;
  journal(ctx, slot).push(id);
  say(ctx, "success", detail, slot);
  say(ctx, "info", publicText);
  return true;
}

function nameOf(ctx: Ctx, slot: Slot): string {
  for (const player of ctx.state.players.values()) if (player.slot === slot) return player.name;
  return `Player ${slot}`;
}

function bitOf(slot: Slot): number {
  return slot === 1 ? 1 : 2;
}

/** Detectives who are connected right now. */
function activeDetectives(ctx: Ctx): number {
  let n = 0;
  for (const id of ctx.state.players.keys()) if (ctx.state.seats.get(id)?.connected) n += 1;
  return n;
}

/** How many connected detectives the clock needs: one when playing alone, otherwise both. */
function requiredDetectives(ctx: Ctx): number {
  return ctx.state.solo ? 1 : 2;
}

function levelConfig(ctx: Ctx): TimeLoopConfig["levels"][number] {
  const level = ctx.config.levels[ctx.state.level - 1];
  if (!level) throw new Error(`no config for level ${ctx.state.level}`);
  return level;
}

/** The loop time a room is made with: one of `loopTimes`, or the default for anything else. */
export function pickLoopTime(config: TimeLoopConfig, requested: unknown): number {
  return typeof requested === "number" && config.loopTimes.includes(requested)
    ? requested
    : config.defaultLoopTime;
}

/**
 * Seconds per loop in a room. `loopTime` is the first room's time; every later room keeps the
 * difference from the first room that `config.levels` gives it (90, 80, 70 → 60, 50, 40 for 60).
 */
export function levelDuration(config: TimeLoopConfig, loopTime: number, level: number): number {
  const first = config.levels[0]?.duration ?? 0;
  const own = config.levels[level - 1]?.duration ?? first;
  return own - first + pickLoopTime(config, loopTime);
}

function duration(ctx: Ctx): number {
  return levelDuration(ctx.config, ctx.state.loopTime, ctx.state.level);
}

function clearRoom(ctx: Ctx): void {
  const s = ctx.state;
  s.paintClicks = 0;
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
  s.timeLeft = duration(ctx);
  s.subTick = 0;
  s.readyMask = 0;
  s.previous = previous;
  s.held = false;
  s.heldBy = "";
  s.heldSlot = 0;
  s.phase = "briefing";
}

function newGame(ctx: Ctx): void {
  const s = ctx.state;
  s.clues1.clear();
  s.clues2.clear();
  s.resets = 0;
  s.finalTime = 0;
  s.endedBy = "";
  s.endedSlot = 0;
  s.endedAt = "";
  beginLevel(ctx, 1, "");
}

/** Phases a game can be ended from. It can only be paused while a room is being played. */
const ACTIVE_PHASES = new Set(["briefing", "playing", "resetting"]);

function pauseGame(ctx: Ctx, slot: Slot): void {
  const s = ctx.state;
  if (s.phase !== "playing" || s.held) return;
  s.held = true;
  s.heldBy = nameOf(ctx, slot);
  s.heldSlot = slot;
  say(ctx, "info", `${s.heldBy} paused the game.`);
}

function resumeGame(ctx: Ctx, slot: Slot): void {
  const s = ctx.state;
  if (!s.held) return;
  s.held = false;
  s.heldBy = "";
  s.heldSlot = 0;
  say(ctx, "info", `${nameOf(ctx, slot)} resumed the game.`);
}

/** Stops the game for everyone. Play again (`restart`) starts a new one in the same room. */
function endGame(ctx: Ctx, slot: Slot): void {
  const s = ctx.state;
  if (!ACTIVE_PHASES.has(s.phase)) return;
  s.held = false;
  s.heldBy = "";
  s.heldSlot = 0;
  s.endedBy = nameOf(ctx, slot);
  s.endedSlot = slot;
  s.endedAt = `${levelInfo(s.level).name}, loop ${s.loop}`;
  s.phase = "ended";
}

function completeLevel(ctx: Ctx): void {
  const s = ctx.state;
  const cleared = levelInfo(s.level);
  const loop = s.loop;
  const left = s.timeLeft;
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
    if (s.held) return;
    // The clock only runs while every detective is connected.
    if (activeDetectives(ctx) < requiredDetectives(ctx)) return;
    s.subTick += 1;
    if (s.subTick < ctx.config.tickRate) return;
    s.subTick = 0;
    if (s.timeLeft > 0) s.timeLeft -= 1;
    if (s.timeLeft === 0) startReset(ctx);
  } else if (s.phase === "resetting") {
    if (s.countdown > 0) s.countdown -= 1;
    if (s.countdown === 0) {
      s.loop += 1;
      s.resets += 1;
      s.timeLeft = duration(ctx);
      s.subTick = 0;
      clearRoom(ctx);
      s.phase = "playing";
    }
  }
}

// ── actions ───────────────────────────────────────────────────────────────────

function pushPainting(ctx: Ctx, name: string): void {
  const s = ctx.state;
  if (s.keyVisible) {
    say(ctx, "info", "The painting is open. The key is below it.");
    return;
  }
  s.paintClicks += 1;
  if (s.paintClicks < 4) {
    const msgs = [
      `${name} pushes the painting. It shifts slightly.`,
      `${name} pushes the painting. It swings. Something hides behind it.`,
      `${name} pushes the painting. Almost there.`,
    ];
    say(ctx, "info", msgs[s.paintClicks - 1] ?? "The painting moves.");
  } else {
    s.keyVisible = true;
    say(ctx, "success", `${name} swings the painting open. A key drops!`);
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

function flipSwitch(ctx: Ctx, index: number): void {
  const s = ctx.state;
  if (s.powered) {
    say(ctx, "info", "The power is already on.");
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
  const owner = s.solo ? 0 : OWNER[target];
  if (owner !== 0 && owner !== slot) {
    say(ctx, "warn", `${nameOf(ctx, owner)} has to do that. Tell them what you see.`, slot);
    return;
  }
  const name = nameOf(ctx, slot);

  switch (target) {
    // room 1 · the office
    case "note":
      if (!learn(ctx, slot, "blue4", 'The note says: "Blue — 4"', `${name} reads the note.`)) {
        say(ctx, "info", "Already noted: Blue — 4", slot);
      }
      return;
    case "painting":
      pushPainting(ctx, name);
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
        for (const slotId of [1, 2] as const) {
          if (!hasClue(ctx, slotId, "findyear")) journal(ctx, slotId).push("findyear");
        }
        say(ctx, "success", `${name} unlocks the wardrobe. A photograph appears on the corkboard.`);
      }
      return;
    case "photo":
      if (!s.cabinetOpen) {
        say(ctx, "warn", "The wardrobe is locked. Can't see anything.");
      } else if (
        !learn(ctx, slot, "year1998", "The photograph shows a year: 1998", `${name} studies the photograph.`)
      ) {
        say(ctx, "info", "The photograph shows a year: 1998", slot);
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
        hasClue(ctx, slot, "year1998")
          ? "You have the year. Enter it now."
          : "Enter the 4-digit year. The photograph knows it, and your partner can read it.",
      );
      return;
    case "door1":
      if (!s.laptopDone) say(ctx, "warn", "The door is locked. Find the code.");
      else completeLevel(ctx);
      return;

    // room 2 · the archive
    case "card":
      if (
        !learn(
          ctx,
          slot,
          "shelforder",
          "The card lists the books: blue, red, green, amber",
          `${name} reads the index card.`,
        )
      ) {
        say(ctx, "info", "Already noted: blue, red, green, amber", slot);
      }
      return;
    case "calendar":
      if (!learn(ctx, slot, "day17", "The calendar has the 17th circled", `${name} studies the calendar.`)) {
        say(ctx, "info", "Already noted: the 17th", slot);
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
      if (
        !learn(ctx, slot, "month04", "The folder is filed under month 04", `${name} opens the case folder.`)
      ) {
        say(ctx, "info", "Already noted: month 04", slot);
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
          s.solo
            ? "Four digits: the month, then the day."
            : slot === 1
              ? "You type the day, two digits. Your partner types the month."
              : "You type the month, two digits. Your partner types the day.",
        );
      }
      return;

    // room 3 · the vault
    case "poster":
      if (
        !learn(
          ctx,
          slot,
          "switchpattern",
          "The poster shows the switches: up, down, up, up",
          `${name} studies the poster.`,
        )
      ) {
        say(ctx, "info", "Already noted: up, down, up, up", slot);
      }
      return;
    case "sw0":
    case "sw1":
    case "sw2":
    case "sw3":
      flipSwitch(ctx, Number(target.slice(2)));
      return;
    case "terminal":
      if (!s.powered) {
        say(ctx, "warn", "The terminal is dead. Restore the power.");
      } else if (
        !learn(
          ctx,
          slot,
          "safecode",
          "The terminal says: safe code is the photo year, reversed",
          `${name} reads the terminal.`,
        )
      ) {
        say(ctx, "info", "Safe code: the photo year, reversed", slot);
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
          hasClue(ctx, slot, "safecode")
            ? "The photo year, reversed."
            : s.solo
              ? "Read the terminal first."
              : "Ask your partner what the terminal says.",
        );
      }
      return;
    case "door3":
      if (!s.safeOpen) say(ctx, "warn", "The hatch is sealed. Open the safe.");
      else completeLevel(ctx);
      return;
  }
}

function shareClue(ctx: Ctx, slot: Slot, id: ClueId): void {
  if (!hasClue(ctx, slot, id)) return;
  const partner = otherSlot(slot);
  if (hasClue(ctx, partner, id)) {
    say(ctx, "info", `${nameOf(ctx, partner)} already knows that.`, slot);
    return;
  }
  journal(ctx, partner).push(id);
  say(ctx, "success", `${nameOf(ctx, slot)} tells you: ${CLUE_DEFS[id].text}`, partner);
  say(ctx, "info", `You told ${nameOf(ctx, partner)}: ${CLUE_DEFS[id].text}`, slot);
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
    if (s.archiveDone) return;
    if (s.solo) {
      if (value !== `${CODES.archive[2]}${CODES.archive[1]}`) {
        rejectCode(ctx, slot);
        return;
      }
      s.archiveMask = 3;
      s.archiveDone = true;
      say(ctx, "codeok", "Access granted", slot);
      say(ctx, "success", `${name} opens the archive door.`);
      return;
    }
    if ((s.archiveMask & bitOf(slot)) !== 0) return;
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
  // A paused room only listens for resume and end.
  const live = s.phase === "playing" && !s.held;

  switch (input.type) {
    case "pause":
      pauseGame(ctx, slot);
      return;
    case "resume":
      resumeGame(ctx, slot);
      return;
    case "end":
      endGame(ctx, slot);
      return;
    case "share":
      if (live && !s.solo) shareClue(ctx, slot, input.clue);
      return;
    case "ready":
      if (s.phase !== "briefing") return;
      s.readyMask |= bitOf(slot);
      if (s.readyMask === (s.solo ? 1 : 3)) s.phase = "playing";
      return;
    case "restart":
      if (s.phase !== "won" && s.phase !== "ended") return;
      newGame(ctx);
      // The partner went back to the lobby: wait for someone to join before the briefing.
      if (s.players.size < requiredDetectives(ctx)) s.phase = "waiting";
      return;
    case "code":
      if (live) submitCode(ctx, slot, input.kind, input.value);
      return;
    case "interact":
      if (live) interact(ctx, slot, input.target);
      return;
  }
}

/**
 * Somebody who joined a Play alone room has gone for good. The player who is left plays alone again:
 * they become detective 1 and keep what both journals knew, so nothing is lost.
 */
function backToSolo(ctx: Ctx): void {
  const s = ctx.state;
  const remaining = [...s.players.values()][0];
  if (!remaining) return;
  const wasReady = (s.readyMask & bitOf(remaining.slot === 2 ? 2 : 1)) !== 0;
  remaining.slot = 1;
  for (const id of s.clues2) if (!hasClue(ctx, 1, id as ClueId)) s.clues1.push(id);
  s.clues2.clear();
  if (s.keyHolder !== 0) s.keyHolder = 1;
  s.readyMask = wasReady ? 1 : 0;
  s.solo = true;
  if (s.phase === "briefing" && wasReady) s.phase = "playing";
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
    const s = ctx.state;
    if (s.players.size === 0) {
      s.solo = options.solo === true;
      s.startedSolo = s.solo;
      // Only the room's creator picks the clock; whoever joins by code plays with it.
      s.loopTime = pickLoopTime(ctx.config, options.time);
    }
    const taken = new Set<number>();
    for (const other of s.players.values()) taken.add(other.slot);
    const slot: Slot = taken.has(1) ? 2 : 1;
    const player = new Player();
    player.slot = slot;
    player.name = String(options.name ?? "").trim() || `Player ${slot}`;
    s.players.set(playerId, player);
    if (s.solo && slot === 2) {
      // Somebody joined a room made for one: from now on the two of you have separate jobs.
      s.solo = false;
      say(ctx, "info", `${player.name} joins. From now on you each have your own jobs.`);
    }
  },

  leave(ctx, playerId) {
    const s = ctx.state;
    const player = s.players.get(playerId);
    if (player) s.readyMask &= ~bitOf(player.slot === 2 ? 2 : 1);
    s.players.delete(playerId);
    if (s.startedSolo && !s.solo && s.players.size === 1) backToSolo(ctx);
  },

  step(ctx, inputs) {
    const s = ctx.state;
    if (s.phase === "waiting" && s.players.size >= requiredDetectives(ctx)) newGame(ctx);
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
