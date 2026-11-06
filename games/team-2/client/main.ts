import { Client, type Room } from "@colyseus/sdk";
import { clues, type EscapeAction, type EscapeSnapshot, escapeRoomName } from "../shared/escape.ts";
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
const password = element<HTMLInputElement>("#password");
const roomCode = element<HTMLInputElement>("#room-code");
const roomActions = element<HTMLFieldSetElement>("#room-actions");
const submitPassword = element<HTMLButtonElement>("#submit-password");
let room: Room | undefined;

function render(state: EscapeSnapshot) {
  const active = state.phase === "running";
  const seconds = String(state.seconds % 60).padStart(2, "0");
  timer.textContent = state.phase === "escaped" ? "FREE" : `0${Math.floor(state.seconds / 60)}:${seconds}`;
  round.textContent = `Loop ${state.loop} · ${state.players}/2 patients`;
  game.dataset.danger = String(active && state.seconds <= 10);
  game.dataset.phase = state.phase;
  roomActions.disabled = !active;
  password.disabled = !active || !state.cabinetOpen || state.terminalUnlocked;
  submitPassword.disabled = password.disabled;
  if (password.disabled) password.value = "";
  inventory.textContent = state.hasKey ? "Rusted key" : "Empty";
  if (status.textContent !== state.message) status.textContent = state.message;
  notebook.replaceChildren(
    ...state.clues.map((clue) => {
      const line = document.createElement("li");
      line.textContent = clues[clue];
      return line;
    }),
  );
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
for (const button of roomActions.querySelectorAll<HTMLButtonElement>("button[data-target]")) {
  button.addEventListener("click", () => {
    const target = button.dataset.target as Extract<EscapeAction, { type: "inspect" }>["target"];
    send({ type: "inspect", target });
  });
}
terminal.addEventListener("submit", (event) => {
  event.preventDefault();
  send({ type: "password", code: password.value });
  password.select();
});
