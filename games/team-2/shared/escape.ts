import { z } from "zod";

export const escapeRoomName = "escape";
export const runSeconds = 180;
export const tickMs = 250;
export const clues = {
  note: "BLUE - 4. The blue painting remembers every knock.",
  cabinet:
    "Find the year on the photograph. One patient must stay at the cabinet relay while the other enters the year at the terminal.",
  photo: "Ward 04 staff photograph, dated 1973.",
  terminal: "Two people must hold the exit contacts within four seconds of each other.",
} as const;
export const targets = ["note", "painting", "cabinet", "photo", "exit"] as const;
export const stations = [...targets, "terminal"] as const;
export type Station = (typeof stations)[number];

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("move"), station: z.enum(stations) }),
  z.object({ type: z.literal("restart") }),
  z.object({ type: z.literal("flip-photo") }),
  z.object({ type: z.literal("inspect"), target: z.enum(targets) }),
  z.object({ type: z.literal("password"), code: z.string().regex(/^\d{4}$/) }),
]);
export type EscapeAction = z.infer<typeof actionSchema>;
export type EscapeClue = keyof typeof clues;

export interface EscapeSnapshot {
  phase: "waiting" | "running" | "escaped" | "failed";
  players: number;
  attempt: number;
  patients: { id: string; slot: number; station: Station | null }[];
  seconds: number;
  clues: EscapeClue[];
  hasKey: boolean;
  cabinetOpen: boolean;
  terminalUnlocked: boolean;
  exitContact: string | null;
  message: string;
}
