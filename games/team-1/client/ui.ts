/** All DOM reads and writes. No game logic here. */
import type { Clue, PlayerId } from "./game.ts";

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

export function showStart(): void {
  show("screen-start");
  hide("screen-game");
  hide("screen-reset");
  hide("screen-win");
}

export function showGame(): void {
  hide("screen-start");
  show("screen-game");
  hide("screen-reset");
  hide("screen-win");
}

export function showReset(nextLoop: number): void {
  el("reset-loop-num").textContent = `Loop ${nextLoop}`;
  show("screen-reset");
}

export function hideReset(): void {
  hide("screen-reset");
}

export function showWin(loops: number, timeLeft: number): void {
  hide("screen-game");
  show("screen-win");
  el("stat-loops").textContent = String(loops);
  el("stat-time").textContent = `${timeLeft}s`;
  const msgs: Record<number, string> = {
    1: "Perfect — both detectives escaped on the first loop.",
    2: "Two loops. The clues connected. You're out.",
    3: "Three loops — knowledge built, the year revealed, the door open.",
  };
  el("win-msg").textContent = msgs[loops] ?? `After ${loops} loops, both detectives finally break the cycle.`;
}

// ── HUD ──────────────────────────────────────────────────────────────────────

export function updateTimer(timeLeft: number, total: number): void {
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  el("timer-display").textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

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
  // Top bar badge
  el("apb-p1").classList.toggle("active", player === 1);
  el("apb-p2").classList.toggle("active", player === 2);
  // Player cards in HUD
  el("player-1-card").classList.toggle("active", player === 1);
  el("player-2-card").classList.toggle("active", player === 2);
  // Turn labels
  el("p1-turn").textContent = player === 1 ? "Your turn" : "Waiting";
  el("p2-turn").textContent = player === 2 ? "Your turn" : "Waiting";
}

// ── clues ─────────────────────────────────────────────────────────────────────

export function renderClues(clues: Clue[]): void {
  const list = el<HTMLUListElement>("clue-list");
  if (clues.length === 0) {
    list.innerHTML = `<li class="clue-empty">No clues yet — explore the room.</li>`;
    return;
  }
  list.innerHTML = clues
    .map(
      (c) =>
        `<li class="clue-item">
          <span class="clue-text">${c.text}</span>
          <span class="clue-detail">${c.detail}</span>
        </li>`,
    )
    .join("");
}

// ── room objects ──────────────────────────────────────────────────────────────

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

// ── laptop modal ──────────────────────────────────────────────────────────────

export function openLaptopModal(hint: string): void {
  el("modal-hint").textContent = hint;
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
  setTimeout(() => div.remove(), 3200);
}

// ── rain canvas ───────────────────────────────────────────────────────────────

export function startRain(): void {
  const canvas = document.getElementById("rain-canvas") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

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
    hue: 30 + Math.random() * 20, // amber tones
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
