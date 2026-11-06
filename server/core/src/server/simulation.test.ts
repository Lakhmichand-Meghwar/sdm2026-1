import { describe, expect, it } from "vitest";
import { Simulation } from "./simulation.ts";
import { stateHash } from "./stateHash.ts";
import { makeCounterGame } from "./testing/counterGame.ts";

function newSim(opts: { maxEvents?: number } = {}) {
  return new Simulation(makeCounterGame(), {
    seed: 42,
    roomId: "r1",
    sha: "test",
    startedAt: "2026-11-06T00:00:00Z",
    mode: "live",
    ...opts,
  });
}

describe("Simulation", () => {
  it("applies an input on the next tick and sets lastSeq", () => {
    const sim = newSim();
    sim.join("p1", { name: "Ada" });
    const x0 = sim.state.movers.get("p1")?.x ?? 0;
    expect(sim.queueInput("p1", { seq: 1, data: { dx: 1 } })).toBe("ok");
    expect(sim.state.movers.get("p1")?.x).toBe(x0);
    sim.tick();
    expect(sim.state.movers.get("p1")?.x).toBe(x0 + 1);
    expect(sim.state.seats.get("p1")?.lastSeq).toBe(1);
    expect(sim.state.tick).toBe(1);
  });

  it("drops a stale seq, a schema-invalid input and an unknown player, returning the reason", () => {
    const sim = newSim();
    sim.join("p1", {});
    expect(sim.queueInput("p1", { seq: 2, data: { dx: 1 } })).toBe("ok");
    expect(sim.queueInput("p1", { seq: 2, data: { dx: 1 } })).toBe("stale-seq");
    expect(sim.queueInput("p1", { seq: 3, data: { dx: 9 } })).toBe("schema");
    expect(sim.queueInput("p1", { nope: true })).toBe("envelope");
    expect(sim.queueInput("ghost", { seq: 1, data: { dx: 1 } })).toBe("unknown-player");
  });

  it('inputs while paused are rejected as "paused"', () => {
    const sim = newSim();
    sim.join("p1", {});
    sim.state.paused = true;
    expect(sim.queueInput("p1", { seq: 1, data: { dx: 1 } })).toBe("paused");
    sim.tick();
    expect(sim.state.tick).toBe(0);
    sim.tick({ force: true });
    expect(sim.state.tick).toBe(1);
    expect(sim.state.seats.get("p1")?.lastSeq).toBe(0);
  });

  it("after reconnect, seq 0 is accepted again", () => {
    const sim = newSim();
    sim.join("p1", {});
    sim.queueInput("p1", { seq: 50, data: { dx: 1 } });
    sim.tick();
    sim.drop("p1");
    expect(sim.state.seats.get("p1")?.connected).toBe(false);
    sim.reconnect("p1");
    expect(sim.state.seats.get("p1")?.connected).toBe(true);
    expect(sim.queueInput("p1", { seq: 0, data: { dx: 1 } })).toBe("ok");
    sim.tick();
    expect(sim.state.seats.get("p1")?.lastSeq).toBe(0);
    expect(sim.queueInput("p1", { seq: 0, data: { dx: 1 } })).toBe("stale-seq");
  });

  it("rejects invalid join options", () => {
    const sim = newSim();
    expect(() => sim.join("p1", { name: "x".repeat(30) })).toThrow();
    expect(sim.state.seats.size).toBe(0);
  });

  it("stops recording past maxEvents and marks truncated, but keeps simulating", () => {
    const sim = newSim({ maxEvents: 3 });
    sim.join("p1", {});
    for (let seq = 1; seq <= 5; seq++) {
      sim.queueInput("p1", { seq, data: { dx: 1 } });
      sim.tick();
    }
    const replay = sim.snapshot();
    expect(sim.truncated).toBe(true);
    expect(replay.truncated).toBe(true);
    expect(replay.events).toHaveLength(3);
    expect(sim.state.tick).toBe(5);
  });

  it("records the starting config and every event with its tick", () => {
    const sim = newSim();
    sim.join("p1", { name: "Ada" });
    sim.tick();
    sim.leave("p1");
    const replay = sim.snapshot();
    expect(replay.config).toEqual(makeCounterGame().config);
    expect(replay.events).toEqual([
      { type: "join", tick: 0, playerId: "p1", options: { name: "Ada" } },
      { type: "leave", tick: 1, playerId: "p1" },
    ]);
    expect(replay.final).toEqual({ tick: 1, stateHash: stateHash(sim.state) });
  });
});

describe("stateHash", () => {
  it("ignores key insertion order", () => {
    const a = newSim();
    a.join("p1", {});
    a.join("p2", {});
    const b = newSim();
    b.join("p1", {});
    b.join("p2", {});
    expect(stateHash(a.state)).toBe(stateHash(b.state));
    const json = { b: 1, a: { d: 2, c: 3 } };
    const reordered = { a: { c: 3, d: 2 }, b: 1 };
    expect(stateHash({ toJSON: () => json })).toBe(stateHash({ toJSON: () => reordered }));
  });
});
