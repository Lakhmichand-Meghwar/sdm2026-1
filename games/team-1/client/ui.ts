/** All DOM reads and writes. No game logic here. */
import type { Clue, LevelDef, PlayerId } from "./game.ts";

// ── helpers ──────────────────────────────────────────────────────────────────

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} not found`);
  return node as T;
}

function show(id: string): void {
  el(id).classList.remove("hidden");
}

function hide(id: string): void {
  el(id).classList.add("hidden");
}

function setClass(id: string, cls: string, on: boolean): void {
  el(id).classList.toggle(cls, on);
}

// ── screens ──────────────────────────────────────────────────────────────────

const SCREENS = ["screen-start", "screen-intro", "screen-game", "screen-brief", "screen-reset", "screen-win"];

function only(...visible: string[]): void {
  for (const id of SCREENS) setClass(id, "hidden", !visible.includes(id));
}

export function showStart(): void {
  only("screen-start");
}

export function showIntro(): void {
  only("screen-intro");
}

export function showGame(): void {
  only("screen-game");
}

export function showReset(nextLoop: number): void {
  el("reset-loop-num").textContent = `Loop ${nextLoop}`;
  show("screen-reset");
}

export function hideReset(): void {
  hide("screen-reset");
}

export function renderIntroSlide(
  index: number,
  total: number,
  title: string,
  body: string,
  last: boolean,
): void {
  el("intro-step").textContent = `${index + 1} / ${total}`;
  el("intro-title").textContent = title;
  el("intro-body").textContent = body;
  el("intro-next").textContent = last ? "Enter the office" : "Next";
  setClass("intro-skip", "hidden", last);
  el("intro-dots").innerHTML = Array.from(
    { length: total },
    (_, i) => `<span class="intro-dot${i === index ? " on" : ""}"></span>`,
  ).join("");
}

export function showBrief(def: LevelDef, total: number, previous: string): void {
  el("brief-prev").textContent = previous;
  setClass("brief-prev", "hidden", previous === "");
  el("brief-level").textContent = `Level ${def.id} of ${total}`;
  el("brief-name").textContent = def.name;
  el("brief-story").textContent = def.story;
  el("brief-time").textContent = `${def.duration}s`;
  el("brief-penalty").textContent = `${def.penalty}s`;
  el("brief-rule").textContent = def.rule;
  show("screen-brief");
}

export function hideBrief(): void {
  hide("screen-brief");
}

export function showWin(totalLoops: number, timeLeft: number, resets: number): void {
  only("screen-win");
  el("stat-loops").textContent = String(totalLoops);
  el("stat-time").textContent = `${timeLeft}s`;
  el("win-msg").textContent =
    resets === 0
      ? "All three rooms without a single reset. Flawless."
      : resets === 1
        ? "One reset across three rooms. The clues did the work."
        : `${resets} resets across three rooms. You remembered everything that mattered.`;
}

// ── levels ───────────────────────────────────────────────────────────────────

export function setLevel(def: LevelDef, total: number): void {
  for (let i = 1; i <= total; i++) setClass(`scene-${i}`, "hidden", i !== def.id);
  el("room").dataset.level = String(def.id);
  el("level-name").textContent = def.name;
  el("level-num").textContent = String(def.id);
}

// ── HUD ──────────────────────────────────────────────────────────────────────

export function updateTimer(timeLeft: number, total: number): void {
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  el("timer-display").textContent =
    `${String(mins).padStart(2, "0")}:${String(Math.max(0, secs)).padStart(2, "0")}`;

  const box = el("timer-box");
  box.classList.remove("timer-warn", "timer-danger");
  if (timeLeft <= 15) box.classList.add("timer-danger");
  else if (timeLeft <= 30) box.classList.add("timer-warn");

  const pct = (timeLeft / total) * 100;
  box.style.setProperty("--timer-pct", `${pct}%`);
}

export function updateLoop(loop: number): void {
  el("loop-num").textContent = String(loop);
}

export function setPlayerKey(player: PlayerId, has: boolean): void {
  const slotId = player === 1 ? "p1-slot" : "p2-slot";
  const keyId = player === 1 ? "p1-key" : "p2-key";
  setClass(keyId, "hidden", !has);
  setClass(slotId, "has-item", has);
}

export function updateActivePlayer(player: PlayerId): void {
  el("apb-p1").classList.toggle("active", player === 1);
  el("apb-p2").classList.toggle("active", player === 2);
  el("player-1-card").classList.toggle("active", player === 1);
  el("player-2-card").classList.toggle("active", player === 2);
  el("p1-turn").textContent = player === 1 ? "Your turn" : "Waiting";
  el("p2-turn").textContent = player === 2 ? "Your turn" : "Waiting";
}

// ── clues ─────────────────────────────────────────────────────────────────────

export function renderClues(clues: Clue[], level: number): void {
  const list = el<HTMLUListElement>("clue-list");
  if (clues.length === 0) {
    list.innerHTML = `<li class="clue-empty">No clues yet — explore the room.</li>`;
    return;
  }
  list.innerHTML = clues
    .map(
      (c) =>
        `<li class="clue-item${c.level < level ? " clue-old" : ""}">
          <span class="clue-text">${c.text}</span>
          <span class="clue-detail">${c.detail}</span>
        </li>`,
    )
    .join("");
  list.scrollTop = list.scrollHeight;
}

// ── level 1 · the office ──────────────────────────────────────────────────────

export function updatePaintCounter(clicks: number): void {
  el("paint-counter").textContent = clicks >= 4 ? "✓" : `${clicks} / 4`;
}

export function showKey(): void {
  show("obj-key");
}

export function hideKey(): void {
  hide("obj-key");
}

export function openCabinet(): void {
  hide("cab-doors");
  show("cab-interior");
  el("cab-label").textContent = "Open wardrobe";
}

export function resetCabinet(): void {
  show("cab-doors");
  hide("cab-interior");
  el("cab-label").textContent = "Wardrobe";
  el("cab-lock").className = "cab-lock-shape locked";
}

export function showPhoto(): void {
  show("obj-photo");
}

export function hidePhoto(): void {
  hide("obj-photo");
}

export function setLaptopDone(): void {
  hide("screen-locked");
  show("screen-open");
  el("obj-door").classList.add("door-unlocked");
}

export function resetLaptop(): void {
  show("screen-locked");
  hide("screen-open");
  el("obj-door").classList.remove("door-unlocked");
}

export function resetPaintCounter(): void {
  el("paint-counter").textContent = "0 / 4";
}

// ── level 2 · the archive ─────────────────────────────────────────────────────

export function updateShelfCounter(step: number): void {
  el("shelf-counter").textContent = step >= 4 ? "✓" : `${step} / 4`;
}

export function setBookPulled(index: number, pulled: boolean): void {
  setClass(`obj-book-${index}`, "pulled", pulled);
}

export function clearBooks(): void {
  for (let i = 0; i < 4; i++) setBookPulled(i, false);
}

export function flashWrongBook(index: number): void {
  const book = el(`obj-book-${index}`);
  book.classList.remove("wrong");
  void book.offsetWidth;
  book.classList.add("wrong");
}

export function openDrawer(): void {
  el("a-drawer").classList.add("open");
  show("obj-key2");
}

export function hideKey2(): void {
  hide("obj-key2");
}

export function openFiling(): void {
  el("obj-filing").classList.add("open");
  el("filing-lock").className = "cab-lock-shape";
  el("filing-label").textContent = "Open cabinet";
  show("obj-folder");
}

export function setArchiveDone(): void {
  el("door2-display").textContent = "OPEN";
  el("obj-door2").classList.add("door-unlocked");
}

export function resetArchive(): void {
  clearBooks();
  updateShelfCounter(0);
  el("a-drawer").classList.remove("open");
  hide("obj-key2");
  el("obj-filing").classList.remove("open");
  el("filing-lock").className = "cab-lock-shape locked";
  el("filing-label").textContent = "Filing cabinet";
  hide("obj-folder");
  el("door2-display").textContent = "----";
  el("obj-door2").classList.remove("door-unlocked");
}

// ── level 3 · the vault ───────────────────────────────────────────────────────

export function setSwitch(index: number, on: boolean): void {
  setClass(`obj-sw-${index}`, "up", on);
}

export function setPower(on: boolean): void {
  setClass("v-led", "on", on);
  setClass("obj-terminal", "powered", on);
  el("term-text").textContent = on ? "Online" : "No power";
}

export function openSafe(): void {
  el("safe-body").classList.add("open");
  el("obj-door3").classList.add("door-unlocked");
}

export function resetVault(): void {
  for (let i = 0; i < 4; i++) setSwitch(i, false);
  setPower(false);
  el("safe-body").classList.remove("open");
  el("obj-door3").classList.remove("door-unlocked");
}

// ── code modal ────────────────────────────────────────────────────────────────

export interface CodePrompt {
  title: string;
  os: string;
  hint: string;
}

export function openCodeModal(prompt: CodePrompt): void {
  el("modal-title").textContent = prompt.title;
  el("modal-os").textContent = prompt.os;
  el("modal-hint").textContent = prompt.hint;
  el<HTMLInputElement>("code-input").value = "";
  el("modal-status").textContent = "";
  el("modal-status").className = "modal-status";
  show("modal-laptop");
  setTimeout(() => el<HTMLInputElement>("code-input").focus(), 80);
}

export function closeLaptopModal(): void {
  hide("modal-laptop");
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

type ToastKind = "info" | "warn" | "success";

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
