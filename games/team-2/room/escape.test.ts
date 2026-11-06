import { describe, expect, it } from "vitest";
import { runSeconds, tickMs } from "../shared/escape.ts";
import { EscapeRun } from "./index.ts";

describe("Ward 04 attempts", () => {
  it("ends at three minutes and clears progress only when the players restart", () => {
    const game = new EscapeRun();
    game.join("first");
    game.tick();
    expect(game.state).toMatchObject({ phase: "waiting", seconds: 180 });
    game.join("second");
    game.act("first", { type: "inspect", target: "note" });
    game.act("second", { type: "move", station: "cabinet" });
    expect(game.state.patients[1]?.station).toBe("cabinet");

    for (let tick = 0; tick < (runSeconds * 1000) / tickMs; tick += 1) game.tick();
    expect(game.state).toMatchObject({ phase: "failed", seconds: 0, clues: ["note"] });
    game.act("second", { type: "inspect", target: "photo" });
    expect(game.state.clues).toEqual(["note"]);

    game.act("first", { type: "restart" });
    expect(game.state).toMatchObject({ phase: "running", seconds: 180, attempt: 2, clues: [] });
    expect(game.state.patients.map(({ station }) => station)).toEqual([null, null]);
  });

  it("requires two different patients to activate the exit", () => {
    const game = new EscapeRun();
    game.join("first");
    game.join("second");
    for (let knock = 0; knock < 4; knock += 1) game.act("first", { type: "inspect", target: "painting" });
    game.act("second", { type: "inspect", target: "cabinet" });
    game.act("second", { type: "password", code: "1973" });
    game.act("first", { type: "inspect", target: "exit" });
    game.act("first", { type: "inspect", target: "exit" });
    expect(game.state.phase).toBe("running");
    game.act("second", { type: "inspect", target: "exit" });
    expect(game.state.phase).toBe("escaped");
  });
});
