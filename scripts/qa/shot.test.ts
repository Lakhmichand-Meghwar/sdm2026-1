import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const {
  browserInstallMessage,
  connectionRefusedMessage,
  formatShotResult,
  resolveScenario,
  screenshotPath,
  takeScenarioShot,
} = await import("./shot.mjs");

describe("qa:shot", () => {
  it("explains how to start the game when the client refuses the connection", () => {
    expect(connectionRefusedMessage("http://localhost:5173")).toContain(
      'Nothing is running on the client URL http://localhost:5173. Start the game with "pnpm dev"',
    );
  });

  it("explains how to install Chromium when the browser is missing", () => {
    expect(browserInstallMessage()).toContain("pnpm exec playwright install chromium");
  });

  it("resolves a scenario by id and validates its schema", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "qa-shot-"));
    await mkdir(join(cwd, "scenarios", "samples"), { recursive: true });
    await writeFile(
      join(cwd, "scenarios", "samples", "sample.json"),
      JSON.stringify({ id: "sample", name: "Sample", description: "Test", players: [] }),
    );
    const result = await resolveScenario("sample", cwd);
    expect(result.scenario.id).toBe("sample");
  });

  it("launches headless, loads the scenario URL, and saves a screenshot", async () => {
    const page = { goto: vi.fn(), screenshot: vi.fn() };
    const close = vi.fn();
    const launch = vi.fn().mockResolvedValue({ newPage: vi.fn().mockResolvedValue(page), close });
    const cwd = await mkdtemp(join(tmpdir(), "qa-shot-"));
    await mkdir(join(cwd, "scenarios"), { recursive: true });
    await writeFile(
      join(cwd, "scenarios", "sample.json"),
      JSON.stringify({ id: "sample", name: "Sample", description: "Test", players: [] }),
    );
    const result = await takeScenarioShot({
      argument: "scenarios/sample.json",
      cwd,
      baseUrl: "http://localhost:5173",
      launch,
      now: new Date("2026-01-02T03:04:05.000Z"),
    });
    expect(launch).toHaveBeenCalledWith({ headless: true });
    expect(page.goto).toHaveBeenCalledWith("http://localhost:5173/?scenario=sample", {
      waitUntil: "networkidle",
    });
    expect(page.screenshot).toHaveBeenCalledWith({ path: result.path, fullPage: true });
    expect(close).toHaveBeenCalled();
    expect(result.path).toBe(
      screenshotPath("sample", join(cwd, ".qa", "screenshots"), new Date("2026-01-02T03:04:05.000Z")),
    );
    expect(JSON.parse(await readFile(join(cwd, ".qa", "qa-runs.json"), "utf8"))).toMatchObject([
      { scenario: "sample", screenshot: ".qa/screenshots/sample-2026-01-02T03-04-05-000Z.png" },
    ]);
  });

  it("supports JSON output data", async () => {
    const result = formatShotResult(
      { path: "/tmp/sample.png", scenario: { id: "sample" } },
      new Date("2026-01-02T03:04:05.000Z"),
    );
    expect(result).toEqual({
      paths: ["/tmp/sample.png"],
      scenario: "sample",
      timestamp: "2026-01-02T03:04:05.000Z",
    });
  });
});
