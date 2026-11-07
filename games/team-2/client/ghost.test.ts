import { describe, expect, it } from "vitest";
import type { EscapeSnapshot } from "../shared/escape.ts";
import { ghostPresent } from "./ghost.ts";

const snapshot = (ghostSeconds: number | null): EscapeSnapshot => ({
  phase: "running",
  patients: [],
  attempt: 1,
  seconds: 60,
  paper: null,
  inventory: [],
  paintingCut: false,
  cabinetOpen: false,
  year: null,
  ghostSeconds,
  message: "",
});

describe("ghost ambience", () => {
  it("plays for the whole encounter, down to its last second", () => {
    expect(ghostPresent(snapshot(12))).toBe(true);
    expect(ghostPresent(snapshot(0))).toBe(true);
  });

  it("is silent without a ghost or a snapshot", () => {
    expect(ghostPresent(snapshot(null))).toBe(false);
    expect(ghostPresent(undefined)).toBe(false);
  });
});
