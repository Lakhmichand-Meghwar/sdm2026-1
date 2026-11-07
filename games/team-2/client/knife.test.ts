import { describe, expect, it } from "vitest";
import type { EscapeSnapshot } from "../shared/escape.ts";
import { knifeTaken } from "./knife.ts";

const snapshot = (inventory: EscapeSnapshot["inventory"], attempt = 1): EscapeSnapshot => ({
  phase: "running",
  patients: [],
  attempt,
  seconds: 60,
  paper: null,
  inventory,
  paintingCut: false,
  cabinetOpen: false,
  year: null,
  ghostSeconds: null,
  message: "",
});

describe("knife pickup sound", () => {
  it("plays when the knife enters the shared inventory", () => {
    expect(knifeTaken(snapshot([]), snapshot(["knife"]))).toBe(true);
  });

  it("stays silent on join, while it is held, for other items and across attempts", () => {
    expect(knifeTaken(undefined, snapshot(["knife"]))).toBe(false);
    expect(knifeTaken(snapshot(["knife"]), snapshot(["knife", "key"]))).toBe(false);
    expect(knifeTaken(snapshot([]), snapshot(["key"]))).toBe(false);
    expect(knifeTaken(snapshot([], 1), snapshot(["knife"], 2))).toBe(false);
  });
});
