import { Client, type Room } from "@colyseus/sdk";
import { serverUrlFromPage } from "@sdm/core/client";
import {
  type EscapeAction,
  type EscapeSnapshot,
  escapeRoomName,
  type Station,
  stations,
  type Tool,
  tickMs,
} from "../shared/escape.ts";
import { cabinetOpened, playCabinet } from "./cabinet.ts";
import { canvasSlashed, playCanvasSlash } from "./canvas.ts";
import { playDrawer } from "./drawer.ts";
import { playFootsteps, unlockAudio, walkers } from "./footsteps.ts";
import { ghostPresent, setGhostPresence } from "./ghost.ts";
import { keyUnlockSeconds, playKeyUnlock } from "./key.ts";
import { knifeTaken, playKnife } from "./knife.ts";
import "./style.css";

const endpoint =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV
    ? `${location.protocol}//${location.hostname}:2567`
    : serverUrlFromPage(location.href));
const client = new Client(endpoint);

function element<T extends HTMLElement>(id: string): T {
  const result = document.querySelector<T>(`#${id}`);
  if (!result) throw new Error(`Missing game element: ${id}`);
  return result;
}

const app = element("ward-app");
const lobby = element<HTMLFormElement>("lobby");
const code = element<HTMLInputElement>("code");
const create = element<HTMLButtonElement>("create");
const join = element<HTMLButtonElement>("join");
const game = element("game");
const status = element("status");
const roomCode = element<HTMLInputElement>("room-code");
const scene = element("scene");
const wardView = element<HTMLButtonElement>("ward-view");
const securityView = element<HTMLButtonElement>("security-view");
const restart = element<HTMLButtonElement>("restart");
const roomActions = element<HTMLFieldSetElement>("room-actions");
const stationButtons = [...roomActions.querySelectorAll<HTMLButtonElement>("[data-target]")];
const inspection = element<HTMLDialogElement>("inspection");
const evidence = element("evidence");
const collect = element<HTMLButtonElement>("collect");
const inspectInventory = element<HTMLButtonElement>("inspect-inventory");
const lock = element<HTMLFormElement>("lock");
const lockCode = element<HTMLInputElement>("lock-code");
const drawer = element("drawer");
const drawerToggle = element<HTMLButtonElement>("drawer-toggle");
const inventory = element("inventory");
const notebook = element("notebook");
const ghost = element("ghost");
const holdGhost = element<HTMLButtonElement>("hold-ghost");
const avatars = [element("patient-1"), element("patient-2")];
const meters = [element<HTMLProgressElement>("resist-1"), element<HTMLProgressElement>("resist-2")];
const names: Record<Station, string> = {
  note: "Half-burnt paper",
  desk: "Desk drawer",
  painting: "Blue painting",
  cabinet: "Medicine cabinet",
  photo: "Staff photograph",
  exit: "Exit lock",
};
const toolNames: Record<Tool, string> = { knife: "Knife", key: "Rusted key" };
const skyClue = "Go to the part that has the colour of a free sky.";
const cabinetClue =
  "The staff photograph is locked. Enter the four digits from the burnt paper, then read the year.";
let room: Room | undefined;
let snapshot: EscapeSnapshot | undefined;
let selected: Station = "note";
let opened: Station | undefined;
let pickup: Tool | undefined;
let drawerKey = "";
let holding = false;

function send(action: EscapeAction) {
  room?.send("action", action);
}

function selectStation(station: Station) {
  selected = station;
  const security = station === "photo" || station === "exit";
  scene.dataset.view = security ? "security" : "ward";
  wardView.setAttribute("aria-pressed", String(!security));
  securityView.setAttribute("aria-pressed", String(security));
  for (const button of stationButtons) {
    button.hidden = button.dataset.area !== scene.dataset.view;
    button.dataset.selected = String(button.dataset.target === station);
  }
}

function setDrawer(open: boolean) {
  if (open && drawer.hidden) playDrawer();
  drawer.hidden = !open;
  drawerToggle.setAttribute("aria-expanded", String(open));
}

function inspect(station: Station) {
  if (snapshot?.phase !== "running" || snapshot.ghostSeconds !== null) return;
  selectStation(station);
  if (station === "desk") playDrawer();
  opened = station;
  lockCode.value = "";
  setDrawer(false);
  send({ type: "inspect", station });
  renderInspection(snapshot);
  if (!inspection.open) inspection.showModal();
}

