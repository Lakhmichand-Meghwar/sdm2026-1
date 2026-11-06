/**
 * Debug overlay: a text panel in the top-right corner, toggled with the ~ key.
 * Plain DOM on top of the page, so it works with any renderer (Canvas, Phaser, Three.js).
 * Disabled in production (see isDebugEnabled).
 */
import { type AppEnv, isDebugEnabled } from "../shared/env.ts";

export interface BuildInfo {
  readonly env: AppEnv;
  readonly sha: string;
}

/** What the overlay shows. `null` means "not known yet" and is shown as a dash. */
export interface DebugStats {
  readonly roomId: string | null;
  readonly roomCode: string | null;
  readonly playerId: string | null;
  readonly tick: number | null;
  readonly pingMs: number | null;
  readonly patchesPerSecond: number | null;
  readonly bytesPerSecond: number | null;
  readonly fps: number;
  readonly frameMs: number;
}

/** Game-specific lines, e.g. `{ pickups: 5 }`. */
export type DebugExtras = Readonly<Record<string, string | number | boolean>>;

export interface DebugOverlay {
  readonly isOpen: boolean;
  /** Call every frame; the text is redrawn at most a few times a second. */
  update(stats: DebugStats, extras?: DebugExtras, now?: number): void;
  toggle(): void;
  destroy(): void;
}

export interface DebugOverlayOptions {
  readonly build: BuildInfo;
  /** Open right away, e.g. from `?debug`. */
  readonly startOpen?: boolean;
  /** Where to put the panel. Defaults to document.body. */
  readonly parent?: HTMLElement;
  /** Where to listen for the ~ key. Defaults to window. */
  readonly keyTarget?: Window;
}

const LABEL_WIDTH = 8;
const SHORT_SHA_LENGTH = 7;
const BYTES_PER_KB = 1_024;
const REFRESH_MS = 250;
// Matched by key position (code) and by character (key), because layouts put ~ in different places.
const TOGGLE_CODE = "Backquote";
const TOGGLE_CHARACTERS = ["`", "~"];

const PANEL_STYLE: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  top: "8px",
  right: "8px",
  zIndex: "9999",
  margin: "0",
  padding: "10px 12px",
  borderRadius: "6px",
  background: "rgba(10, 12, 20, 0.85)",
  color: "#b8f5c8",
  font: "13px/1.4 ui-monospace, Consolas, Menlo, monospace",
  pointerEvents: "none",
  whiteSpace: "pre",
};

const NO_OVERLAY: DebugOverlay = {
  isOpen: false,
  update() {},
  toggle() {},
  destroy() {},
};

export function formatDebugLines(build: BuildInfo, stats: DebugStats, extras: DebugExtras = {}): string[] {
  const lines: [string, string][] = [
    ["env", build.env],
    ["sha", build.sha.slice(0, SHORT_SHA_LENGTH)],
    ["room", formatRoom(stats.roomCode, stats.roomId)],
    ["player", stats.playerId ?? "-"],
    ["tick", stats.tick === null ? "-" : String(stats.tick)],
    ["ping", stats.pingMs === null ? "-" : `${Math.round(stats.pingMs)} ms`],
    ["patches", stats.patchesPerSecond === null ? "-" : `${Math.round(stats.patchesPerSecond)}/s`],
    ["bytes", stats.bytesPerSecond === null ? "-" : formatBytesPerSecond(stats.bytesPerSecond)],
    ["fps", String(Math.round(stats.fps))],
    ["frame", `${stats.frameMs.toFixed(1)} ms`],
    ...Object.entries(extras).map(([label, value]): [string, string] => [label, String(value)]),
  ];
  return lines.map(([label, value]) => `${label.padEnd(LABEL_WIDTH)} ${value}`);
}

export function createDebugOverlay(options: DebugOverlayOptions): DebugOverlay {
  if (!isDebugEnabled(options.build.env)) return NO_OVERLAY;

  const keyTarget = options.keyTarget ?? window;
  const panel = document.createElement("pre");
  Object.assign(panel.style, PANEL_STYLE);
  panel.hidden = !options.startOpen;
  (options.parent ?? document.body).append(panel);

  let lastRefreshAt = Number.NEGATIVE_INFINITY;

  const toggle = (): void => {
    panel.hidden = !panel.hidden;
    lastRefreshAt = Number.NEGATIVE_INFINITY; // show fresh numbers as soon as it opens
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const isToggleKey = event.code === TOGGLE_CODE || TOGGLE_CHARACTERS.includes(event.key);
    if (!isToggleKey || event.repeat || isTyping(event.target)) return;
    event.preventDefault();
    toggle();
  };
  keyTarget.addEventListener("keydown", onKeyDown);

  return {
    get isOpen() {
      return !panel.hidden;
    },
    update(stats, extras, now = performance.now()) {
      if (panel.hidden || now - lastRefreshAt < REFRESH_MS) return;
      lastRefreshAt = now;
      panel.textContent = formatDebugLines(options.build, stats, extras).join("\n");
    },
    toggle,
    destroy() {
      keyTarget.removeEventListener("keydown", onKeyDown);
      panel.remove();
    },
  };
}

function formatRoom(code: string | null, id: string | null): string {
  if (code && id) return `${code} (${id})`;
  return code ?? id ?? "-";
}

function formatBytesPerSecond(bytes: number): string {
  return bytes < BYTES_PER_KB ? `${Math.round(bytes)} B/s` : `${(bytes / BYTES_PER_KB).toFixed(1)} KB/s`;
}

/** Don't steal the ~ key while the player types in a text field (e.g. the room code box). */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
  );
}
