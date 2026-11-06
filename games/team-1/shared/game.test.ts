import { runReplay, Simulation } from "@sdm/core/server";
import { describe, expect, it } from "vitest";
import { timeLoopGame as game } from "./game.ts";
import type { TimeLoopInput } from "./index.ts";
import { type CodeKind, SHELF_ORDER, type Target } from "./rules.ts";

type Who = "a" | "b";

function makeRoom() {
  const sim = new Simulation(game, {
    seed: 7,
    roomId: "test-room",
    sha: "test",
    startedAt: "2026-01-01T00:00:00.000Z",
    mode: "live",
  });
  const seqs: Record<Who, number> = { a: 0, b: 0 };
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) sim.tick();
  };
  const act = (who: Who, data: TimeLoopInput) => {
    seqs[who] += 1;
    sim.queueInput(who, { seq: seqs[who], data });
    tick();
  };
  return {
    sim,
    state: sim.state,
    tick,
    act,
    tap: (who: Who, target: Target) => act(who, { type: "interact", target }),
    code: (who: Who, kind: CodeKind, value: string) => act(who, { type: "code", kind, value }),
    lastEvent: () => sim.state.events[sim.state.events.length - 1],
  };
}

type Room = ReturnType<typeof makeRoom>;

function joined(): Room {
  const room = makeRoom();
  room.sim.join("a", { name: "Ada" });
  room.sim.join("b", { name: "Bo" });
  room.tick();
  return room;
}

function started(): Room {
  const room = joined();
  room.act("a", { type: "ready" });
  room.act("b", { type: "ready" });
  return room;
}

function ready(room: Room): void {
  room.act("a", { type: "ready" });
  room.act("b", { type: "ready" });
}

/** The painting is heavy: both detectives push within the window. */
function pushTogether(room: Room): void {
  room.tap("a", "painting");
  room.tap("b", "painting");
}

function clearOffice(room: Room): void {
  room.tap("a", "note");
  for (let i = 0; i < 4; i++) pushTogether(room);
  room.tap("a", "key");
  room.tap("b", "cabinet");
  room.tap("a", "photo");
  room.tap("b", "laptop");
  room.code("b", "laptop", "1998");
  room.tap("a", "door1");
}

function clearArchive(room: Room): void {
  room.tap("a", "card");
  room.tap("b", "calendar");
  for (const book of SHELF_ORDER) room.tap("a", `book${book}` as Target);
  room.tap("b", "key2");
  room.tap("a", "filing");
  room.tap("b", "folder");
  room.tap("a", "door2");
  room.code("a", "archive", "04");
  room.tap("b", "door2");
  room.code("b", "archive", "17");
  room.tap("a", "door2");
}

function clearVault(room: Room): void {
  room.tap("a", "poster");
  room.tap("a", "sw0");
  room.tap("b", "sw2");
  room.tap("b", "sw3");
  room.tap("a", "terminal");
  room.tap("b", "safe");
  room.code("b", "vault", "8991");
  room.tap("a", "door3");
}

describe("lobby", () => {
  it("waits until two detectives have joined, then opens the first briefing", () => {
    const room = makeRoom();
    room.sim.join("a", { name: "Ada" });
    room.tick();
    expect(room.state.phase).toBe("waiting");

    room.sim.join("b", {});
    room.tick();
    expect(room.state.phase).toBe("briefing");
    expect(room.state.level).toBe(1);
    expect(room.state.players.get("a")?.slot).toBe(1);
    expect(room.state.players.get("b")?.slot).toBe(2);
    expect(room.state.players.get("a")?.name).toBe("Ada");
    expect(room.state.players.get("b")?.name).toBe("Player 2");
  });

  it("starts the loop only when both detectives are ready", () => {
    const room = joined();
    room.act("a", { type: "ready" });
    expect(room.state.phase).toBe("briefing");
    room.act("b", { type: "ready" });
    expect(room.state.phase).toBe("playing");
  });

  it("gives a replacement the free seat", () => {
    const room = started();
    room.sim.leave("a");
    room.sim.join("c", { name: "Cy" });
    expect(room.state.players.get("c")?.slot).toBe(1);
  });
});

describe("clock", () => {
  it("loses one second every tickRate ticks", () => {
    const room = started();
    const start = room.state.timeLeft;
    room.tick(game.config.tickRate * 3);
    expect(room.state.timeLeft).toBe(start - 3);
  });

  it("stops while a detective is away", () => {
    const room = started();
    room.sim.drop("b");
    const before = room.state.timeLeft;
    room.tick(game.config.tickRate * 5);
    expect(room.state.timeLeft).toBe(before);
    room.sim.reconnect("b");
    room.tick(game.config.tickRate);
    expect(room.state.timeLeft).toBe(before - 1);
  });

  it("resets the room when time runs out and keeps the clues", () => {
    const room = started();
    room.tap("a", "note");
    room.tap("a", "painting");
    room.tick(game.config.tickRate * (game.config.levels[0]?.duration ?? 0));
    expect(room.state.phase).toBe("resetting");

    room.tick(Math.ceil(game.config.resetSeconds * game.config.tickRate));
    expect(room.state.phase).toBe("playing");
    expect(room.state.loop).toBe(2);
    expect(room.state.timeLeft).toBe(game.config.levels[0]?.duration);
    expect(room.state.paintMask).toBe(0);
    expect(Array.from(room.state.clues)).toEqual(["blue4"]);
  });
});

