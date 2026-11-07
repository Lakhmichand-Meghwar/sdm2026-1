import { z } from "zod";

export const escapeRoomName = "escape";
export const runSeconds = 180;
export const tickMs = 250;
export const stations = ["note", "painting", "cabinet", "photo", "desk", "exit"] as const;
export const items = ["knife", "key"] as const;
export type Station = (typeof stations)[number];
export type Tool = (typeof items)[number];

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("move"), station: z.enum(stations) }),
  z.object({ type: z.literal("inspect"), station: z.enum(stations) }),
  z.object({ type: z.literal("collect"), item: z.enum(items) }),
  z.object({ type: z.literal("use"), item: z.enum(items) }),
  z.object({ type: z.literal("code"), code: z.string().regex(/^\d{4}$/) }),
  z.object({ type: z.literal("ward-off"), pressed: z.boolean() }),
  z.object({ type: z.literal("restart") }),
]);
export type EscapeAction = z.infer<typeof actionSchema>;

export interface EscapeSnapshot {
  phase: "waiting" | "running" | "escaped" | "failed";
  patients: { id: string; slot: number; station: Station | null; resistance: number }[];
  attempt: number;
  seconds: number;
  paper: string | null;
  inventory: Tool[];
  paintingCut: boolean;
  cabinetOpen: boolean;
  year: string | null;
  ghostSeconds: number | null;
  message: string;
}