function renderInspection(state: EscapeSnapshot) {
  if (!opened) return;
  let content: string;
  pickup = undefined;
  let needsInventory = false;
  let lockLabel = "";
  switch (opened) {
    case "note":
      content = state.paper ? `Code: ${state.paper}. ${skyClue}` : "Unfolding the paper…";
      break;
    case "desk":
      if (!state.inventory.includes("knife")) pickup = "knife";
      content = pickup ? "A knife lies inside the open drawer." : "The drawer is empty.";
      break;
    case "painting":
      if (state.paintingCut && !state.inventory.includes("key") && !state.cabinetOpen) pickup = "key";
      needsInventory = !state.paintingCut;
      content = state.paintingCut
        ? pickup
          ? "A rusted key glints behind the torn canvas."
          : "The canvas hangs in strips."
        : "Something bulges behind the blue canvas. A blade could cut it open.";
      break;
    case "cabinet":
      needsInventory = !state.cabinetOpen;
      content = state.cabinetOpen ? cabinetClue : "Locked. The keyhole is lined with rust.";
      break;
    case "photo":
      if (state.cabinetOpen && !state.year) lockLabel = "Code from the burnt paper";
      content = state.year
        ? `The date on the photograph is ${state.year}.`
        : "The frame is sealed with a four-digit lock.";
      break;
    case "exit":
      if (state.year) lockLabel = "Year from the photograph";
      content = state.year
        ? "Enter the year to open the exit."
        : "The exit has a four-digit lock. Find the year first.";
      break;
  }
  evidence.dataset.kind = opened;
  evidence.dataset.pickup = pickup ?? "";
  element("inspection-title").textContent = names[opened];
  element("inspection-text").textContent = content;
  collect.hidden = !pickup;
  collect.textContent = pickup ? `Take ${toolNames[pickup].toLowerCase()}` : "";
  inspectInventory.hidden = !needsInventory;
  lock.hidden = !lockLabel;
  element("lock-label").textContent = lockLabel;
  element("lock-feedback").textContent = state.message;
}

