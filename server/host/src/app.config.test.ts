import { afterEach, describe, expect, it } from "vitest";
import { createGameServer, createGameServerContext } from "./app.config.ts";
import { boot, type ColyseusTestServer, captureLog } from "./testing/index.ts";

let server: ColyseusTestServer | undefined;
afterEach(async () => {
  await server?.shutdown();
  server = undefined;
});

async function bootWith(env: "development" | "production", port: number) {
  const ctx = createGameServerContext("template", captureLog());
  ctx.deps.env = env;
  server = await boot(createGameServer({ gameId: "template" }, ctx), port);
  return `http://127.0.0.1:${port}`;
}

describe("createGameServer", () => {
  it("/colyseus is not mounted in production", async () => {
    const base = await bootWith("production", 2603);
    expect((await fetch(`${base}/colyseus`)).status).toBe(404);
    expect((await fetch(`${base}/api/stats`)).status).toBe(200);
  });

  it("/colyseus is mounted in development", async () => {
    const base = await bootWith("development", 2604);
    expect((await fetch(`${base}/colyseus/`)).status).toBe(200);
  });
});
