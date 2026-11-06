import "./style.css";
import {
  addClue,
  advanceLevel,
  type CodeKind,
  checkCode,
  type GameState,
  hasClue,
  LEVELS,
  levelDef,
  makeState,
  pullBook,
  resetCount,
  resetLoop,
  switchPlayer,
  toggleSwitch,
} from "./game.ts";
import * as ui from "./ui.ts";

// ── singleton state ───────────────────────────────────────────────────────────

let state: GameState = makeState();
let pendingCode: CodeKind | null = null;

const INTRO = [
  {
    title: "The loop",
    body: "You wake up in a locked room with a clock running. When it reaches zero the room resets: objects vanish and every door locks again.",
  },
  {
    title: "Two detectives",
    body: "Player 1 and Player 2 share one screen and take turns. Each useful action passes the turn, so talk it through and work as a pair.",
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

// ── helpers ───────────────────────────────────────────────────────────────────

function playerName(): string {
  return `Player ${state.activePlayer}`;
}

function switchTurn(): void {
  switchPlayer(state);
  ui.updateActivePlayer(state.activePlayer);
}

function levelTime(): number {
  return levelDef(state.level).duration;
}

function refreshClues(): void {
  ui.renderClues(state.clues, state.level);
}

/** Learn a clue: journal, toast, pass the turn. Returns false if already known. */
function learn(id: string, message: string): boolean {
  if (!addClue(state, id)) return false;
  refreshClues();
  ui.toast(message, "success");
  switchTurn();
  return true;
}

// ── timer ─────────────────────────────────────────────────────────────────────

function startTimer(): void {
  if (state.timerHandle !== null) clearInterval(state.timerHandle);
  state.timerHandle = setInterval(() => {
    if (state.phase !== "playing") return;
    state.timeLeft -= 1;
    ui.updateTimer(state.timeLeft, levelTime());
    if (state.timeLeft <= 0) triggerLoopReset();
  }, 1000);
}

/** Take time off the clock for a mistake. Returns the seconds lost. */
function penalize(): number {
  const seconds = levelDef(state.level).penalty;
  if (seconds === 0) return 0;
  state.timeLeft -= seconds;
  ui.updateTimer(Math.max(state.timeLeft, 0), levelTime());
  if (state.timeLeft <= 0) triggerLoopReset();
  return seconds;
}

// ── loop reset ────────────────────────────────────────────────────────────────

function triggerLoopReset(): void {
  if (state.phase !== "playing") return;
  if (state.timerHandle !== null) {
    clearInterval(state.timerHandle);
    state.timerHandle = null;
  }
  state.phase = "resetting";
  pendingCode = null;
  ui.closeLaptopModal();

  ui.showReset(state.loop + 1);
  ui.startParticles();

  setTimeout(() => {
    resetLoop(state);
    applyRoomReset();
    ui.updateLoop(state.loop);
    ui.updateTimer(state.timeLeft, levelTime());
    ui.hideReset();
    state.phase = "playing";
    startTimer();
  }, 3200);
}

function applyRoomReset(): void {
  ui.setPlayerKey(1, false);
  ui.setPlayerKey(2, false);
  ui.resetPaintCounter();
  ui.hideKey();
  ui.resetCabinet();
  ui.hidePhoto();
  ui.resetLaptop();
  ui.resetArchive();
  ui.resetVault();
}

// ── level flow ────────────────────────────────────────────────────────────────

function enterLevel(previous: string): void {
  const def = levelDef(state.level);
  state.phase = "briefing";
  applyRoomReset();
  ui.setLevel(def, LEVELS.length);
  ui.updateLoop(state.loop);
  ui.updateTimer(state.timeLeft, def.duration);
  refreshClues();
  ui.updateActivePlayer(state.activePlayer);
  ui.showBrief(def, LEVELS.length, previous);
}

function beginLevel(): void {
  ui.hideBrief();
  state.phase = "playing";
  startTimer();
}

function completeLevel(): void {
  const cleared = levelDef(state.level);
  const loop = state.loop;
  const left = state.timeLeft;
  pendingCode = null;
  ui.closeLaptopModal();

  if (!advanceLevel(state)) {
    state.phase = "won";
    ui.showWin(state.totalLoops, left, resetCount(state));
    return;
  }
  enterLevel(`${cleared.name} cleared in loop ${loop} with ${left}s left`);
}

// ── intro ─────────────────────────────────────────────────────────────────────

function showIntroSlide(): void {
  const slide = INTRO[introIndex];
  if (!slide) return;
  ui.renderIntroSlide(introIndex, INTRO.length, slide.title, slide.body, introIndex === INTRO.length - 1);
}

function startIntro(): void {
  introIndex = 0;
  state = makeState();
  state.phase = "intro";
  showIntroSlide();
  ui.showIntro();
}

function nextIntro(): void {
  if (introIndex >= INTRO.length - 1) {
    startGame();
    return;
  }
  introIndex += 1;
  showIntroSlide();
}

function startGame(): void {
  state = makeState();
  ui.showGame();
  ui.startRain();
  enterLevel("");
}

// ── level 1 · the office ──────────────────────────────────────────────────────

function onClickNote(): void {
  if (state.phase !== "playing") return;
  if (!learn("blue4", `${playerName()} reads the note: "Blue — 4"`)) {
    ui.toast("Already noted: Blue — 4");
  }
}

function onClickPainting(): void {
  if (state.phase !== "playing") return;
  if (state.keyVisible) {
    ui.toast("The painting is open. The key is below it.");
    return;
  }
  state.paintClicks += 1;
  ui.updatePaintCounter(state.paintClicks);

  if (state.paintClicks < 4) {
    const msgs = [
      "shifts slightly.",
      "swings. Something hides behind it.",
      "almost there — one more push.",
    ] as const;
    ui.toast(`${playerName()}: the painting ${msgs[state.paintClicks - 1] ?? "moves."}`);
  } else {
    state.keyVisible = true;
    ui.showKey();
    ui.toast(`${playerName()} swings the painting open — a key drops!`, "success");
  }
  switchTurn();
}

function pickUpKey(hide: () => void): void {
  if (state.phase !== "playing") return;
  if (state.keyHolder !== null) {
    ui.toast("The key is already held.");
    return;
  }
  state.keyHolder = state.activePlayer;
  hide();
  ui.setPlayerKey(state.activePlayer, true);
  ui.toast(`${playerName()} picks up the key.`, "success");
  switchTurn();
}

function onClickCabinet(): void {
  if (state.phase !== "playing") return;
  if (state.cabinetOpen) {
    ui.toast("The wardrobe is open — check the corkboard.");
    return;
  }
  if (state.keyHolder === null) {
    ui.toast("The wardrobe is locked. Find the key first.", "warn");
    return;
  }
  state.cabinetOpen = true;
  ui.openCabinet();
  ui.showPhoto();
  addClue(state, "findyear");
  refreshClues();
  ui.toast(`${playerName()} unlocks the wardrobe — a photograph is pinned inside.`, "success");
  switchTurn();
}

function onClickPhoto(): void {
  if (state.phase !== "playing") return;
  if (!state.cabinetOpen) {
    ui.toast("The wardrobe is locked. Can't see anything.", "warn");
    return;
  }
  if (!learn("year1998", `${playerName()}: the photograph shows a year — 1998`)) {
    ui.toast("The photograph shows a year — 1998");
  }
}

function onClickLaptop(): void {
  if (state.phase !== "playing") return;
  if (state.laptopDone) {
    ui.toast("Door is unlocked. Go!", "success");
    return;
  }
  const hint = hasClue(state, "year1998")
    ? "You have the year. Enter it now."
    : hasClue(state, "findyear")
      ? "Find the year on the photograph first."
      : "Enter the correct 4-digit year to unlock the door.";
  pendingCode = "laptop";
  ui.openCodeModal({
    title: "Access control system",
    os: "SECURE OS v2.1 — enter year code",
    hint,
  });
}

function onClickDoor(): void {
  if (state.phase !== "playing") return;
  if (!state.laptopDone) {
    ui.toast("The door is locked. Find the code.", "warn");
    return;
  }
  completeLevel();
}

// ── level 2 · the archive ─────────────────────────────────────────────────────

function onClickCard(): void {
  if (state.phase !== "playing") return;
  if (!learn("shelforder", `${playerName()} reads the card: blue, red, green, amber`)) {
    ui.toast("Already noted: blue, red, green, amber");
  }
}

function onClickCalendar(): void {
  if (state.phase !== "playing") return;
  if (!learn("day17", `${playerName()} sees a circled date: the 17th`)) {
    ui.toast("Already noted: the 17th");
  }
}

function onClickBook(index: number): void {
  if (state.phase !== "playing") return;
  if (state.keyVisible) {
    ui.toast("The shelf is already open.");
    return;
  }
  const result = pullBook(state, index);
  if (result === "wrong") {
    ui.clearBooks();
    ui.updateShelfCounter(0);
    ui.flashWrongBook(index);
    const lost = penalize();
    ui.toast(`Wrong book. The shelf resets${lost ? ` and you lose ${lost}s` : ""}.`, "warn");
    return;
  }
  ui.setBookPulled(index, true);
  ui.updateShelfCounter(state.shelfStep);
  if (result === "solved") {
    ui.openDrawer();
    ui.toast(`${playerName()} pulls the last book — a drawer slides open.`, "success");
  } else {
    ui.toast(`${playerName()} pulls a book. ${state.shelfStep} of 4.`);
  }
  switchTurn();
}

function onClickFiling(): void {
  if (state.phase !== "playing") return;
  if (state.archiveCabinetOpen) {
    ui.toast("The cabinet is open. Check the folder on top.");
    return;
  }
  if (state.keyHolder === null) {
    ui.toast("The filing cabinet is locked. Find the key.", "warn");
    return;
  }
  state.archiveCabinetOpen = true;
  ui.openFiling();
  ui.toast(`${playerName()} unlocks the cabinet — a case folder.`, "success");
  switchTurn();
}

function onClickFolder(): void {
  if (state.phase !== "playing") return;
  if (!learn("month04", `${playerName()} opens the folder: filed in month 04`)) {
    ui.toast("Already noted: month 04");
  }
}

function onClickDoor2(): void {
  if (state.phase !== "playing") return;
  if (state.archiveDone) {
    completeLevel();
    return;
  }
  pendingCode = "archive";
  ui.openCodeModal({
    title: "Archive door lock",
    os: "KEYPAD — enter 4 digits",
    hint: "Four digits: the month, then the day.",
  });
}

// ── level 3 · the vault ───────────────────────────────────────────────────────

function onClickPoster(): void {
  if (state.phase !== "playing") return;
  if (!learn("switchpattern", `${playerName()} studies the poster: up, down, up, up`)) {
    ui.toast("Already noted: up, down, up, up");
  }
}

function onClickSwitch(index: number): void {
  if (state.phase !== "playing") return;
  if (state.powered) {
    ui.toast("The power is already on.");
    return;
  }
  const powered = toggleSwitch(state, index);
  ui.setSwitch(index, state.switches[index] === true);
  if (powered) {
    ui.setPower(true);
    ui.toast(`${playerName()} restores power. The terminal wakes up.`, "success");
  }
  switchTurn();
}

function onClickTerminal(): void {
  if (state.phase !== "playing") return;
  if (!state.powered) {
    ui.toast("The terminal is dead. Restore the power.", "warn");
    return;
  }
  if (!learn("safecode", `${playerName()}: safe code is the photo year, reversed`)) {
    ui.toast("Safe code: the photo year, reversed");
  }
}

function onClickSafe(): void {
  if (state.phase !== "playing") return;
  if (state.safeOpen) {
    ui.toast("The safe is open. Take the hatch.");
    return;
  }
  if (!state.powered) {
    ui.toast("The safe keypad is dead. Restore the power.", "warn");
    return;
  }
  pendingCode = "vault";
  ui.openCodeModal({
    title: "Vault safe",
    os: "SAFE — enter 4 digits",
    hint: hasClue(state, "safecode") ? "The photo year, reversed." : "The terminal may know.",
  });
}

function onClickDoor3(): void {
  if (state.phase !== "playing") return;
  if (!state.safeOpen) {
    ui.toast("The hatch is sealed. Open the safe.", "warn");
    return;
  }
  completeLevel();
}

// ── code entry ────────────────────────────────────────────────────────────────

function onCodeSolved(kind: CodeKind): void {
  if (kind === "laptop") {
    state.laptopDone = true;
    ui.setLaptopDone();
  } else if (kind === "archive") {
    state.archiveDone = true;
    ui.setArchiveDone();
  } else {
    state.safeOpen = true;
    ui.openSafe();
  }
}

function onSubmitCode(): void {
  const kind = pendingCode;
  if (kind === null) return;
  if (checkCode(kind, ui.getCodeInput())) {
    pendingCode = null;
    ui.setModalStatus(true, "Access granted");
    onCodeSolved(kind);
    setTimeout(() => {
      ui.closeLaptopModal();
      ui.toast("Access granted — the way out is open.", "success");
      switchTurn();
    }, 1200);
    return;
  }
  const lost = penalize();
  ui.setModalStatus(false, lost ? `Incorrect code · −${lost}s` : "Incorrect code");
}

// ── event bindings ────────────────────────────────────────────────────────────

function bind(id: string, handler: () => void): void {
  document.getElementById(id)?.addEventListener("click", handler);
}

function bindKey(id: string, handler: () => void): void {
  document.getElementById(id)?.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") handler();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bind("btn-start", startIntro);
  bind("intro-next", nextIntro);
  bind("intro-skip", startGame);
  bind("brief-go", beginLevel);
  bind("btn-restart", ui.showStart);

  bind("obj-note", onClickNote);
  bind("obj-painting", onClickPainting);
  bind("obj-key", () => pickUpKey(ui.hideKey));
  bind("obj-cabinet", onClickCabinet);
  bind("obj-photo", onClickPhoto);
  bind("obj-laptop", onClickLaptop);
  bind("obj-door", onClickDoor);

  bind("obj-card", onClickCard);
  bind("obj-calendar", onClickCalendar);
  for (let i = 0; i < 4; i++) bind(`obj-book-${i}`, () => onClickBook(i));
  bind("obj-key2", () => pickUpKey(ui.hideKey2));
  bind("obj-filing", onClickFiling);
  bind("obj-folder", onClickFolder);
  bind("obj-door2", onClickDoor2);

  bind("obj-poster", onClickPoster);
  for (let i = 0; i < 4; i++) bind(`obj-sw-${i}`, () => onClickSwitch(i));
  bind("obj-terminal", onClickTerminal);
  bind("obj-safe", onClickSafe);
  bind("obj-door3", onClickDoor3);

  bind("modal-cancel", ui.closeLaptopModal);
  bind("modal-close", ui.closeLaptopModal);
  bind("modal-submit", onSubmitCode);
  bindKey("code-input", onSubmitCode);

  document.getElementById("code-input")?.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape") ui.closeLaptopModal();
  });

  document.getElementById("modal-laptop")?.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).id === "modal-laptop") ui.closeLaptopModal();
  });
});