function renderDrawer(state: EscapeSnapshot) {
  const active = state.phase === "running" && state.ghostSeconds === null;
  const patient = state.patients.find((entry) => entry.id === room?.sessionId);
  const key = JSON.stringify([
    state.inventory,
    state.paper,
    state.cabinetOpen,
    state.year,
    active,
    patient?.station,
  ]);
  if (key === drawerKey) return;
  drawerKey = key;
  inventory.replaceChildren();
  for (const item of state.inventory) {
    const line = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Use ${toolNames[item]}`;
    const station = item === "knife" ? "painting" : "cabinet";
    button.disabled = !active || patient?.station !== station || (item === "knife" && state.paintingCut);
    button.addEventListener("click", () => {
      send({ type: "use", item });
      inspect(station);
    });
    line.append(button);
    inventory.append(line);
  }
  if (!state.inventory.length) inventory.textContent = "Empty";
  const clues = [
    state.paper && `Burnt paper: ${state.paper}. ${skyClue}`,
    state.cabinetOpen && cabinetClue,
    state.year && `Photograph year: ${state.year}`,
  ].filter((clue): clue is string => typeof clue === "string");
  notebook.replaceChildren(
    ...(clues.length ? clues : ["No clues yet."]).map((clue) => {
      const line = document.createElement("li");
      line.textContent = clue;
      return line;
    }),
  );
}

function render(state: EscapeSnapshot) {
  if (snapshot?.attempt !== state.attempt) {
    selectStation("note");
    setDrawer(false);
  }
  for (const id of walkers(snapshot?.patients, state.patients)) playFootsteps(id === room?.sessionId);
  if (cabinetOpened(snapshot, state)) {
    playKeyUnlock();
    playCabinet(keyUnlockSeconds);
  }
  if (knifeTaken(snapshot, state)) playKnife();
  if (canvasSlashed(snapshot, state)) playCanvasSlash();
  setGhostPresence(ghostPresent(state));
  snapshot = state;
  const encounter = state.ghostSeconds !== null;
  const active = state.phase === "running";
  if ((!active || encounter) && inspection.open) inspection.close();
  if (encounter) setDrawer(false);
  ghost.hidden = !encounter;
  if (!encounter) holding = false;
  element("ghost-clock").textContent = `${state.ghostSeconds ?? 0}s to repel it`;
  avatars.forEach((avatar, index) => {
    const patient = state.patients.find((entry) => entry.slot === index + 1);
    avatar.hidden = !patient;
    avatar.dataset.station = patient?.station ?? "spawn";
    avatar.dataset.local = String(patient?.id === room?.sessionId);
    const meter = meters[index];
    if (meter) meter.value = ((patient?.resistance ?? 0) * tickMs) / 1000;
  });
  restart.hidden = state.phase !== "failed" && state.phase !== "escaped";
  restart.disabled = state.patients.length !== 2;
  game.dataset.phase = state.phase;
  game.dataset.danger = String(active && state.seconds <= 10);
  roomActions.disabled = !active || encounter;
  drawerToggle.disabled = encounter;
  const seconds = String(state.seconds % 60).padStart(2, "0");
  element("timer").textContent =
    state.phase === "escaped" ? "FREE" : `0${Math.floor(state.seconds / 60)}:${seconds}`;
  element("round").textContent = `Attempt ${state.attempt} · ${state.patients.length}/2 patients`;
  if (status.textContent !== state.message) status.textContent = state.message;
  renderDrawer(state);
  if (inspection.open) renderInspection(state);
}

async function connect(id?: string) {
  create.disabled = true;
  join.disabled = true;
  try {
    const connected = id ? await client.joinById(id) : await client.create(escapeRoomName);
    room = connected;
    connected.onMessage("snapshot", render);
    connected.onLeave(() => {
      room = undefined;
      snapshot = undefined;
      setGhostPresence(false);
      holding = false;
      if (inspection.open) inspection.close();
      game.hidden = true;
      lobby.hidden = false;
      status.textContent = "Connection lost. Re-enter the room code to return.";
    });
    roomCode.value = connected.roomId;
    code.value = connected.roomId;
    lobby.hidden = true;
    game.hidden = false;
    connected.send("sync");
  } catch {
    status.textContent = "Could not enter the ward. Check the room code or try again.";
  } finally {
    create.disabled = false;
    join.disabled = false;
  }
}

function resist(pressed: boolean) {
  if (holding === pressed) return;
  holding = pressed;
  send({ type: "ward-off", pressed });
}

function move(station: Station) {
  selectStation(station);
  send({ type: "move", station });
}

document.addEventListener("pointerdown", unlockAudio);
document.addEventListener("keydown", unlockAudio);
create.addEventListener("click", () => void connect());
lobby.addEventListener("submit", (event) => {
  event.preventDefault();
  if (code.value.trim()) void connect(code.value.trim());
});
roomCode.addEventListener("focus", () => roomCode.select());
wardView.addEventListener("click", () => move("note"));
securityView.addEventListener("click", () => move("photo"));
restart.addEventListener("click", () => send({ type: "restart" }));
drawerToggle.addEventListener("click", () => setDrawer(drawer.hidden));
element("close-drawer").addEventListener("click", () => {
  setDrawer(false);
  drawerToggle.focus();
});
inspectInventory.addEventListener("click", () => {
  inspection.close();
  setDrawer(true);
  element("close-drawer").focus();
});
collect.addEventListener("click", () => {
  if (pickup) send({ type: "collect", item: pickup });
});
lock.addEventListener("submit", (event) => {
  event.preventDefault();
  send({ type: "code", code: lockCode.value });
});
element("fullscreen").addEventListener("click", () => {
  const change = document.fullscreenElement ? document.exitFullscreen() : app.requestFullscreen();
  void change.catch(() => {
    status.textContent = "Fullscreen is unavailable in this browser.";
  });
});
for (const button of stationButtons) {
  const station = stations.find((entry) => entry === button.dataset.target);
  if (station) button.addEventListener("click", () => inspect(station));
}
holdGhost.addEventListener("pointerdown", (event) => {
  holdGhost.setPointerCapture(event.pointerId);
  resist(true);
});
holdGhost.addEventListener("lostpointercapture", () => resist(false));
window.addEventListener("blur", () => resist(false));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) resist(false);
});
document.addEventListener("keyup", (event) => {
  if (event.code === "KeyE") resist(false);
});
document.addEventListener("keydown", (event) => {
  if (snapshot?.phase !== "running" || event.altKey || event.ctrlKey || event.metaKey) return;
  if (snapshot.ghostSeconds !== null) {
    if (event.code === "KeyE") {
      event.preventDefault();
      resist(true);
    }
    return;
  }
  if (event.repeat || event.target instanceof HTMLInputElement) return;
  if (inspection.open) return;
  if (event.code === "KeyE") {
    event.preventDefault();
    inspect(selected);
    return;
  }
  let index = /^[1-6]$/.test(event.key) ? Number(event.key) - 1 : -1;
  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    const step = event.key === "ArrowRight" ? 1 : -1;
    index = (stations.indexOf(selected) + step + stations.length) % stations.length;
  }
  const station = stations[index];
  if (station) {
    event.preventDefault();
    move(station);
  }
});
selectStation("note");
