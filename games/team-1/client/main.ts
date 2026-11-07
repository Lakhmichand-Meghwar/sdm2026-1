import { Client, type Room } from "@colyseus/sdk";
import { normalizeRoomCode, readClientParams, serverUrlFromPage } from "@sdm/core/client";
import { JoinByCodeResponseSchema, Routes, ServerMessage } from "@sdm/core/shared";
import { timeLoopGame } from "../shared/game.ts";
import type { TimeLoopInput, TimeLoopState } from "../shared/index.ts";
import { isClueId } from "../shared/rules.ts";
import "./style.css";
import { currentInviteLink, loadNetworkAddress } from "./invite.ts";
import { TAPS } from "./targets.ts";
import * as ui from "./ui.ts";
import * as view from "./view.ts";

/**
 * In local dev the server runs on :2567 of whatever host served the page, so a phone on the LAN works too.
 * Deployed builds are served by the server itself, possibly under a path (`<address>/team-1/` behind the
 * gateway), so the address comes from the page, not `location.origin`.
 */
const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV
    ? `${location.protocol}//${location.hostname}:2567`
    : serverUrlFromPage(location.href));

const ROOM_NAME = "game";
const TOKEN_KEY = "sdm:tle:token";
const NAME_KEY = "sdm:tle:name";

const params = readClientParams(location.search);
const client = new Client(SERVER_URL);

let room: Room<TimeLoopState> | null = null;
let seq = 0;

const INTRO = [
  {
    title: "The loop",
    body: "You wake up in a locked room with a clock running. When it reaches zero the room resets: objects vanish and every door locks again.",
  },
  {
    title: "Two detectives",
    body: "You and a partner play together, each on your own device, in the same room. Each of you can only touch some of the things in it, so describe what you see and tell each other what you find.",
  },
  {
    title: "What stays",
    body: "Items reset every loop. What you learned does not. The clue journal at the bottom keeps everything, even when you move to a new room.",
  },
  {
    title: "Three rooms",
    body: "The Office, the Archive, the Vault. Each room gives you less time and a harder puzzle. From the second room a wrong move costs 5 seconds.",
  },
] as const;

let introIndex = 0;

// ── storage ───────────────────────────────────────────────────────────────────

/** Storage can throw in private windows; the game still works without it. */
function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

// ── connection ────────────────────────────────────────────────────────────────

