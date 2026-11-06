import { Client, type Room } from "@colyseus/sdk";
import {
  clues,
  type EscapeAction,
  type EscapeClue,
  type EscapeSnapshot,
  escapeRoomName,
  type Station,
} from "../shared/escape.ts";
import "./style.css";

const endpoint =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV ? `${location.protocol}//${location.hostname}:2567` : location.origin);
const client = new Client(endpoint);

function element<T extends HTMLElement>(selector: string): T {
  const result = document.querySelector<T>(selector);
  if (!result) throw new Error(`Missing game element: ${selector}`);
  return result;
}

const lobby = element<HTMLFormElement>("#lobby");
const code = element<HTMLInputElement>("#code");
const create = element<HTMLButtonElement>("#create");
const join = element<HTMLButtonElement>("#join");
const game = element<HTMLElement>("#game");
const status = element<HTMLElement>("#status");
const timer = element<HTMLElement>("#timer");
const round = element<HTMLElement>("#round");
const notebook = element<HTMLElement>("#notebook");
const inventory = element<HTMLElement>("#inventory");
const terminal = element<HTMLFormElement>("#terminal");
const relayStatus = element<HTMLElement>("#relay-status");
const password = element<HTMLInputElement>("#password");
const roomCode = element<HTMLInputElement>("#room-code");
const roomActions = element<HTMLFieldSetElement>("#room-actions");
const submitPassword = element<HTMLButtonElement>("#submit-password");
const scene = element<HTMLElement>("#scene");
const wardView = element<HTMLButtonElement>("#ward-view");
const securityView = element<HTMLButtonElement>("#security-view");
const restart = element<HTMLButtonElement>("#restart");
const inspection = element<HTMLDialogElement>("#inspection");
const inspectionTitle = element<HTMLElement>("#inspection-title");
const inspectionText = element<HTMLElement>("#inspection-text");
const flipPhoto = element<HTMLButtonElement>("#flip-photo");
const clueTitles: Record<EscapeClue, string> = {
  note: "Admission note",
  cabinet: "Cabinet slip",
  photo: "Staff photograph",
  terminal: "Terminal instructions",
};
let notebookKey = "";
const evidence = element<HTMLElement>("#evidence");
const patients = [element<HTMLElement>("#patient-1"), element<HTMLElement>("#patient-2")];
const stationButtons = [...roomActions.querySelectorAll<HTMLButtonElement>("button[data-target]")];
const stationOrder: Station[] = ["note", "painting", "cabinet", "photo", "terminal", "exit"];
let selected: Station = "note";
let snapshot: EscapeSnapshot | undefined;
let room: Room | undefined;

function showArea(area: string) {
  scene.dataset.view = area;
  wardView.setAttribute("aria-pressed", String(area === "ward"));
  securityView.setAttribute("aria-pressed", String(area === "security"));
  for (const button of stationButtons) button.hidden = button.dataset.area !== area;
}

function selectStation(station: Station) {
  selected = station;
  const area = stationOrder.indexOf(station) < 3 ? "ward" : "security";
  showArea(area);
  for (const button of stationButtons) button.dataset.selected = String(button.dataset.target === station);
  send({ type: "move", station });
}

function inspect(station: Station) {
  if (snapshot?.phase !== "running") return;
  selectStation(station);
  if (station === "terminal") {
    if (!password.disabled) password.focus();
    else
      status.textContent = snapshot.terminalUnlocked
        ? "The terminal has unlocked the exit."
        : "Ask your partner to stay at the open medicine cabinet to power the terminal.";
    return;
  }
  send({ type: "inspect", target: station });
  if (station !== "note" && station !== "photo" && station !== "cabinet") return;
  if (station === "cabinet" && !snapshot.hasKey && !snapshot.cabinetOpen) return;
  showEvidence(station, station === "photo");
}

function showEvidence(clue: EscapeClue, front = false) {
  evidence.dataset.kind = clue === "photo" && !front ? "photo-back" : clue;
  inspectionTitle.textContent = clueTitles[clue];
  inspectionText.textContent = front
    ? "Ward 04 staff. Someone in the photograph has your face."
    : clues[clue];
  flipPhoto.hidden = !front;
  if (!inspection.open) inspection.showModal();
}

function renderPatients(state: EscapeSnapshot) {
  for (const [index, avatar] of patients.entries()) {
    const patient = state.patients.find((entry) => entry.slot === index + 1);
    avatar.hidden = !patient;
    avatar.dataset.station = patient?.station ?? "spawn";
    avatar.dataset.local = String(patient?.id === room?.sessionId);
  }
}

