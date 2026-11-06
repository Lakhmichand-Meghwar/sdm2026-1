import { describe, expect, it } from "vitest";
import {
  addClue,
  advanceLevel,
  checkCode,
  hasClue,
  LEVELS,
  makeState,
  pullBook,
  resetCount,
  resetLoop,
  SHELF_ORDER,
  toggleSwitch,
} from "./game.ts";

describe("levels", () => {
  it("get shorter and never lose the penalty once it starts", () => {
    const durations = LEVELS.map((l) => l.duration);
    expect(durations).toEqual([...durations].sort((a, b) => b - a));
    expect(LEVELS[0]?.penalty).toBe(0);
    expect(LEVELS[1]?.penalty).toBeGreaterThan(0);
  });

  it("advanceLevel moves to the next room and keeps clues", () => {
    const s = makeState();
    addClue(s, "year1998");
    expect(advanceLevel(s)).toBe(true);
    expect(s.level).toBe(2);
    expect(s.loop).toBe(1);
    expect(s.timeLeft).toBe(LEVELS[1]?.duration);
    expect(hasClue(s, "year1998")).toBe(true);
  });

  it("advanceLevel returns false after the last room", () => {
    const s = makeState();
    s.level = LEVELS.length;
    expect(advanceLevel(s)).toBe(false);
  });
});

describe("loop reset", () => {
  it("clears the room but keeps clues", () => {
    const s = makeState();
    addClue(s, "blue4");
    s.keyHolder = 2;
    s.powered = true;
    s.shelfStep = 3;
    resetLoop(s);
    expect(s.loop).toBe(2);
    expect(s.keyHolder).toBeNull();
    expect(s.powered).toBe(false);
    expect(s.shelfStep).toBe(0);
    expect(hasClue(s, "blue4")).toBe(true);
  });

  it("counts resets across levels", () => {
    const s = makeState();
    resetLoop(s);
    advanceLevel(s);
    advanceLevel(s);
    advanceLevel(s);
    expect(resetCount(s)).toBe(1);
  });
});

describe("archive shelf", () => {
  it("solves in the right order", () => {
    const s = makeState();
    const results = SHELF_ORDER.map((b) => pullBook(s, b));
    expect(results).toEqual(["correct", "correct", "correct", "solved"]);
    expect(s.keyVisible).toBe(true);
  });

  it("starts over after a wrong book", () => {
    const s = makeState();
    pullBook(s, SHELF_ORDER[0] as number);
    expect(pullBook(s, 3)).toBe("wrong");
    expect(s.shelfStep).toBe(0);
  });
});

describe("vault switches", () => {
  it("powers on only when the pattern matches", () => {
    const s = makeState();
    expect(toggleSwitch(s, 0)).toBe(false);
    expect(toggleSwitch(s, 2)).toBe(false);
    expect(toggleSwitch(s, 3)).toBe(true);
    expect(toggleSwitch(s, 1)).toBe(false);
  });
});

describe("codes", () => {
  it("accepts the right code per room", () => {
    expect(checkCode("laptop", "1998")).toBe(true);
    expect(checkCode("archive", "0417")).toBe(true);
    expect(checkCode("vault", "8991")).toBe(true);
    expect(checkCode("vault", "1998")).toBe(false);
  });
});
