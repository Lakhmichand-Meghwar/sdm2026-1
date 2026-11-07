/** All DOM reads and writes. No game logic here: every setter can be called again with the same value. */
import { CLUE_DEFS, isClueId, type LevelInfo, OWNER, SHELF_ORDER, type Target } from "../shared/rules.ts";

// ── helpers ──────────────────────────────────────────────────────────────────

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} not found`);
  return node as T;
}

function setHidden(id: string, hidden: boolean): void {
  el(id).classList.toggle("hidden", hidden);
}

function setClass(id: string, cls: string, on: boolean): void {
  el(id).classList.toggle(cls, on);
}

function setText(id: string, text: string): void {
  const node = el(id);
  if (node.textContent !== text) node.textContent = text;
}

// ── screens ──────────────────────────────────────────────────────────────────

export type MainScreen = "start" | "intro" | "lobby" | "game" | "win" | "ended";
export type Overlay = "brief" | "wait" | "reset" | "lost" | "paused";

const MAIN_SCREENS: MainScreen[] = ["start", "intro", "lobby", "game", "win", "ended"];
const OVERLAYS: Overlay[] = ["brief", "wait", "reset", "lost", "paused"];

export function showMain(name: MainScreen): void {
  for (const screen of MAIN_SCREENS) setHidden(`screen-${screen}`, screen !== name);
}

/** Shows one overlay on top of the main screen, or none. */
export function setOverlay(name: Overlay | null): void {
  for (const overlay of OVERLAYS) setHidden(`screen-${overlay}`, overlay !== name);
}

// ── pause and end game ───────────────────────────────────────────────────────

/** The top bar's Pause and End game buttons: Pause only while a room is being played. */
export function setGameControls(canPause: boolean, canEnd: boolean): void {
  setHidden("btn-pause", !canPause);
  setHidden("btn-end", !canEnd);
}

export function setPaused(by: string, isMe: boolean): void {
  setText(
    "paused-text",
    isMe ? "You paused the game. The clock is stopped." : `${by} paused the game. The clock is stopped.`,
  );
}

export function setEnded(by: string, isMe: boolean, where: string): void {
  setText(
    "ended-msg",
    `${isMe ? "You" : by} ended the game in ${where}. Play again to start a new game in this room.`,
  );
}

/** The End game confirmation is client-only, so it isn't an overlay that every state patch resets. */
export function openConfirmEnd(solo: boolean): void {
  setText(
    "confirm-end-text",
    solo
      ? "Your clues and progress are lost."
      : "The game ends for both of you. Your clues and progress are lost.",
  );
  setHidden("confirm-end", false);
  el<HTMLButtonElement>("confirm-end-no").focus();
}

export function closeConfirmEnd(): void {
  setHidden("confirm-end", true);
}

// ── intro and lobby ──────────────────────────────────────────────────────────

export function renderIntroSlide(
  index: number,
  total: number,
  title: string,
  body: string,
  last: boolean,
): void {
  setText("intro-step", `${index + 1} / ${total}`);
  setText("intro-title", title);
  setText("intro-body", body);
  setText("intro-next", last ? "Find your partner" : "Next");
  setHidden("intro-skip", last);
  el("intro-dots").innerHTML = Array.from(
    { length: total },
    (_, i) => `<span class="intro-dot${i === index ? " on" : ""}"></span>`,
  ).join("");
}

export function getLobbyName(): string {
  return el<HTMLInputElement>("lobby-name").value.trim();
}

export function setLobbyName(name: string): void {
  el<HTMLInputElement>("lobby-name").value = name;
}

export function getLobbyCode(): string {
  return el<HTMLInputElement>("lobby-code").value;
}

export function setLobbyCode(code: string): void {
  el<HTMLInputElement>("lobby-code").value = code;
}

/** Builds the loop time choice from the config, with `selected` checked. */
export function renderLoopTimes(times: readonly number[], selected: number): void {
  const box = el("lobby-time");
  box.replaceChildren(
    ...times.map((seconds) => {
      const label = document.createElement("label");
      label.className = "time-option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "lobby-time";
      input.value = String(seconds);
      input.checked = seconds === selected;
      const text = document.createElement("span");
      text.className = "time-option-label";
      text.textContent = `${seconds}s`;
      label.append(input, text);
      return label;
    }),
  );
}

export function getLoopTime(): number | undefined {
  const checked = document.querySelector<HTMLInputElement>('input[name="lobby-time"]:checked');
  return checked ? Number(checked.value) : undefined;
}

export function setLobbyError(text: string): void {
  setText("lobby-error", text);
}

export function setLobbyBusy(busy: boolean): void {
  for (const id of ["lobby-create", "lobby-solo", "lobby-join"]) el<HTMLButtonElement>(id).disabled = busy;
}

export function setWait(code: string, link: string): void {
  setText("wait-code", code || "----");
  setText("wait-link", link);
}

export function setLostText(text: string): void {
  setText("lost-text", text);
}

// ── briefing, reset and win ──────────────────────────────────────────────────

export function setBrief(
  info: LevelInfo,
  total: number,
  duration: number,
  penalty: number,
  previous: string,
  rule: string,
  role: string,
  iAmReady: boolean,
): void {
  setText("brief-prev", previous);
  setHidden("brief-prev", previous === "");
  setText("brief-level", `Level ${info.id} of ${total}`);
  setText("brief-name", info.name);
  setText("brief-story", info.story);
  setText("brief-time", `${duration}s`);
  setText("brief-penalty", `${penalty}s`);
  setText("brief-rule", rule);
  setText("brief-role", role);
  el<HTMLButtonElement>("brief-go").disabled = iAmReady;
  setHidden("brief-wait", !iAmReady);
}

export function setResetLoop(nextLoop: number): void {
  setText("reset-loop-num", `Loop ${nextLoop}`);
}

export function setWin(resets: number, timeLeft: number): void {
  setText("stat-resets", String(resets));
  setText("stat-time", `${timeLeft}s`);
  setText(
    "win-msg",
    resets === 0
      ? "All three rooms without a single reset. Flawless."
      : resets === 1
        ? "One reset across three rooms. The clues did the work."
        : `${resets} resets across three rooms. You remembered everything that mattered.`,
  );
}

// ── HUD ──────────────────────────────────────────────────────────────────────

export function setLevel(info: LevelInfo): void {
  for (let i = 1; i <= 3; i++) setHidden(`scene-${i}`, i !== info.id);
  el("room").dataset.level = String(info.id);
  setText("level-name", info.name);
  setText("level-num", String(info.id));
}

export function setTimer(timeLeft: number, total: number): void {
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  setText("timer-display", `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`);
  const box = el("timer-box");
  box.classList.toggle("timer-danger", timeLeft <= 15);
  box.classList.toggle("timer-warn", timeLeft > 15 && timeLeft <= 30);
  box.style.setProperty("--timer-pct", `${(timeLeft / total) * 100}%`);
}

export function setLoop(loop: number): void {
  setText("loop-num", String(loop));
}

export function setRoomCode(code: string): void {
  setText("room-code", code || "----");
}

export interface PlayerCard {
  name: string;
  status: string;
  you: boolean;
  holdsKey: boolean;
}

export function setPlayerCard(slot: 1 | 2, card: PlayerCard): void {
  setText(`p${slot}-name`, card.you ? `${card.name} (you)` : card.name);
  setText(`p${slot}-status`, card.status);
  setClass(`player-${slot}-card`, "active", card.you);
  setClass(`p${slot}-key`, "hidden", !card.holdsKey);
  setClass(`p${slot}-slot`, "has-item", card.holdsKey);
}

/** The invite link in the top bar, or hidden when there is nobody to invite. */
export function setInvite(link: string | null): void {
  setHidden("invite", link === null);
  if (link !== null) setText("invite-link", link);
}

/** Playing alone: there is no partner card. */
export function setSolo(solo: boolean): void {
  setClass("bottom-hud", "solo", solo);
}

export function setBanner(text: string | null): void {
  setHidden("partner-banner", text === null);
  if (text !== null) setText("partner-banner", text);
}

export function renderClues(
  mine: readonly string[],
  theirs: readonly string[],
  level: number,
  canShare: boolean,
): void {
  const list = el<HTMLUListElement>("clue-list");
  const key = `${level}:${canShare}:${mine.join(",")}|${theirs.join(",")}`;
  if (list.dataset.key === key) return;
  list.dataset.key = key;
  if (mine.length === 0) {
    list.innerHTML = `<li class="clue-empty">${canShare ? "Your journal is empty. What you read goes here, and only you see it." : "No clues yet. What you read goes here."}</li>`;
    return;
  }
  list.innerHTML = mine
    .filter(isClueId)
    .map((id) => {
      const clue = CLUE_DEFS[id];
      const action = !canShare
        ? ""
        : theirs.includes(id)
          ? `<span class="clue-tag">your partner knows</span>`
          : `<button type="button" class="clue-share" data-clue="${id}">Tell partner</button>`;
      return `<li class="clue-item${clue.level < level ? " clue-old" : ""}">
          <span class="clue-head"><span class="clue-text">${clue.text}</span>${action}</span>
          <span class="clue-detail">${clue.detail}</span>
        </li>`;
    })
    .join("");
  list.scrollTop = list.scrollHeight;
}

/** Dims the things only the other detective can use. */
export function setOwnership(me: number, taps: Record<string, Target>): void {
  for (const [id, target] of Object.entries(taps)) {
    const owner = OWNER[target];
    const notMine = me !== 0 && owner !== 0 && owner !== me;
    const node = el(id);
    node.classList.toggle("not-mine", notMine);
    if (notMine) node.title = `Player ${owner} handles this`;
    else node.removeAttribute("title");
  }
}

// ── level 1 · the office ──────────────────────────────────────────────────────

export function setKeyVisible(visible: boolean): void {
  setHidden("obj-key", !visible);
}

export function setCabinetOpen(open: boolean): void {
  setHidden("cab-doors", open);
  setHidden("cab-interior", !open);
  setText("cab-label", open ? "Open wardrobe" : "Wardrobe");
  el("cab-lock").className = open ? "cab-lock-shape" : "cab-lock-shape locked";
}

export function setPhotoVisible(visible: boolean): void {
  setHidden("obj-photo", !visible);
}

export function setLaptopDone(done: boolean): void {
  setHidden("screen-locked", done);
  setHidden("screen-open", !done);
  setClass("obj-door", "door-unlocked", done);
}

// ── level 2 · the archive ─────────────────────────────────────────────────────

export function setShelf(step: number): void {
  for (let book = 0; book < 4; book++) {
    setClass(`obj-book-${book}`, "pulled", SHELF_ORDER.slice(0, step).includes(book));
  }
}

export function setDrawerOpen(open: boolean): void {
  setClass("a-drawer", "open", open);
}

export function setKey2Visible(visible: boolean): void {
  setHidden("obj-key2", !visible);
}

export function setFilingOpen(open: boolean): void {
  setClass("obj-filing", "open", open);
  el("filing-lock").className = open ? "cab-lock-shape" : "cab-lock-shape locked";
  setText("filing-label", open ? "Open cabinet" : "Filing cabinet");
  setHidden("obj-folder", !open);
}

export function setArchiveKeypad(mask: number, done: boolean): void {
  const month = (mask & 1) !== 0 ? "04" : "--";
  const day = (mask & 2) !== 0 ? "17" : "--";
  setText("door2-display", done ? "OPEN" : `${month}${day}`);
  setClass("obj-door2", "door-unlocked", done);
}

// ── level 3 · the vault ───────────────────────────────────────────────────────

export function setSwitches(mask: number): void {
  for (let i = 0; i < 4; i++) setClass(`obj-sw-${i}`, "up", (mask & (1 << i)) !== 0);
}

export function setPower(on: boolean): void {
  setClass("v-led", "on", on);
  setClass("obj-terminal", "powered", on);
  setText("term-text", on ? "Online" : "No power");
}

export function setSafeOpen(open: boolean): void {
  setClass("safe-body", "open", open);
  setClass("obj-door3", "door-unlocked", open);
}

// ── code modal ────────────────────────────────────────────────────────────────

export interface CodePrompt {
  title: string;
  os: string;
  hint: string;
  digits: number;
}

export function openCodeModal(prompt: CodePrompt): void {
  setText("modal-title", prompt.title);
  setText("modal-os", prompt.os);
  setText("modal-hint", prompt.hint);
  const input = el<HTMLInputElement>("code-input");
  input.maxLength = prompt.digits;
  input.placeholder = Array.from({ length: prompt.digits }, () => "_").join(" ");
  input.value = "";
  el("modal-status").textContent = "";
  el("modal-status").className = "modal-status";
  setHidden("modal-laptop", false);
  setTimeout(() => input.focus(), 80);
}

export function closeCodeModal(): void {
  setHidden("modal-laptop", true);
}

export function isCodeModalOpen(): boolean {
  return !el("modal-laptop").classList.contains("hidden");
}

export function setModalStatus(ok: boolean, text: string): void {
  const s = el("modal-status");
  s.textContent = text;
  s.className = `modal-status ${ok ? "ok" : "err"}`;
}

export function getCodeInput(): string {
  return el<HTMLInputElement>("code-input").value.trim();
}

// ── toast ─────────────────────────────────────────────────────────────────────

export type ToastKind = "info" | "warn" | "success";

export function toast(message: string, kind: ToastKind = "info"): void {
  const area = el("toast-area");
  const div = document.createElement("div");
  div.className = `toast toast-${kind}`;
  div.textContent = message;
  area.appendChild(div);
  while (area.children.length > 3) area.firstElementChild?.remove();
  setTimeout(() => div.remove(), 3200);
}

// ── rain canvas ───────────────────────────────────────────────────────────────

let rainStarted = false;

export function startRain(): void {
  if (rainStarted) return;
  const canvas = document.getElementById("rain-canvas") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  rainStarted = true;

  const cv: HTMLCanvasElement = canvas;
  const cx: CanvasRenderingContext2D = ctx;

  const resize = (): void => {
    cv.width = cv.offsetWidth;
    cv.height = cv.offsetHeight;
  };
  resize();
  new ResizeObserver(resize).observe(cv);

  interface Drop {
    x: number;
    y: number;
    len: number;
    speed: number;
    opacity: number;
  }

  const drops: Drop[] = Array.from({ length: 60 }, () => ({
    x: Math.random() * cv.width,
    y: Math.random() * cv.height,
    len: Math.random() * 14 + 6,
    speed: Math.random() * 3 + 2,
    opacity: Math.random() * 0.4 + 0.1,
  }));

  function frame(): void {
    cx.clearRect(0, 0, cv.width, cv.height);
    cx.strokeStyle = "rgba(140,180,220,1)";
    cx.lineWidth = 1;
    for (const d of drops) {
      cx.globalAlpha = d.opacity;
      cx.beginPath();
      cx.moveTo(d.x, d.y);
      cx.lineTo(d.x - 1, d.y + d.len);
      cx.stroke();
      d.y += d.speed;
      if (d.y > cv.height) {
        d.y = -d.len;
        d.x = Math.random() * cv.width;
      }
    }
    cx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ── particle burst on loop reset ──────────────────────────────────────────────

export function startParticles(): void {
  const canvas = document.getElementById("particle-canvas") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const cv: HTMLCanvasElement = canvas;
  const cx: CanvasRenderingContext2D = ctx;

  cv.width = window.innerWidth;
  cv.height = window.innerHeight;

  interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    a: number;
    hue: number;
  }

  const particles: Particle[] = Array.from({ length: 80 }, () => ({
    x: Math.random() * cv.width,
    y: Math.random() * cv.height,
    vx: (Math.random() - 0.5) * 2,
    vy: (Math.random() - 0.5) * 2,
    r: Math.random() * 2 + 1,
    a: Math.random() * 0.6 + 0.2,
    hue: 30 + Math.random() * 20,
  }));

  let frame = 0;
  function draw(): void {
    if (frame++ > 90) {
      cx.clearRect(0, 0, cv.width, cv.height);
      return;
    }
    cx.clearRect(0, 0, cv.width, cv.height);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.a -= 0.01;
      if (p.a <= 0) continue;
      cx.globalAlpha = p.a;
      cx.fillStyle = `hsl(${p.hue}, 60%, 55%)`;
      cx.beginPath();
      cx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      cx.fill();
    }
    cx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}
