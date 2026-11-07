import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export class ReplayManager {
  public loadReplay(filename: string): Record<string, unknown> | null {
    try {
      const path = resolve(process.cwd(), "scenarios", filename);
      const data = readFileSync(path, "utf-8");
      console.log(`[replay] Loaded replay: ${filename}`);
      return JSON.parse(data) as Record<string, unknown>;
    } catch (error) {
      console.error(`[replay] Failed to load replay: ${filename}`);
      return null;
    }
  }

  public play(replayData: Record<string, unknown>): void {
    console.log(`[replay] Playing replay with ${Object.keys(replayData).length} keys...`);
  }
}
