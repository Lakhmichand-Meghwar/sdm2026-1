/** Turns the room state into UI. Called on every state patch, so everything here is idempotent. */
import { levelDuration, timeLoopGame } from "../shared/game.ts";
import type { GameEvent, TimeLoopState } from "../shared/index.ts";
import { CODE_DIGITS, type CodeKind, LEVEL_COUNT, levelInfo, ROLE_SOLO, ROLE_TEXT } from "../shared/rules.ts";
import { currentInviteLink } from "./invite.ts";
import { TAPS } from "./targets.ts";
import * as ui from "./ui.ts";

const config = timeLoopGame.config;

const CODE_TITLES: Record<CodeKind, { title: string; os: string }> = {
  laptop: { title: "Access control system", os: "SECURE OS v2.1 — enter year code" },
  archive: { title: "Archive door lock", os: "KEYPAD — enter your two digits" },
  vault: { title: "Vault safe", os: "SAFE — enter 4 digits" },
};

let primed = false;
let seenEvent = 0;
let lastPhase = "";
let pendingCode: CodeKind | null = null;

/** Forget everything about the previous room. Call when joining a new one. */
export function resetView(): void {
  primed = false;
  seenEvent = 0;
  lastPhase = "";
  pendingCode = null;
}

/** The code the open prompt is asking for, if any. */
export function pendingCodeKind(): CodeKind | null {
  return pendingCode;
}

function isCodeKind(value: string): value is CodeKind {
  return value === "laptop" || value === "archive" || value === "vault";
}

function showEvent(event: GameEvent, me: number, solo: boolean): void {
  // Private events are for one detective only.
  if (event.by !== 0 && event.by !== me) return;
  if (event.kind === "prompt") {
    if (!isCodeKind(event.extra)) return;
    pendingCode = event.extra;
    ui.openCodeModal({
      ...CODE_TITLES[event.extra],
      hint: event.text,
      digits: event.extra === "archive" && solo ? 4 : CODE_DIGITS[event.extra],
    });
  } else if (event.kind === "codeok") {
    ui.setModalStatus(true, event.text);
    pendingCode = null;
    setTimeout(ui.closeCodeModal, 1000);
  } else if (event.kind === "codebad") {
    ui.setModalStatus(false, event.text);
  } else {
    ui.toast(event.text, event.kind === "success" ? "success" : event.kind === "warn" ? "warn" : "info");
  }
}

function handleEvents(state: TimeLoopState, me: number): void {
  const fresh: GameEvent[] = [];
  let newest = seenEvent;
  state.events.forEach((event) => {
    if (event.n > seenEvent) fresh.push(event);
    if (event.n > newest) newest = event.n;
  });
  seenEvent = newest;
  // The first snapshot carries old events; don't replay them to someone who just arrived.
  if (!primed) {
    primed = true;
    return;
  }
  for (const event of fresh) showEvent(event, me, state.solo);
}

function playerInSlot(state: TimeLoopState, slot: 1 | 2): { id: string; name: string } | null {
  for (const [id, player] of state.players.entries()) {
    if (player.slot === slot) return { id, name: player.name };
  }
  return null;
}

function renderCards(state: TimeLoopState, sessionId: string): void {
  for (const slot of [1, 2] as const) {
    const entry = playerInSlot(state, slot);
    const connected = entry ? state.seats.get(entry.id)?.connected !== false : false;
    ui.setPlayerCard(slot, {
      name: entry?.name ?? `Player ${slot}`,
      status: entry ? (connected ? "Online" : "Away") : "Waiting to join",
      you: entry?.id === sessionId,
      holdsKey: state.keyHolder === slot,
    });
  }
}

function partnerAway(state: TimeLoopState, sessionId: string): boolean {
  if (state.players.size < 2) return true;
  for (const [id, seat] of state.seats.entries()) if (id !== sessionId && !seat.connected) return true;
  return false;
}

