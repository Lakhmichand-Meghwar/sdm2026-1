import { describe, expect, it } from "vitest";
import type { EscapeSnapshot } from "../shared/escape.ts";
import { walkers } from "./footsteps.ts";

type Patients = EscapeSnapshot["patients"];

const patient = (id: string, slot: number, station: Patients[number]["station"]) => ({
  id,
  slot,
  station,
  resistance: 0,
});

describe("footstep walkers", () => {
  it("plays nothing on the first snapshot", () => {
    expect(walkers(undefined, [patient("a", 1, "desk")])).toEqual([]);
  });

  it("reports patients who moved to a new station", () => {
    const before = [patient("a", 1, null), patient("b", 2, "note")];
    const after = [patient("a", 1, "desk"), patient("b", 2, "painting")];
    expect(walkers(before, after)).toEqual(["a", "b"]);
  });

  it("ignores patients who stayed, just joined or were reset to spawn", () => {
    const before = [patient("a", 1, "desk")];
    const after = [patient("a", 1, "desk"), patient("b", 2, "note")];
    expect(walkers(before, after)).toEqual([]);
    expect(walkers([patient("a", 1, "exit")], [patient("a", 1, null)])).toEqual([]);
  });
});
