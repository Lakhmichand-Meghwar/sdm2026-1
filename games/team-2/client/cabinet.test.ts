import { describe, expect, it } from "vitest";
import type { EscapeSnapshot } from "../shared/escape.ts";
import { cabinetOpened } from "./cabinet.ts";

const snapshot = (cabinetOpen: boolean, attempt = 1): EscapeSnapshot => ({
  phase: "running",
  patients: [],
  attempt,
  seconds: 60,
  paper: null,
  inventory: [],
  paintingCut: true,
  cabinetOpen,
  year: null,
  ghostSeconds: null,
  message: "",
});

describe("cabinet creak", () => {
  it("plays when the cabinet unlocks", () => {
    expect(cabinetOpened(snapshot(false), snapshot(true))).toBe(true);
  });

  it("stays silent on join, while it stays open, and when it is reset", () => {
    expect(cabinetOpened(undefined, snapshot(true))).toBe(false);
    expect(cabinetOpened(snapshot(true), snapshot(true))).toBe(false);
    expect(cabinetOpened(snapshot(true), snapshot(false, 2))).toBe(false);
    expect(cabinetOpened(snapshot(false, 1), snapshot(true, 2))).toBe(false);
  });
});
