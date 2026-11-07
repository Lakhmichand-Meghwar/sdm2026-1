import { z } from "zod";

export const PlayerConfigSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  role: z.string(),
});

export const ScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  seed: z.number().optional(),
  players: z.array(PlayerConfigSchema),
});

export type PlayerConfig = z.infer<typeof PlayerConfigSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
