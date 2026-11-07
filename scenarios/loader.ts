import { type Scenario, ScenarioSchema } from "./schema.ts";

export function parseScenario(data: unknown): Scenario {
  // Zod handles all the validation and throws a clear error if it fails
  return ScenarioSchema.parse(data);
}