function renderRoom(state: TimeLoopState, me: number): void {
  const level = state.level;
  const duration = levelDuration(config, state.loopTime, level);
  ui.setLevel(levelInfo(level));
  ui.setTimer(state.timeLeft, duration);
  ui.setLoop(state.loop);
  ui.setRoomCode(state.code);
  ui.setInvite(!state.solo && state.code ? currentInviteLink(state.code) : null);
  const mine = Array.from(me === 2 ? state.clues2 : state.clues1);
  const theirs = Array.from(me === 2 ? state.clues1 : state.clues2);
  ui.renderClues(mine, theirs, level, !state.solo);
  ui.setOwnership(state.solo ? 0 : me, TAPS);
  ui.setSolo(state.solo);

  const keyOnFloor = state.keyVisible && state.keyHolder === 0;
  ui.setKeyVisible(level === 1 && keyOnFloor);
  ui.setCabinetOpen(state.cabinetOpen);
  ui.setPhotoVisible(state.cabinetOpen);
  ui.setLaptopDone(state.laptopDone);

  ui.setShelf(state.shelfStep);
  ui.setDrawerOpen(level === 2 && state.keyVisible);
  ui.setKey2Visible(level === 2 && keyOnFloor);
  ui.setFilingOpen(state.archiveCabinetOpen);
  ui.setArchiveKeypad(state.archiveMask, state.archiveDone);

  ui.setSwitches(state.switchMask);
  ui.setPower(state.powered);
  ui.setSafeOpen(state.safeOpen);
}

export function render(state: TimeLoopState, sessionId: string): void {
  const me = state.players.get(sessionId)?.slot ?? 0;
  handleEvents(state, me);
  renderRoom(state, me);
  renderCards(state, sessionId);

  const phase = state.phase;
  if (phase !== lastPhase) {
    if (phase === "resetting") ui.startParticles();
    if (phase !== "playing") ui.closeCodeModal();
    if (phase === "won" || phase === "ended" || phase === "waiting") ui.closeConfirmEnd();
    lastPhase = phase;
  }
  if (state.held) ui.closeCodeModal();
  ui.setGameControls(phase === "playing" && !state.held, phase === "playing");

  ui.showMain(phase === "won" ? "win" : phase === "ended" ? "ended" : "game");
  switch (phase) {
    case "waiting":
      ui.setWait(state.code, state.code ? currentInviteLink(state.code) : "");
      ui.setOverlay("wait");
      break;
    case "briefing": {
      const penalty = config.levels[state.level - 1]?.penalty ?? 0;
      const bit = me === 2 ? 2 : 1;
      ui.setBrief(
        levelInfo(state.level),
        LEVEL_COUNT,
        levelDuration(config, state.loopTime, state.level),
        penalty,
        state.previous,
        state.solo ? levelInfo(state.level).soloRule : levelInfo(state.level).rule,
        state.solo ? ROLE_SOLO : (ROLE_TEXT[state.level]?.[me === 2 ? 2 : 1] ?? ""),
        (state.readyMask & bit) !== 0,
      );
      ui.setOverlay("brief");
      break;
    }
    case "resetting":
      ui.setResetLoop(state.loop + 1);
      ui.setOverlay("reset");
      break;
    case "won":
      ui.setWin(state.resets, state.finalTime);
      ui.setOverlay(null);
      break;
    case "ended":
      ui.setEnded(state.endedBy, state.endedSlot === me, state.endedAt);
      ui.setOverlay(null);
      break;
    case "playing":
      if (state.held) ui.setPaused(state.heldBy, state.heldSlot === me);
      ui.setOverlay(state.held ? "paused" : null);
      break;
    default:
      ui.setOverlay(null);
  }

  ui.setBanner(
    phase === "playing" && !state.held && !state.solo && partnerAway(state, sessionId)
      ? "Your partner is away. The clock is paused until they are back."
      : null,
  );
}
