import { runReplay, Simulation } from "@sdm/core/server";
import { describe, expect, it } from "vitest";
import { timeLoopGame as game, levelDuration } from "./game.ts";
import { TimeLoopConfigSchema, type TimeLoopInput } from "./index.ts";
import { type ClueId, type CodeKind, SHELF_ORDER, type Target } from "./rules.ts";

/** "a" is detective 1 (slot 1), "b" is detective 2 (slot 2). */
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
    share: (who: Who, clue: ClueId) => act(who, { type: "share", clue }),
    lastEvent: () => sim.state.events[sim.state.events.length - 1],
    journal: (who: Who) => Array.from(who === "a" ? sim.state.clues1 : sim.state.clues2),
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

function clearOffice(room: Room): void {
  room.tap("b", "note");
  for (let i = 0; i < 4; i++) room.tap("a", "painting");
  room.tap("a", "key");
  room.tap("b", "cabinet");
  room.tap("a", "photo");
  room.share("a", "year1998");
  room.tap("b", "laptop");
  room.code("b", "laptop", "1998");
  room.tap("a", "door1");
}

function clearArchive(room: Room): void {
  room.tap("a", "card");
  room.share("a", "shelforder");
  for (const book of SHELF_ORDER) room.tap("b", `book${book}` as Target);
  room.tap("a", "key2");
  room.tap("b", "filing");
  room.tap("a", "folder");
  room.tap("b", "calendar");
  room.tap("a", "door2");
  room.code("a", "archive", "17");
  room.tap("b", "door2");
  room.code("b", "archive", "04");
  room.tap("a", "door2");
}

function clearVault(room: Room): void {
  room.tap("b", "poster");
  room.share("b", "switchpattern");
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

  it("resets the room when time runs out and keeps each journal", () => {
    const room = started();
    room.tap("b", "note");
    room.tap("a", "painting");
    room.tick(game.config.tickRate * (game.config.levels[0]?.duration ?? 0));
    expect(room.state.phase).toBe("resetting");

    room.tick(Math.ceil(game.config.resetSeconds * game.config.tickRate));
    expect(room.state.phase).toBe("playing");
    expect(room.state.loop).toBe(2);
    expect(room.state.resets).toBe(1);
    expect(room.state.timeLeft).toBe(game.config.levels[0]?.duration);
    expect(room.state.paintClicks).toBe(0);
    expect(room.journal("b")).toEqual(["blue4"]);
    expect(room.journal("a")).toEqual([]);
  });
});

