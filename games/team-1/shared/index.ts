/**
 * Contract for Time Loop Escape: room state, input and config.
 * The server room (room/) and the client (client/) both import this, so it must stay browser-safe.
 */
import { type SchemaType, schema, t } from "@colyseus/schema";
import { BaseState, RoomSettingsSchema } from "@sdm/core/sim";
import { z } from "zod";
import { CLUE_IDS, CODE_KINDS, LEVEL_COUNT, TARGETS } from "./rules.ts";

export const GAME_ID = "time-loop-escape";

export type Phase = "waiting" | "briefing" | "playing" | "resetting" | "won" | "ended";

/** A detective. `slot` is 1 or 2 and decides which half of a shared puzzle they own. */
export const Player = schema(
  {
    name: t.string().default(""),
    slot: t.uint8().default(0),
  },
  "Player",
);
export type Player = SchemaType<typeof Player>;

/** Something worth telling the players: a toast, a code prompt or a code result. */
export const GameEvent = schema(
  {
    n: t.uint32().default(0),
    /** info, success, warn, prompt, codeok or codebad */
    kind: t.string().default("info"),
    text: t.string().default(""),
    /** Slot the event is for, 0 for everyone. Private events are only shown to that detective. */
    by: t.uint8().default(0),
    /** For `prompt`: the code kind to ask for. */
    extra: t.string().default(""),
  },
  "GameEvent",
);
export type GameEvent = SchemaType<typeof GameEvent>;

/** Extends BaseState (tick, code, paused, seats). */
export const TimeLoopState = BaseState.extend(
  {
    /** Keyed by sessionId. */
    players: t.map(Player),
    phase: t.string().default("waiting"),
    level: t.uint8().default(1),
    loop: t.uint8().default(1),
    /** How many times the clock ran out, over the whole game. */
    resets: t.uint8().default(0),
    /** Seconds left in this loop. */
    timeLeft: t.uint16().default(0),
    subTick: t.uint16().default(0),
    /** Ticks left of the loop-reset pause. */
    countdown: t.uint16().default(0),
    /** Briefing: bit 0 = detective 1 is ready, bit 1 = detective 2. */
    readyMask: t.uint8().default(0),
    /** Summary of the room just cleared, shown in the next briefing. */
    previous: t.string().default(""),
    /** One player does everything. Set when the first player asks to play alone. */
    solo: t.boolean().default(false),
    /** The room was made with Play alone, so it goes back to one player if the joiner leaves. */
    startedSolo: t.boolean().default(false),
    /** Seconds per loop in the first room, chosen by whoever made the room. Later rooms get less. */
    loopTime: t.uint16().default(0),
    /** Seconds left when the last door opened. */
    finalTime: t.uint16().default(0),
    /** Each detective's own journal: clue ids in the order found. Kept across loops and rooms. */
    clues1: t.array("string"),
    clues2: t.array("string"),
    events: t.array(GameEvent),
    eventSeq: t.uint32().default(0),
    /** A detective paused the game: the clock stops and the room ignores actions until someone resumes. */
    held: t.boolean().default(false),
    /** Who paused the game: their name, and their slot so each screen can tell "you" from the partner. */
    heldBy: t.string().default(""),
    heldSlot: t.uint8().default(0),
    /** Phase "ended": who ended the game early, and where, for the Game ended screen. */
    endedBy: t.string().default(""),
    endedSlot: t.uint8().default(0),
    endedAt: t.string().default(""),

    // Room 1 · the office
    paintClicks: t.uint8().default(0),
    keyVisible: t.boolean().default(false),
    /** 0 nobody, otherwise the slot holding the key. */
    keyHolder: t.uint8().default(0),
    cabinetOpen: t.boolean().default(false),
    laptopDone: t.boolean().default(false),

    // Room 2 · the archive
    shelfStep: t.uint8().default(0),
    archiveCabinetOpen: t.boolean().default(false),
    /** Bit 0 = day typed by detective 1, bit 1 = month typed by detective 2. */
    archiveMask: t.uint8().default(0),
    archiveDone: t.boolean().default(false),

    // Room 3 · the vault
    switchMask: t.uint8().default(0),
    powered: t.boolean().default(false),
    safeOpen: t.boolean().default(false),
  },
  "TimeLoopState",
);
export type TimeLoopState = SchemaType<typeof TimeLoopState>;

/** One player action. The server decides what it does. */
export const TimeLoopInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("interact"), target: z.enum(TARGETS) }),
  z.object({ type: z.literal("code"), kind: z.enum(CODE_KINDS), value: z.string().max(8) }),
  z.object({ type: z.literal("share"), clue: z.enum(CLUE_IDS) }),
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("restart") }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("end") }),
]);
export type TimeLoopInput = z.infer<typeof TimeLoopInputSchema>;

/** What a client passes when it creates or joins a room. */
export const TimeLoopJoinOptionsSchema = z.object({
  name: z.string().trim().max(24).default(""),
  /** Play the whole game alone: one player can use everything. */
  solo: z.boolean().default(false),
  /** Seconds per loop in the first room, picked in the lobby. Only the room's creator sets it. */
  time: z.number().int().optional(),
});

/** Room settings plus tuning values, loaded from config/game.json. */
export const TimeLoopConfigSchema = RoomSettingsSchema.extend({
  levels: z
    .array(
      z.object({
        duration: z.number().int().positive().describe("Seconds per loop"),
        penalty: z.number().int().nonnegative().describe("Seconds lost per mistake"),
      }),
    )
    .length(LEVEL_COUNT),
  resetSeconds: z.number().positive().describe("How long the loop-reset screen lasts"),
  loopTimes: z
    .array(z.number().int().positive())
    .nonempty()
    .describe("Loop times a room's creator can pick, in seconds for the first room"),
  defaultLoopTime: z.number().int().positive().describe("Loop time when none (or an unknown one) is picked"),
})
  .refine((c) => c.loopTimes.includes(c.defaultLoopTime), {
    message: "defaultLoopTime must be one of loopTimes",
    path: ["defaultLoopTime"],
  })
  .refine(
    (c) => {
      // Later rooms keep their offset from the first room, so the shortest choice must leave every room some time.
      const first = c.levels[0]?.duration ?? 0;
      return c.levels.every((level) => level.duration - first + Math.min(...c.loopTimes) > 0);
    },
    { message: "the shortest loop time leaves a room with no time", path: ["loopTimes"] },
  );
export type TimeLoopConfig = z.infer<typeof TimeLoopConfigSchema>;