function render(state: EscapeSnapshot) {
  if (snapshot && snapshot.attempt !== state.attempt) {
    selected = "note";
    showArea("ward");
    for (const button of stationButtons) button.dataset.selected = "false";
  }
  snapshot = state;
  renderPatients(state);
  const active = state.phase === "running";
  restart.hidden = state.phase !== "failed" && state.phase !== "escaped";
  restart.disabled = state.players !== 2;
  if (!active && inspection.open) inspection.close();
  const seconds = String(state.seconds % 60).padStart(2, "0");
  timer.textContent = state.phase === "escaped" ? "FREE" : `0${Math.floor(state.seconds / 60)}:${seconds}`;
  round.textContent = `Attempt ${state.attempt} · ${state.players}/2 patients`;
  game.dataset.danger = String(active && state.seconds <= 10);
  game.dataset.phase = state.phase;
  roomActions.disabled = !active;
  const relay = state.cabinetOpen && state.patients.find((patient) => patient.station === "cabinet");
  const partnerAtRelay =
    state.cabinetOpen &&
    state.patients.some((patient) => patient.id !== room?.sessionId && patient.station === "cabinet");
  relayStatus.textContent = state.terminalUnlocked
    ? "Exit contacts unlocked."
    : partnerAtRelay
      ? "Relay live. Enter the access code."
      : relay
        ? "You are powering the terminal. Stay here while your partner enters the code."
        : "Relay offline. One player must stay at the open cabinet.";
  password.disabled = !active || !partnerAtRelay || state.terminalUnlocked;
  submitPassword.disabled = password.disabled;
  if (password.disabled) password.value = "";
  inventory.textContent = state.hasKey ? "Rusted key" : "Empty";
  if (status.textContent !== state.message) status.textContent = state.message;
  const nextNotebookKey = JSON.stringify([active, state.clues]);
  if (nextNotebookKey === notebookKey) return;
  notebookKey = nextNotebookKey;
  notebook.replaceChildren();
  for (const clue of state.clues) {
    const line = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = clueTitles[clue];
    button.disabled = !active;
    button.addEventListener("click", () => showEvidence(clue));
    line.append(button);
    notebook.append(line);
  }
  if (!state.clues.length) {
    const line = document.createElement("li");
    line.textContent = "Nothing written yet.";
    notebook.append(line);
  }
}

async function connect(roomId?: string) {
  create.disabled = true;
  join.disabled = true;
  status.textContent = "Listening for the ward…";
  try {
    const connected = roomId ? await client.joinById(roomId) : await client.create(escapeRoomName);
    room = connected;
    connected.onMessage("snapshot", render);
    connected.onLeave(() => {
      room = undefined;
      snapshot = undefined;
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

function send(action: EscapeAction) {
  room?.send("action", action);
}

create.addEventListener("click", () => void connect());
lobby.addEventListener("submit", (event) => {
  event.preventDefault();
  if (code.value.trim()) void connect(code.value.trim());
});
roomCode.addEventListener("focus", () => roomCode.select());
showArea("ward");
wardView.addEventListener("click", () => selectStation("note"));
securityView.addEventListener("click", () => selectStation("photo"));
flipPhoto.addEventListener("click", () => {
  send({ type: "flip-photo" });
  showEvidence("photo");
  element<HTMLButtonElement>("#close-inspection").focus();
});
restart.addEventListener("click", () => send({ type: "restart" }));
for (const [index, button] of stationButtons.entries()) {
  const station = stationOrder[index];
  if (station) button.addEventListener("click", () => inspect(station));
}
document.addEventListener("keydown", (event) => {
  if (snapshot?.phase !== "running" || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (inspection.open) {
    if (event.key.toLowerCase() === "e") inspection.close();
    return;
  }
  if (event.key.toLowerCase() === "e") {
    event.preventDefault();
    inspect(selected);
    return;
  }
  let index = /^[1-6]$/.test(event.key) ? Number(event.key) - 1 : -1;
  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    const step = event.key === "ArrowRight" ? 1 : -1;
    index = (stationOrder.indexOf(selected) + step + stationOrder.length) % stationOrder.length;
  }
  const station = stationOrder[index];
  if (station) {
    event.preventDefault();
    selectStation(station);
  }
});
terminal.addEventListener("submit", (event) => {
  event.preventDefault();
  send({ type: "password", code: password.value });
  password.select();
});