describe("loop time", () => {
  /** Detective 1 makes the room with `time`; detective 2 joins, maybe asking for a different time. */
  function madeWith(time: number | undefined, joinerTime?: number): Room {
    const room = makeRoom();
    room.sim.join("a", { name: "Ada", time });
    room.sim.join("b", { name: "Bo", time: joinerTime });
    room.tick();
    ready(room);
    return room;
  }

  it("offers 60, 90 and 120 seconds, with 90 picked by default", () => {
    expect(game.config.loopTimes).toEqual([60, 90, 120]);
    expect(game.config.defaultLoopTime).toBe(90);
  });

  it("keeps today's clock when the creator picks nothing: 90, 80 and 70 seconds", () => {
    const room = madeWith(undefined);
    expect(room.state.loopTime).toBe(90);
    expect([1, 2, 3].map((level) => levelDuration(game.config, room.state.loopTime, level))).toEqual([
      90, 80, 70,
    ]);
  });

  it("gives every room 10 seconds less than the one before, whatever the choice", () => {
    expect([1, 2, 3].map((level) => levelDuration(game.config, 60, level))).toEqual([60, 50, 40]);
    expect([1, 2, 3].map((level) => levelDuration(game.config, 120, level))).toEqual([120, 110, 100]);
  });

  it("runs a 60-second game through all three rooms on the shorter clock", () => {
    const room = madeWith(60);
    expect(room.state.timeLeft).toBe(60);
    clearOffice(room);
    expect(room.state.level).toBe(2);
    expect(room.state.timeLeft).toBe(50);
    ready(room);
    clearArchive(room);
    expect(room.state.level).toBe(3);
    expect(room.state.timeLeft).toBe(40);
    ready(room);
    clearVault(room);
    expect(room.state.phase).toBe("won");
  });

  it("refills the clock to the chosen time after a reset", () => {
    const room = madeWith(120);
    room.tick(game.config.tickRate * 120);
    expect(room.state.phase).toBe("resetting");
    room.tick(Math.ceil(game.config.resetSeconds * game.config.tickRate));
    expect(room.state.phase).toBe("playing");
    expect(room.state.timeLeft).toBe(120);
  });

  it("uses the default for a time that isn't one of the choices", () => {
    expect(madeWith(45).state.timeLeft).toBe(90);
    expect(madeWith(0).state.timeLeft).toBe(90);
  });

  it("lets only the room's creator pick: a joiner's choice is ignored", () => {
    const room = madeWith(60, 120);
    expect(room.state.loopTime).toBe(60);
    expect(room.state.timeLeft).toBe(60);
  });

  it("keeps the chosen time when the game starts over", () => {
    const room = madeWith(60);
    clearOffice(room);
    ready(room);
    clearArchive(room);
    ready(room);
    clearVault(room);
    room.act("a", { type: "restart" });
    expect(room.state.level).toBe(1);
    expect(room.state.timeLeft).toBe(60);
  });

  it("replays a game with a chosen time to the same final state", () => {
    const room = madeWith(120);
    clearOffice(room);
    const replay = room.sim.snapshot();
    expect(runReplay(game, replay).stateHash).toBe(replay.final?.stateHash);
  });

  it("rejects a config whose default isn't one of the choices, or whose shortest choice leaves a room no time", () => {
    const base = game.config;
    expect(TimeLoopConfigSchema.safeParse({ ...base, defaultLoopTime: 75 }).success).toBe(false);
    expect(TimeLoopConfigSchema.safeParse({ ...base, loopTimes: [20, 90] }).success).toBe(false);
    expect(TimeLoopConfigSchema.safeParse(base).success).toBe(true);
  });
});

describe("who can do what", () => {
  it("only lets each detective use their own things", () => {
    const room = started();
    room.tap("b", "painting");
    expect(room.state.paintClicks).toBe(0);
    expect(room.lastEvent()?.kind).toBe("warn");
    expect(room.lastEvent()?.by).toBe(2);
    room.tap("a", "painting");
    expect(room.state.paintClicks).toBe(1);
  });

  it("lets either detective use a shared door", () => {
    const room = started();
    room.tap("a", "door1");
    expect(room.lastEvent()?.text).toContain("locked");
    room.tap("b", "door1");
    expect(room.lastEvent()?.text).toContain("locked");
  });

  it("keeps what a detective reads private until they share it", () => {
    const room = started();
    room.tap("b", "note");
    expect(room.journal("b")).toEqual(["blue4"]);
    expect(room.journal("a")).toEqual([]);

    const events = Array.from(room.state.events);
    const detail = events.find((e) => e.text.includes("Blue — 4"));
    expect(detail?.by).toBe(2);
    expect(events.filter((e) => e.by === 0).every((e) => !e.text.includes("Blue"))).toBe(true);

    room.share("b", "blue4");
    expect(room.journal("a")).toEqual(["blue4"]);
    expect(room.lastEvent()?.by).toBe(2);
  });

  it("will not share a clue the sender does not have", () => {
    const room = started();
    room.share("a", "blue4");
    expect(room.journal("b")).toEqual([]);
  });
});

