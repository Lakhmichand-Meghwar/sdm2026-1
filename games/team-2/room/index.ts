/**
 * Server rooms for this game. Add each Room class here; the host registers them by name.
 * The template ships with none yet — the shared room base (fixed tick, replays, debug
 * commands) is the next platform task.
 */
import type { RoomClass } from "@sdm/host";

export const rooms: Record<string, RoomClass> = {};