function send(input: TimeLoopInput): void {
  room?.send("input", { seq: ++seq, data: input });
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function connect(joined: Room<TimeLoopState>): void {
  room = joined;
  seq = 0;
  view.resetView();
  safe(() => sessionStorage.setItem(TOKEN_KEY, joined.reconnectionToken));

  joined.onMessage(ServerMessage.Notice, (notice: { text: string }) => ui.toast(notice.text, "warn"));
  joined.onMessage(ServerMessage.DebugStats, () => {});
  joined.onMessage(ServerMessage.DebugResult, () => {});
  joined.onStateChange((state) => view.render(state, joined.sessionId));
  joined.onLeave(() => {
    if (room !== joined) return;
    ui.setLostText("You were disconnected from the room.");
    ui.setOverlay("lost");
  });

  ui.showMain("game");
  if (joined.state?.phase) view.render(joined.state, joined.sessionId);
}

async function createRoom(solo: boolean): Promise<void> {
  const time = ui.getLoopTime();
  connect(await client.create<TimeLoopState>(ROOM_NAME, { private: true, name: chosenName(), solo, time }));
}

async function joinByCode(raw: string): Promise<void> {
  const code = normalizeRoomCode(raw);
  if (!code) throw new Error("A room code is four letters.");
  const res = await fetch(`${SERVER_URL}${Routes.joinByCode}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (res.status === 404) throw new Error("No room with that code.");
  if (res.status === 409) throw new Error("That room is full.");
  if (!res.ok) throw new Error(`The server answered ${res.status}.`);
  const { roomId } = JoinByCodeResponseSchema.parse(await res.json());
  connect(await client.joinById<TimeLoopState>(roomId, { name: chosenName() }));
}

async function tryReconnect(): Promise<boolean> {
  const token = safe(() => sessionStorage.getItem(TOKEN_KEY));
  if (!token) return false;
  try {
    connect(await client.reconnect<TimeLoopState>(token));
    return true;
  } catch {
    safe(() => sessionStorage.removeItem(TOKEN_KEY));
    return false;
  }
}

function chosenName(): string {
  const name = ui.getLobbyName();
  safe(() => localStorage.setItem(NAME_KEY, name));
  return name;
}

// ── intro and lobby ───────────────────────────────────────────────────────────

function showIntroSlide(): void {
  const slide = INTRO[introIndex];
  if (!slide) return;
  ui.renderIntroSlide(introIndex, INTRO.length, slide.title, slide.body, introIndex === INTRO.length - 1);
}

function startIntro(): void {
  introIndex = 0;
  showIntroSlide();
  ui.showMain("intro");
}

function nextIntro(): void {
  if (introIndex >= INTRO.length - 1) {
    showLobby();
    return;
  }
  introIndex += 1;
  showIntroSlide();
}

function showLobby(): void {
  ui.setLobbyName(params.name ?? safe(() => localStorage.getItem(NAME_KEY)) ?? "");
  if (params.room) ui.setLobbyCode(params.room);
  ui.setLobbyError("");
  ui.showMain("lobby");
}

async function lobbyAction(action: () => Promise<void>): Promise<void> {
  ui.setLobbyError("");
  ui.setLobbyBusy(true);
  try {
    await action();
  } catch (err) {
    ui.setLobbyError(errorText(err));
  } finally {
    ui.setLobbyBusy(false);
  }
}

async function copyInvite(button: HTMLElement | null): Promise<void> {
  const code = document.getElementById("room-code")?.textContent ?? "";
  if (!button || !normalizeRoomCode(code)) return;
  const label = button.textContent;
  try {
    await navigator.clipboard.writeText(currentInviteLink(code));
    button.textContent = "Copied";
  } catch {
    button.textContent = "Select the link and copy it";
  }
  setTimeout(() => {
    button.textContent = label;
  }, 2000);
}

async function retryConnection(): Promise<void> {
  if (await tryReconnect()) {
    ui.setOverlay(null);
    return;
  }
  ui.setLostText("The room is gone or the seat expired. Go back to the lobby to start again.");
}

// ── submitting a code ─────────────────────────────────────────────────────────

function submitCode(): void {
  const kind = view.pendingCodeKind();
  if (kind) send({ type: "code", kind, value: ui.getCodeInput() });
}

// ── event bindings ────────────────────────────────────────────────────────────

function bind(id: string, handler: () => void): void {
  document.getElementById(id)?.addEventListener("click", handler);
}

function bindEnter(id: string, handler: () => void): void {
  document.getElementById(id)?.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") handler();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  ui.startRain();
  ui.renderLoopTimes(timeLoopGame.config.loopTimes, timeLoopGame.config.defaultLoopTime);
  void loadNetworkAddress();

  bind("btn-start", startIntro);
  bind("intro-next", nextIntro);
  bind("intro-skip", showLobby);

  bind("lobby-create", () => void lobbyAction(() => createRoom(false)));
  bind("lobby-solo", () => void lobbyAction(() => createRoom(true)));
  bind("lobby-join", () => void lobbyAction(() => joinByCode(ui.getLobbyCode())));
  bindEnter("lobby-code", () => void lobbyAction(() => joinByCode(ui.getLobbyCode())));
  bind("wait-copy", () => void copyInvite(document.getElementById("wait-copy")));
  bind("invite-copy", () => void copyInvite(document.getElementById("invite-copy")));

  bind("brief-go", () => send({ type: "ready" }));
  bind("btn-restart", () => send({ type: "restart" }));

  bind("btn-pause", () => send({ type: "pause" }));
  bind("paused-resume", () => send({ type: "resume" }));
  for (const id of ["btn-end", "paused-end", "brief-end"]) {
    bind(id, () => ui.openConfirmEnd(room?.state.solo === true));
  }
  bind("confirm-end-no", ui.closeConfirmEnd);
  bind("confirm-end-yes", () => {
    ui.closeConfirmEnd();
    send({ type: "end" });
  });
  document.getElementById("confirm-end")?.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape") ui.closeConfirmEnd();
  });
  bind("ended-restart", () => send({ type: "restart" }));
  bind("ended-lobby", () => {
    // Clear `room` first so its onLeave doesn't show "Connection lost" for a leave we asked for.
    const leaving = room;
    room = null;
    void leaving?.leave();
    safe(() => sessionStorage.removeItem(TOKEN_KEY));
    ui.setOverlay(null);
    showLobby();
  });

  bind("lost-retry", () => void retryConnection());
  bind("lost-lobby", () => {
    room = null;
    safe(() => sessionStorage.removeItem(TOKEN_KEY));
    ui.setOverlay(null);
    showLobby();
  });

  for (const [id, target] of Object.entries(TAPS)) {
    bind(id, () => send({ type: "interact", target }));
  }

  document.getElementById("clue-list")?.addEventListener("click", (e) => {
    const clue = (e.target as HTMLElement).closest<HTMLElement>(".clue-share")?.dataset.clue;
    if (clue && isClueId(clue)) send({ type: "share", clue });
  });

  bind("modal-cancel", ui.closeCodeModal);
  bind("modal-close", ui.closeCodeModal);
  bind("modal-submit", submitCode);
  bindEnter("code-input", submitCode);
  document.getElementById("code-input")?.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape") ui.closeCodeModal();
  });
  document.getElementById("modal-laptop")?.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).id === "modal-laptop") ui.closeCodeModal();
  });

  // A refresh keeps the seat; a shared invite link goes straight to the intro and then the lobby.
  void tryReconnect();
});
