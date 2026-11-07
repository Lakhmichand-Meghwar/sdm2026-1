/**
 * Template game client. Deliberately minimal: a lobby (create, or join by code), a Canvas 2D view
 * and keyboard input, plus the ~ debug overlay and its console from @sdm/core/client. The rest of the
 * client core (prediction, interpolation, F8) comes in #13; teams replace this file with their own
 * lobby and renderer.
 */
import { Client, type Room } from "@colyseus/sdk";
import {
  type BuildInfo,
  buildInviteLink,
  createDebugOverlay,
  createFrameMeter,
  normalizeRoomCode,
  readClientParams,
} from "@sdm/core/client";
import {
  ClientMessage,
  type DebugResult,
  HealthResponseSchema,
  JoinByCodeResponseSchema,
  type Notice,
  Routes,
  ServerMessage,
} from "@sdm/core/shared";
import { templateGame } from "../shared/game.ts";
import type { SampleState } from "../shared/index.ts";

/** In local dev the server runs on :2567; deployed builds are served by the server itself. */
export const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ?? (import.meta.env.DEV ? "http://localhost:2567" : location.origin);

const ROOM_NAME = "game";
const TOKEN_KEY = "sdm:reconnectionToken";
const CODE_KEY = "sdm:roomCode";

const app = document.getElementById("app") as HTMLElement;
const params = readClientParams(location.search);
const client = new Client(SERVER_URL);

async function main(): Promise<void> {
  const health = HealthResponseSchema.parse(await (await fetch(`${SERVER_URL}${Routes.health}`)).json());
  const room = (await tryReconnect()) ?? (params.room ? await joinByCode(params.room) : null);
  if (room) play(room, health);
  else showLobby(health);
}

async function tryReconnect(): Promise<Room<SampleState> | null> {
  const token = safeSession(() => sessionStorage.getItem(TOKEN_KEY));
  if (!token) return null;
  try {
    return await client.reconnect<SampleState>(token);
  } catch {
    // Seat expired or room closed: fall back to the saved code, as a new player.
    safeSession(() => sessionStorage.removeItem(TOKEN_KEY));
    const code = safeSession(() => sessionStorage.getItem(CODE_KEY));
    return code ? joinByCode(code).catch(() => null) : null;
  }
}

async function joinByCode(raw: string): Promise<Room<SampleState>> {
  const code = normalizeRoomCode(raw);
  if (!code) throw new Error("A room code is four letters.");
  const res = await fetch(`${SERVER_URL}${Routes.joinByCode}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `HTTP ${res.status}`);
  const { roomId } = JoinByCodeResponseSchema.parse(await res.json());
  return client.joinById<SampleState>(roomId, { name: params.name ?? "player" });
}

function showLobby(health: BuildInfo, error?: string): void {
  app.innerHTML = `
    <h1>template</h1>
    <div>env ${health.env} · ${health.sha.slice(0, 7)}</div>
    <p><button id="create">Create room</button></p>
    <p><input id="code" maxlength="4" placeholder="CODE" size="6" /> <button id="join">Join by code</button></p>
    <p class="bad" id="error">${error ?? ""}</p>`;
  const fail = (err: unknown) => showLobby(health, err instanceof Error ? err.message : String(err));
  app.querySelector("#create")?.addEventListener("click", () => {
    client
      .create<SampleState>(ROOM_NAME, { private: true, name: params.name ?? "player" })
      .then((room) => play(room, health), fail);
  });
  app.querySelector("#join")?.addEventListener("click", () => {
    const input = app.querySelector<HTMLInputElement>("#code");
    joinByCode(input?.value ?? "").then((room) => play(room, health), fail);
  });
}

function play(room: Room<SampleState>, health: BuildInfo): void {
  safeSession(() => sessionStorage.setItem(TOKEN_KEY, room.reconnectionToken));
  const { width, height } = templateGame.config.arena;
  app.innerHTML = `<div id="hud"></div><canvas id="view" width="${width}" height="${height}"></canvas>`;
  const hud = app.querySelector("#hud") as HTMLElement;
  const canvas = app.querySelector("#view") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

  const keys = new Set<string>();
  addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
  addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  let seq = 0;
  let left = false;
  // Notices and the disconnect message stay on screen instead of being overwritten by the next frame.
  const showMessage = (text: string) => {
    hud.dataset.locked = "1";
    hud.textContent = text;
  };
  let lastSentAt = 0;
  const sendEveryMs = 1000 / templateGame.config.tickRate;

  room.onMessage(ServerMessage.Notice, (notice: Notice) => {
    showMessage(notice.text);
  });
  // The ~ overlay includes a debug console: commands go to the room, replies come back as debug:result.
  const overlay = createDebugOverlay({
    build: health,
    startOpen: params.debug,
    console: { send: (command) => room.send(ClientMessage.DebugCommand, command) },
  });
  room.onMessage(ServerMessage.DebugStats, () => {});
  room.onMessage(ServerMessage.DebugResult, (result: DebugResult) => overlay.handleDebugResult(result));
  room.onLeave(() => {
    left = true;
    showMessage("Disconnected. Refresh to rejoin.");
  });

  const meter = createFrameMeter(performance.now());
  const axis = (neg: string[], pos: string[]) =>
    (pos.some((k) => keys.has(k)) ? 1 : 0) - (neg.some((k) => keys.has(k)) ? 1 : 0);

  const frame = (now: number) => {
    const state = room.state;
    if (state.code) safeSession(() => sessionStorage.setItem(CODE_KEY, state.code));
    // One input per server tick is enough; the server applies the last input of each tick.
    if (now - lastSentAt >= sendEveryMs) {
      lastSentAt = now;
      room.send("input", {
        seq: ++seq,
        data: {
          dx: axis(["a", "arrowleft"], ["d", "arrowright"]),
          dy: axis(["w", "arrowup"], ["s", "arrowdown"]),
        },
      });
    }

    ctx.fillStyle = "#11161d";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#fcc419";
    for (const p of state.pickups?.values() ?? []) circle(ctx, p.x, p.y, templateGame.config.pickups.radius);
    for (const [id, p] of state.players?.entries() ?? []) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = state.seats.get(id)?.connected === false ? 0.35 : 1;
      circle(ctx, p.x, p.y, templateGame.config.player.radius);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#d6dde4";
      ctx.fillText(`${p.name} ${p.score}`, p.x - 14, p.y - 20);
    }

    const invite = state.code ? buildInviteLink(location.href, state.code) : "(quick match)";
    if (!hud.dataset.locked)
      hud.textContent = `code ${state.code || "-"} · invite ${invite} · WASD/arrows to move`;
    const { fps, frameMs } = meter.frame(now);
    overlay.update({
      roomId: room.roomId,
      roomCode: state.code || null,
      playerId: room.sessionId,
      tick: state.tick ?? null,
      pingMs: null,
      patchesPerSecond: null,
      bytesPerSecond: null,
      fps,
      frameMs,
    });
    if (!left) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** sessionStorage can throw in private windows; the game still works without it. */
function safeSession<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

main().catch((err) => {
  app.innerHTML = `<div class="bad">Can't reach the server at ${SERVER_URL}</div><div>${String(err)}</div>`;
});
