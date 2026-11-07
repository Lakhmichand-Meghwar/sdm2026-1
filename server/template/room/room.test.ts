import { createGameRoom, createGameServer, createGameServerContext } from "@sdm/host";
import { boot, type ColyseusTestServer } from "@sdm/host/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { templateGame } from "../shared/game.ts";
import { rooms } from "./index.ts";

const ctx = createGameServerContext("template");
const quickExpiry = { ...templateGame, config: { ...templateGame.config, reconnectSeconds: 1 } };
const prodDeps = { ...ctx.deps, env: "production" as const };

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  colyseus = await boot(
    createGameServer(
      {
        gameId: "template",
        rooms: {
          ...rooms,
          quick: (deps) => createGameRoom(quickExpiry, deps),
          prod: () => createGameRoom(templateGame, prodDeps),
        },
      },
      ctx,
    ),
    2602,
  );
});
afterAll(() => colyseus.shutdown());
beforeEach(() => colyseus.cleanup());

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("template room", () => {
  it("two clients create and join by code and both see each other", async () => {
    const a = await colyseus.sdk.create("game", { private: true, name: "Ada" });
    await a.waitForInitialState();
    const code = a.state.code as string;
    expect(code).toMatch(/^[A-Z]{4}$/);
    const roomId = ctx.registry.byCode(code.toLowerCase())?.roomId;
    expect(roomId).toBe(a.roomId);
    const b = await colyseus.sdk.joinById(roomId as string, { name: "Bo" });
    await b.waitForInitialState();
    await a.waitForNextPatch();
    expect([...a.state.players.keys()].sort()).toEqual([a.sessionId, b.sessionId].sort());
    expect(b.state.players.get(a.sessionId)?.name).toBe("Ada");
  });

  it("an input moves the player on the next tick and lastSeq updates", async () => {
    const room = await colyseus.createRoom("game", {});
    const client = await colyseus.connectTo(room, { name: "Ada" });
    const before = client.state.players.get(client.sessionId)?.x ?? 0;
    client.send("input", { seq: 1, data: { dx: 1, dy: 0 } });
    await room.waitForNextTimestep();
    await room.waitForNextTimestep();
    await room.waitForNextPatch();
    const p = client.state.players.get(client.sessionId);
    expect(p?.x).toBeGreaterThan(before);
    expect(client.state.seats.get(client.sessionId)?.lastSeq).toBe(1);
  });

  it("a dropped client reconnects into the same seat within reconnectSeconds", async () => {
    const room = await colyseus.createRoom("game", {});
    const client = await colyseus.connectTo(room, { name: "Ada" });
    const token = client.reconnectionToken;
    const sessionId = client.sessionId;
    await client.leave(false);
    await sleep(50);
    expect(room.state.seats.get(sessionId)?.connected).toBe(false);
    const again = await colyseus.sdk.reconnect(token);
    await sleep(50);
    expect(again.sessionId).toBe(sessionId);
    expect(room.state.seats.get(sessionId)?.connected).toBe(true);
    expect(room.state.players.get(sessionId)?.name).toBe("Ada");
  });

  it("after reconnectSeconds the seat is gone; reconnect fails and a fresh join succeeds", async () => {
    const room = await colyseus.createRoom("quick", { private: true });
    const client = await colyseus.connectTo(room, { name: "Ada" });
    const other = await colyseus.connectTo(room, { name: "Keeps room open" });
    const token = client.reconnectionToken;
    const sessionId = client.sessionId;
    await client.leave(false);
    await sleep(1_400);
    expect(room.state.seats.has(sessionId)).toBe(false);
    await expect(colyseus.sdk.reconnect(token)).rejects.toThrow();
    const fresh = await colyseus.sdk.joinById(room.roomId, { name: "Ada" });
    expect(fresh.sessionId).not.toBe(sessionId);
    expect(other.sessionId).toBeTruthy();
  });

  it("debug commands are rejected in production", async () => {
    const room = await colyseus.createRoom("prod", {});
    const client = await colyseus.connectTo(room, {});
    const reply = client.waitForMessage("debug:result");
    client.send("debug:command", { id: "1", command: "spawn" });
    expect(await reply).toMatchObject({ ok: false });
  });
});
