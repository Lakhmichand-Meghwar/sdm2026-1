import "./style.css";
import {
  addClue,
  CODE_ANSWER,
  type GameState,
  hasClue,
  LOOP_DURATION,
  makeState,
  resetLoop,
  switchPlayer,
} from "./game.ts";
import * as ui from "./ui.ts";

// ── singleton state ───────────────────────────────────────────────────────────

let state: GameState = makeState();

// ── helpers ───────────────────────────────────────────────────────────────────

function playerName(): string {
  return `Player ${state.activePlayer}`;
}

function switchTurn(): void {
  switchPlayer(state);
  ui.updateActivePlayer(state.activePlayer);
}

// ── timer ─────────────────────────────────────────────────────────────────────

function startTimer(): void {
  if (state.timerHandle !== null) clearInterval(state.timerHandle);
  state.timerHandle = setInterval(() => {
    state.timeLeft -= 1;
    ui.updateTimer(state.timeLeft, LOOP_DURATION);
    if (state.timeLeft <= 0) triggerLoopReset();
  }, 1000);
}

// ── loop reset ────────────────────────────────────────────────────────────────

function triggerLoopReset(): void {
  if (state.timerHandle !== null) {
    clearInterval(state.timerHandle);
    state.timerHandle = null;
  }
  state.phase = "resetting";

  const nextLoop = state.loop + 1;
  ui.showReset(nextLoop);
  ui.startParticles();

  setTimeout(() => {
    resetLoop(state);
    applyRoomReset();
    ui.updateLoop(state.loop);
    ui.updateTimer(state.timeLeft, LOOP_DURATION);
    ui.hideReset();
    state.phase = "playing";
    startTimer();
  }, 3200);
}

function applyRoomReset(): void {
  ui.resetPaintCounter();
  ui.hideKey();
  ui.setPlayerKey(1, false);
  ui.setPlayerKey(2, false);
  ui.resetCabinet();
  ui.hidePhoto();
  ui.resetLaptop();
}

// ── interaction handlers ──────────────────────────────────────────────────────

function onClickNote(): void {
  if (state.phase !== "playing") return;
  if (hasClue(state, "blue4")) {
    ui.toast("Already noted: Blue — 4");
    return;
  }
  addClue(state, "blue4");
  ui.renderClues(state.clues);
  ui.toast(`${playerName()} reads the note: "Blue — 4"`, "success");
  switchTurn();
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
    switchTurn();
  } else {
    state.keyVisible = true;
    ui.showKey();
    ui.toast(`${playerName()} swings the painting open — a key drops!`, "success");
    switchTurn();
  }
}

function onClickKey(): void {
  if (state.phase !== "playing") return;
  if (!state.keyVisible) return;
  if (state.keyHolder !== null) {
    ui.toast("The key is already held.");
    return;
  }
  state.keyHolder = state.activePlayer;
  ui.hideKey();
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

  if (addClue(state, "findyear")) {
    ui.renderClues(state.clues);
  }
  ui.toast(`${playerName()} unlocks the wardrobe — a photograph is pinned inside.`, "success");
  switchTurn();
}

function onClickPhoto(): void {
  if (state.phase !== "playing") return;
  if (!state.cabinetOpen) {
    ui.toast("The wardrobe is locked. Can't see anything.", "warn");
    return;
  }
  ui.toast(`${playerName()}: the photograph shows a year — 1998`, "success");
  if (addClue(state, "year1998")) {
    ui.renderClues(state.clues);
    switchTurn();
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
  ui.openLaptopModal(hint);
}

function onClickDoor(): void {
  if (state.phase !== "playing") return;
  if (!state.laptopDone) {
    ui.toast("The door is locked. Find the code.", "warn");
    return;
  }
  triggerWin();
}

function onSubmitCode(): void {
  const val = ui.getCodeInput();
  if (val === CODE_ANSWER) {
    ui.setModalStatus(true, "Access granted");
    state.laptopDone = true;
    ui.setLaptopDone();
    setTimeout(() => {
      ui.closeLaptopModal();
      ui.toast("Access granted — exit door unlocked!", "success");
      switchTurn();
    }, 1200);
  } else {
    ui.setModalStatus(false, "Incorrect code");
  }
}

// ── game init / restart ───────────────────────────────────────────────────────

function startGame(): void {
  state = makeState();
  state.phase = "playing";
  applyRoomReset();
  ui.updateLoop(state.loop);
  ui.updateTimer(state.timeLeft, LOOP_DURATION);
  ui.renderClues(state.clues);
  ui.updateActivePlayer(state.activePlayer);
  ui.showGame();
  ui.startRain();
  startTimer();
}

function triggerWin(): void {
  if (state.timerHandle !== null) {
    clearInterval(state.timerHandle);
    state.timerHandle = null;
  }
  state.phase = "won";
  ui.showWin(state.loop, state.timeLeft);
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
  bind("btn-start", startGame);
  bind("btn-restart", () => {
    ui.showStart();
  });

  bind("obj-note", onClickNote);
  bind("obj-painting", onClickPainting);
  bind("obj-key", onClickKey);
  bind("obj-cabinet", onClickCabinet);
  bind("obj-photo", onClickPhoto);
  bind("obj-laptop", onClickLaptop);
  bind("obj-door", onClickDoor);

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