describe("room 1 · the office", () => {
  it("keeps the wardrobe locked until somebody has the key", () => {
    const room = started();
    room.tap("b", "cabinet");
    expect(room.state.cabinetOpen).toBe(false);
    expect(room.lastEvent()?.kind).toBe("warn");
  });

  it("opens the wardrobe for the other detective once the key is picked up", () => {
    const room = started();
    for (let i = 0; i < 4; i++) room.tap("a", "painting");
    expect(room.state.keyVisible).toBe(true);
    room.tap("a", "key");
    expect(room.state.keyHolder).toBe(1);
    room.tap("b", "cabinet");
    expect(room.state.cabinetOpen).toBe(true);
    expect(room.lastEvent()?.text).toContain("corkboard");
    expect(room.journal("a")).toContain("findyear");
    expect(room.journal("b")).toContain("findyear");
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
    room.code("b", "laptop", "0000");
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
    expect(room.state.resets).toBe(0);
  });

  it("takes time for a wrong book and starts the shelf over", () => {
    const room = inArchive();
    room.tap("b", "book2");
    expect(room.state.timeLeft).toBe(75);
    expect(room.state.shelfStep).toBe(0);
  });

  it("keeps the pulling of the books to detective 2", () => {
    const room = inArchive();
    room.tap("a", "book1");
    expect(room.state.shelfStep).toBe(0);
    expect(room.lastEvent()?.kind).toBe("warn");
  });

  it("takes time for a wrong code", () => {
    const room = inArchive();
    room.code("a", "archive", "04");
    expect(room.state.timeLeft).toBe(75);
  });

  it("splits the keypad: detective 1 types the day, detective 2 the month", () => {
    const room = inArchive();
    room.code("a", "archive", "17");
    expect(room.state.archiveDone).toBe(false);
    expect(room.state.archiveMask).toBe(1);
    room.code("b", "archive", "17");
    expect(room.state.archiveDone).toBe(false);
    room.code("b", "archive", "04");
    expect(room.state.archiveDone).toBe(true);
  });

  it("keeps the filing cabinet locked without the key", () => {
    const room = inArchive();
    room.tap("b", "filing");
    expect(room.state.archiveCabinetOpen).toBe(false);
  });

  it("ignores things that belong to another room", () => {
    const room = inArchive();
    const before = room.journal("b").length;
    room.tap("b", "note");
    room.tap("b", "poster");
    expect(room.journal("b").length).toBe(before);
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
    expect(room.journal("a")).not.toContain("safecode");
    room.tap("b", "safe");
    expect(room.lastEvent()?.kind).toBe("warn");
  });

  it("opens the safe with the first room's year, reversed", () => {
    const room = inVault();
    room.tap("a", "sw0");
    room.tap("b", "sw2");
    room.tap("b", "sw3");
    expect(room.state.powered).toBe(true);
    room.code("b", "vault", "1998");
    expect(room.state.safeOpen).toBe(false);
    room.code("b", "vault", "8991");
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

  it("can be won, and each journal holds what that detective learned", () => {
    const room = playThrough();
    expect(room.state.phase).toBe("won");
    expect(room.state.resets).toBe(0);
    expect(room.journal("a")).toEqual(
      expect.arrayContaining(["year1998", "shelforder", "month04", "safecode"]),
    );
    expect(room.journal("b")).toEqual(expect.arrayContaining(["blue4", "day17", "switchpattern"]));
  });

  it("starts over on restart", () => {
    const room = playThrough();
    room.act("a", { type: "restart" });
    expect(room.state.phase).toBe("briefing");
    expect(room.state.level).toBe(1);
    expect(room.journal("a")).toEqual([]);
    expect(room.journal("b")).toEqual([]);
    expect(room.state.resets).toBe(0);
  });

  it("replays to the same final state", () => {
    const room = playThrough();
    const replay = room.sim.snapshot();
    expect(replay.final).not.toBeNull();
    expect(runReplay(game, replay).stateHash).toBe(replay.final?.stateHash);
  });
});

describe("playing alone", () => {
  function solo(): Room {
    const room = makeRoom();
    room.sim.join("a", { name: "Ada", solo: true });
    room.tick();
    return room;
  }

  function soloGame(room: Room): void {
    room.act("a", { type: "ready" });
    room.tap("a", "note");
    for (let i = 0; i < 4; i++) room.tap("a", "painting");
    room.tap("a", "key");
    room.tap("a", "cabinet");
    room.tap("a", "photo");
    room.tap("a", "laptop");
    room.code("a", "laptop", "1998");
    room.tap("a", "door1");

    room.act("a", { type: "ready" });
    room.tap("a", "card");
    room.tap("a", "calendar");
    for (const book of SHELF_ORDER) room.tap("a", `book${book}` as Target);
    room.tap("a", "key2");
    room.tap("a", "filing");
    room.tap("a", "folder");
    room.tap("a", "door2");
    room.code("a", "archive", "0417");
    room.tap("a", "door2");

    room.act("a", { type: "ready" });
    room.tap("a", "poster");
    for (const sw of ["sw0", "sw2", "sw3"] as const) room.tap("a", sw);
    room.tap("a", "terminal");
    room.tap("a", "safe");
    room.code("a", "vault", "8991");
    room.tap("a", "door3");
  }

  it("starts as soon as the one player has joined", () => {
    const room = solo();
    expect(room.state.solo).toBe(true);
    expect(room.state.players.size).toBe(1);
    expect(room.state.phase).toBe("briefing");
  });

  it("needs only that player to be ready", () => {
    const room = solo();
    room.act("a", { type: "ready" });
    expect(room.state.phase).toBe("playing");
  });

  it("runs the clock with one player and stops it when they are away", () => {
    const room = solo();
    room.act("a", { type: "ready" });
    const start = room.state.timeLeft;
    room.tick(game.config.tickRate * 2);
    expect(room.state.timeLeft).toBe(start - 2);
    room.sim.drop("a");
    room.tick(game.config.tickRate * 3);
    expect(room.state.timeLeft).toBe(start - 2);
  });

  it("lets the player use everything in the room", () => {
    const room = solo();
    room.act("a", { type: "ready" });
    room.tap("a", "note");
    room.tap("a", "painting");
    expect(room.journal("a")).toContain("blue4");
    expect(room.state.paintClicks).toBe(1);
    expect(room.lastEvent()?.kind).not.toBe("warn");
  });

  it("asks for the whole keypad code at once", () => {
    const room = solo();
    soloUntilArchive(room);
    room.code("a", "archive", "17");
    expect(room.state.archiveDone).toBe(false);
    expect(room.state.timeLeft).toBe(75);
    room.code("a", "archive", "0417");
    expect(room.state.archiveDone).toBe(true);
  });

  function soloUntilArchive(room: Room): void {
    room.act("a", { type: "ready" });
    for (let i = 0; i < 4; i++) room.tap("a", "painting");
    room.tap("a", "key");
    room.tap("a", "cabinet");
    room.code("a", "laptop", "1998");
    room.tap("a", "door1");
    room.act("a", { type: "ready" });
    expect(room.state.level).toBe(2);
  }

  it("can be won alone", () => {
    const room = solo();
    soloGame(room);
    expect(room.state.phase).toBe("won");
    expect(room.state.resets).toBe(0);
  });

  it("starts over on restart and stays single-player", () => {
    const room = solo();
    soloGame(room);
    room.act("a", { type: "restart" });
    expect(room.state.phase).toBe("briefing");
    expect(room.state.solo).toBe(true);
  });

  it("replays to the same final state", () => {
    const room = solo();
    soloGame(room);
    const replay = room.sim.snapshot();
    expect(runReplay(game, replay).stateHash).toBe(replay.final?.stateHash);
  });

  it("turns into a two-player room when somebody joins", () => {
    const room = solo();
    room.act("a", { type: "ready" });
    room.sim.join("b", { name: "Bo" });
    room.tick();
    expect(room.state.solo).toBe(false);
    expect(room.state.players.get("b")?.slot).toBe(2);
    room.tap("a", "note");
    expect(room.lastEvent()?.kind).toBe("warn");
    room.tap("a", "painting");
    expect(room.state.paintClicks).toBe(1);
  });
});

describe("a Play alone room after somebody joined and left", () => {
  function playingSolo(): Room {
    const room = makeRoom();
    room.sim.join("a", { name: "Ada", solo: true });
    room.tick();
    room.act("a", { type: "ready" });
    return room;
  }

  /** The seat is held while the player is away, then removed when it expires. */
  function seatExpires(room: Room, who: Who): void {
    room.sim.drop(who);
    room.tick(game.config.tickRate * game.config.reconnectSeconds);
    room.sim.leave(who);
  }

  it("goes back to one player when the joiner leaves, and the clock runs again", () => {
    const room = playingSolo();
    room.sim.join("b", { name: "Bo" });
    room.tick();
    expect(room.state.solo).toBe(false);

    seatExpires(room, "b");
    expect(room.state.players.size).toBe(1);
    expect(room.state.solo).toBe(true);

    const before = room.state.timeLeft;
    room.tick(game.config.tickRate * 5);
    expect(room.state.timeLeft).toBe(before - 5);
  });

  it("lets the one player who is left use everything again", () => {
    const room = playingSolo();
    room.sim.join("b", { name: "Bo" });
    room.tick();
    seatExpires(room, "b");
    room.tap("a", "note");
    expect(room.journal("a")).toContain("blue4");
  });

  it("keeps the journals when the original player is the one who leaves", () => {
    const room = playingSolo();
    room.tap("a", "painting");
    room.sim.join("b", { name: "Bo" });
    room.tick();
    room.tap("b", "note");
    room.share("b", "blue4");
    room.tap("a", "photo");

    seatExpires(room, "a");
    expect(room.state.solo).toBe(true);
    expect(room.state.players.get("b")?.slot).toBe(1);
    expect(room.journal("a")).toContain("blue4");
    expect(room.state.clues2.length).toBe(0);

    const before = room.state.timeLeft;
    room.tick(game.config.tickRate * 3);
    expect(room.state.timeLeft).toBe(before - 3);
  });

  it("can still be finished by the player who is left", () => {
    const room = playingSolo();
    room.sim.join("b", { name: "Bo" });
    room.tick();
    seatExpires(room, "a");
    for (let i = 0; i < 4; i++) room.tap("b", "painting");
    room.tap("b", "key");
    room.tap("b", "cabinet");
    room.code("b", "laptop", "1998");
    room.tap("b", "door1");
    expect(room.state.level).toBe(2);
  });

  it("starts the loop for a player who was already ready in the briefing", () => {
    const room = makeRoom();
    room.sim.join("a", { name: "Ada", solo: true });
    room.tick();
    room.sim.join("b", { name: "Bo" });
    room.tick();
    room.act("b", { type: "ready" });
    seatExpires(room, "a");
    expect(room.state.phase).toBe("playing");
  });

  it("does not turn a two-player room into a single-player room", () => {
    const room = started();
    seatExpires(room, "b");
    expect(room.state.solo).toBe(false);
    const before = room.state.timeLeft;
    room.tick(game.config.tickRate * 3);
    expect(room.state.timeLeft).toBe(before);
  });
});

describe("pausing", () => {
  it("stops the clock and remembers who paused, then carries on from the same second", () => {
    const room = started();
    room.tick(game.config.tickRate * 2);
    room.act("a", { type: "pause" });
    expect(room.state.held).toBe(true);
    expect(room.state.heldBy).toBe("Ada");
    expect(room.state.heldSlot).toBe(1);
    const before = room.state.timeLeft;
    room.tick(game.config.tickRate * 10);
    expect(room.state.timeLeft).toBe(before);

    room.act("a", { type: "resume" });
    expect(room.state.held).toBe(false);
    room.tick(game.config.tickRate);
    expect(room.state.timeLeft).toBe(before - 1);
  });

  it("lets the other detective resume", () => {
    const room = started();
    room.act("a", { type: "pause" });
    room.act("b", { type: "resume" });
    expect(room.state.held).toBe(false);
    expect(room.lastEvent()?.text).toBe("Bo resumed the game.");
  });

  it("ignores clicks, codes and shared clues while paused", () => {
    const room = started();
    room.tap("b", "note");
    room.act("a", { type: "pause" });
    room.tap("a", "painting");
    room.share("b", "blue4");
    room.code("b", "laptop", "1998");
    expect(room.state.paintClicks).toBe(0);
    expect(room.journal("a")).toEqual([]);
    expect(room.state.laptopDone).toBe(false);

    room.act("b", { type: "resume" });
    room.tap("a", "painting");
    expect(room.state.paintClicks).toBe(1);
  });

  it("can only pause while a room is being played", () => {
    const room = joined();
    expect(room.state.phase).toBe("briefing");
    room.act("a", { type: "pause" });
    expect(room.state.held).toBe(false);
  });

  it("forgets a pause when the next room starts", () => {
    const room = started();
    room.act("a", { type: "pause" });
    room.sim.applyDebug("a", "level", ["2"]);
    expect(room.state.phase).toBe("briefing");
    expect(room.state.held).toBe(false);
  });

  it("stops the clock in a solo room too", () => {
    const room = makeRoom();
    room.sim.join("a", { name: "Ada", solo: true });
    room.tick();
    room.act("a", { type: "ready" });
    room.act("a", { type: "pause" });
    const before = room.state.timeLeft;
    room.tick(game.config.tickRate * 5);
    expect(room.state.timeLeft).toBe(before);
  });
});

describe("ending a game early", () => {
  it("ends the game for both detectives and says who ended it and where", () => {
    const room = started();
    room.act("b", { type: "end" });
    expect(room.state.phase).toBe("ended");
    expect(room.state.endedBy).toBe("Bo");
    expect(room.state.endedSlot).toBe(2);
    expect(room.state.endedAt).toBe("The Office, loop 1");
    const left = room.state.timeLeft;
    room.tick(game.config.tickRate * 5);
    expect(room.state.timeLeft).toBe(left);
    room.tap("a", "painting");
    expect(room.state.paintClicks).toBe(0);
  });

  it("can be ended from a briefing, and from a paused game", () => {
    const briefing = joined();
    briefing.act("a", { type: "end" });
    expect(briefing.state.phase).toBe("ended");

    const paused = started();
    paused.act("a", { type: "pause" });
    paused.act("b", { type: "end" });
    expect(paused.state.phase).toBe("ended");
    expect(paused.state.held).toBe(false);
  });

  it("can't end a game that hasn't started", () => {
    const room = makeRoom();
    room.sim.join("a", { name: "Ada" });
    room.tick();
    room.act("a", { type: "end" });
    expect(room.state.phase).toBe("waiting");
  });

  it("starts a fresh game in the same room on Play again", () => {
    const room = started();
    room.tap("b", "note");
    room.act("a", { type: "end" });
    room.act("b", { type: "restart" });
    expect(room.state.phase).toBe("briefing");
    expect(room.state.level).toBe(1);
    expect(room.journal("b")).toEqual([]);
    expect(room.state.endedBy).toBe("");
    expect(room.state.endedSlot).toBe(0);
  });

  it("waits for a partner on Play again if the other detective went back to the lobby", () => {
    const room = started();
    room.act("a", { type: "end" });
    room.sim.leave("b");
    room.act("a", { type: "restart" });
    expect(room.state.phase).toBe("waiting");
    room.sim.join("c", { name: "Cy" });
    room.tick();
    expect(room.state.phase).toBe("briefing");
  });

  it("replays a paused and ended game to the same final state", () => {
    const room = started();
    room.act("a", { type: "pause" });
    room.tick(game.config.tickRate * 3);
    room.act("b", { type: "resume" });
    room.tap("b", "note");
    room.act("a", { type: "end" });
    const replay = room.sim.snapshot();
    expect(runReplay(game, replay).stateHash).toBe(replay.final?.stateHash);
  });
});
