import { z } from "zod";

export const escapeRoomName = "escape";
export const loopSeconds = 60;
export const tickMs = 250;
export const clues = {
  note: "BLUE - 4. The blue painting remembers every knock.",
  cabinet: "Find the year on the photograph. The terminal remembers the dead.",
  photo: "Ward 04 staff photograph, dated 1973.",
  terminal: "Two people must hold the exit contacts within four seconds of each other.",
} as const;
export const targets = ["note", "painting", "cabinet", "photo", "exit"] as const;
export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("inspect"), target: z.enum(targets) }),
  z.object({ type: z.literal("password"), code: z.string().regex(/^\d{4}$/) }),
]);
export type EscapeAction = z.infer<typeof actionSchema>;
export type EscapeClue = keyof typeof clues;

export interface EscapeSnapshot {
  phase: "waiting" | "running" | "escaped";
  players: number;
  loop: number;
  seconds: number;
  clues: EscapeClue[];
  hasKey: boolean;
  cabinetOpen: boolean;
  terminalUnlocked: boolean;
  exitContact: string | null;
  message: string;
}
