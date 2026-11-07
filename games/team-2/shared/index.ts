/**
 * Contract for the template game: room state, input and config.
 * The server room (room/) and the client (client/) both import this.
 * Change it only through a PR reviewed by both the server and client owners.
 */
import { type SchemaType, schema, t } from "@colyseus/schema";
import { z } from "zod";

export const GAME_ID = "team-2";

/** Synced player. Positions are in arena units, not pixels. */
export const Player = schema(
  {
    name: t.string().default(""),
    color: t.string().default("#ffffff"),
    x: t.number().default(0),
    y: t.number().default(0),
    score: t.uint16().default(0),
    connected: t.boolean().default(true),
    /** Last input seq the server applied for this player; the client reconciles against it. */
    lastSeq: t.uint32().default(0),
  },
  "Player",
);
export type Player = SchemaType<typeof Player>;

export const Pickup = schema({ x: t.number().default(0), y: t.number().default(0) }, "Pickup");
export type Pickup = SchemaType<typeof Pickup>;

export const SampleState = schema(
  {
    tick: t.uint32().default(0),
    /** Room code players type to join, e.g. "QXTR". */
    code: t.string().default(""),
    paused: t.boolean().default(false),
    /** Keyed by sessionId. */
    players: t.map(Player),
    /** Keyed by pickup id. */
    pickups: t.map(Pickup),
  },
  "SampleState",
);
export type SampleState = SchemaType<typeof SampleState>;

/** One tick of player input: a movement direction, each axis in [-1, 1]. */
export const SampleInputSchema = z.object({
  dx: z.number().min(-1).max(1),
  dy: z.number().min(-1).max(1),
});
export type SampleInput = z.infer<typeof SampleInputSchema>;

/** Tuning values loaded from config/game.json. Designers edit the JSON, not code. */
export const SampleConfigSchema = z.object({
  version: z.string(),
  tickRate: z.number().int().min(10).max(120),
  maxPlayers: z.number().int().min(1).max(16),
  arena: z.object({ width: z.number().positive(), height: z.number().positive() }),
  player: z.object({
    speed: z.number().positive().describe("Arena units per second"),
    radius: z.number().positive(),
  }),
  pickups: z.object({
    count: z.number().int().nonnegative(),
    radius: z.number().positive(),
    points: z.number().int().positive(),
  }),
});
export type SampleConfig = z.infer<typeof SampleConfigSchema>;