describe("room 1 · the office", () => {
  it("needs both detectives to push the painting", () => {
    const room = started();
    room.tap("a", "painting");
    room.tap("a", "painting");
    expect(room.state.paintClicks).toBe(0);
    room.tap("b", "painting");
    expect(room.state.paintClicks).toBe(1);
  });

  it("forgets a lone push after the window", () => {
    const room = started();
    room.tap("a", "painting");
    room.tick(Math.ceil(game.config.paintWindowSeconds * game.config.tickRate) + 2);
    room.tap("b", "painting");
    expect(room.state.paintClicks).toBe(0);
    room.tap("a", "painting");
    expect(room.state.paintClicks).toBe(1);
  });

  it("keeps the wardrobe locked until somebody has the key", () => {
    const room = started();
    room.tap("a", "cabinet");
    expect(room.state.cabinetOpen).toBe(false);
    expect(room.lastEvent()?.kind).toBe("warn");
  });

  it("asks only the player who touched the laptop for the code", () => {
    const room = started();
    room.tap("b", "laptop");
    const event = room.lastEvent();
    expect(event?.kind).toBe("prompt");
    expect(event?.by).toBe(2);
    expect(event?.extra).toBe("laptop");
  });

  it("does not punish a wrong code in the first room", () => {
    const room = started();
    const before = room.state.timeLeft;
    room.code("a", "laptop", "0000");
    expect(room.state.timeLeft).toBe(before);
    expect(room.lastEvent()?.kind).toBe("codebad");
  });
});

describe("room 2 · the archive", () => {
  function inArchive(): Room {
    const room = started();
    clearOffice(room);
    expect(room.state.level).toBe(2);
    ready(room);
    return room;
  }

  it("moves both detectives on after the first room, with a summary", () => {
    const room = started();
    clearOffice(room);
    expect(room.state.phase).toBe("briefing");
    expect(room.state.level).toBe(2);
    expect(room.state.timeLeft).toBe(game.config.levels[1]?.duration);
    expect(room.state.previous).toContain("The Office cleared");
    expect(room.state.totalLoops).toBe(1);
  });

  it("takes time for a wrong book and starts the shelf over", () => {
    const room = inArchive();
    room.tap("a", "book2");
    expect(room.state.timeLeft).toBe(75);
    expect(room.state.shelfStep).toBe(0);
  });

  it("takes time for a wrong code", () => {
    const room = inArchive();
    room.code("a", "archive", "17");
    expect(room.state.timeLeft).toBe(75);
  });

  it("splits the keypad: detective 1 enters the month, detective 2 the day", () => {
    const room = inArchive();
    room.code("a", "archive", "04");
    expect(room.state.archiveDone).toBe(false);
    room.code("b", "archive", "04");
    expect(room.state.archiveDone).toBe(false);
    room.code("b", "archive", "17");
    expect(room.state.archiveDone).toBe(true);
  });

  it("keeps the filing cabinet locked without the key", () => {
    const room = inArchive();
    room.tap("a", "filing");
    expect(room.state.archiveCabinetOpen).toBe(false);
  });

  it("ignores things that belong to another room", () => {
    const room = inArchive();
    room.tap("a", "note");
    expect(Array.from(room.state.clues)).toContain("blue4");
    const count = room.state.clues.length;
    room.tap("a", "poster");
    expect(room.state.clues.length).toBe(count);
  });
});

describe("room 3 · the vault", () => {
  function inVault(): Room {
    const room = started();
    clearOffice(room);
    ready(room);
    clearArchive(room);
    expect(room.state.level).toBe(3);
    ready(room);
    return room;
  }

  it("gives each detective one side of the power panel", () => {
    const room = inVault();
    room.tap("b", "sw0");
    expect(room.state.switchMask).toBe(0);
    expect(room.lastEvent()?.kind).toBe("warn");
    room.tap("a", "sw0");
    expect(room.state.switchMask).toBe(0b0001);
  });

  it("keeps the terminal and safe dead until the power is on", () => {
    const room = inVault();
    room.tap("a", "terminal");
    expect(Array.from(room.state.clues)).not.toContain("safecode");
    room.tap("a", "safe");
    expect(room.lastEvent()?.kind).toBe("warn");
  });

  it("opens the safe with the first room's year, reversed", () => {
    const room = inVault();
    room.tap("a", "sw0");
    room.tap("b", "sw2");
    room.tap("b", "sw3");
    expect(room.state.powered).toBe(true);
    room.code("a", "vault", "1998");
    expect(room.state.safeOpen).toBe(false);
    room.code("a", "vault", "8991");
    expect(room.state.safeOpen).toBe(true);
  });
});

describe("whole game", () => {
  function playThrough(): Room {
    const room = started();
    clearOffice(room);
    ready(room);
    clearArchive(room);
    ready(room);
    clearVault(room);
    return room;
  }

  it("can be won, and the journal holds every clue", () => {
    const room = playThrough();
    expect(room.state.phase).toBe("won");
    expect(room.state.totalLoops).toBe(3);
    expect(room.state.clues.length).toBe(8);
  });

  it("starts over on restart", () => {
    const room = playThrough();
    room.act("a", { type: "restart" });
    expect(room.state.phase).toBe("briefing");
    expect(room.state.level).toBe(1);
    expect(room.state.clues.length).toBe(0);
    expect(room.state.totalLoops).toBe(0);
  });

  it("replays to the same final state", () => {
    const room = playThrough();
    const replay = room.sim.snapshot();
    expect(replay.final).not.toBeNull();
    expect(runReplay(game, replay).stateHash).toBe(replay.final?.stateHash);
  });
});
