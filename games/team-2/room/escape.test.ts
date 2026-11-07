import { SeededRandom } from "@sdm/core/shared";
import { describe, expect, it } from "vitest";
import { runSeconds, tickMs } from "../shared/escape.ts";
import { EscapeRun } from "./index.ts";

const ticks = (seconds: number) => (seconds * 1000) / tickMs;
function advance(game: EscapeRun, count: number) {
  for (let tick = 0; tick < count; tick += 1) game.tick();
}

function start() {
  const game = new EscapeRun(new SeededRandom(42));
  game.join("first");
  expect(game.state).toMatchObject({ phase: "waiting", seconds: 180 });
  game.join("second");
  return game;
}

describe("Ward 04 attempts", () => {
  it("requires both players to survive before the exit code can free them", () => {
    const game = start();
    game.act("first", { type: "collect", item: "knife" });
    expect(game.state.inventory).toEqual([]);
    game.act("first", { type: "inspect", station: "note" });
    const code = game.state.paper ?? "";
    expect(code).toMatch(/^\d{4}$/);
    game.act("first", { type: "inspect", station: "desk" });
    game.act("first", { type: "collect", item: "knife" });
    game.act("second", { type: "inspect", station: "painting" });
    game.act("second", { type: "use", item: "knife" });
    game.act("second", { type: "collect", item: "key" });
    game.act("first", { type: "inspect", station: "cabinet" });
    game.act("first", { type: "use", item: "key" });
    expect(game.state.inventory).toEqual(["knife"]);

    game.act("second", { type: "inspect", station: "photo" });
    game.act("second", { type: "code", code: "0000" });
    expect(game.state.year).toBeNull();
    game.act("second", { type: "code", code });
    expect(game.state.year).toBe("1973");
    game.act("second", { type: "inspect", station: "exit" });
    game.act("second", { type: "code", code: "1973" });
    expect(game.state.ghostSeconds).toBe(12);

    game.act("first", { type: "ward-off", pressed: true });
    advance(game, ticks(5));
    expect(game.state.ghostSeconds).not.toBeNull();
    game.act("first", { type: "ward-off", pressed: false });
    game.act("second", { type: "ward-off", pressed: true });
    advance(game, ticks(5));
    expect(game.state.ghostSeconds).toBeNull();
    game.act("second", { type: "code", code: "1973" });
    expect(game.state.phase).toBe("escaped");

    game.act("first", { type: "restart" });
    expect(game.state).toMatchObject({ phase: "running", paper: null, inventory: [], year: null });
    game.act("first", { type: "inspect", station: "note" });
    expect(game.state.paper).not.toBe(code);
  });

  it("fails an encounter when a player releases E before finishing", () => {
    const game = start();
    while (game.state.ghostSeconds === null && game.state.phase === "running") game.tick();
    expect(game.state.ghostSeconds).toBe(12);
    game.act("first", { type: "ward-off", pressed: true });
    game.act("second", { type: "ward-off", pressed: true });
    advance(game, ticks(4));
    game.act("second", { type: "ward-off", pressed: false });
    advance(game, ticks(8));
    expect(game.state).toMatchObject({ phase: "failed", ghostSeconds: null });
  });

  it("still ends at three minutes after the ghost is repelled", () => {
    const game = start();
    let elapsed = 0;
    while (game.state.ghostSeconds === null && game.state.phase === "running") {
      game.tick();
      elapsed += 1;
    }
    game.act("first", { type: "ward-off", pressed: true });
    game.act("second", { type: "ward-off", pressed: true });
    advance(game, ticks(runSeconds) - elapsed);
    expect(game.state).toMatchObject({ phase: "failed", seconds: 0, ghostSeconds: null });
  });
});
