import { describe, expect, it } from "vitest";
import type { EscapeSnapshot } from "../shared/escape.ts";
import { canvasSlashed } from "./canvas.ts";

const snapshot = (paintingCut: boolean, attempt = 1): EscapeSnapshot => ({
  phase: "running",
  patients: [],
  attempt,
  seconds: 60,
  paper: null,
  inventory: [],
  paintingCut,
  cabinetOpen: false,
  year: null,
  ghostSeconds: null,
  message: "",
});

describe("canvas slash sound", () => {
  it("plays when the painting is cut", () => {
    expect(canvasSlashed(snapshot(false), snapshot(true))).toBe(true);
  });

  it("stays silent on join, while it stays cut, and across attempts", () => {
    expect(canvasSlashed(undefined, snapshot(true))).toBe(false);
    expect(canvasSlashed(snapshot(true), snapshot(true))).toBe(false);
    expect(canvasSlashed(snapshot(true), snapshot(false, 2))).toBe(false);
    expect(canvasSlashed(snapshot(false, 1), snapshot(true, 2))).toBe(false);
  });
});
