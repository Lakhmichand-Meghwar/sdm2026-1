import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { chromium } from "playwright";
import { ScenarioSchema } from "../../scenarios/schema.ts";

const DEFAULT_BASE_URL = "http://localhost:5173";

export async function resolveScenario(argument, cwd = process.cwd()) {
  if (!argument) throw new Error("Usage: pnpm qa:shot <scenario>");

  const candidates = [
    isAbsolute(argument) ? argument : resolve(cwd, argument),
    resolve(cwd, "scenarios", argument),
    resolve(cwd, "scenarios", "samples", argument),
    resolve(cwd, "scenarios", `${argument}.json`),
    resolve(cwd, "scenarios", "samples", `${argument}.json`),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return loadScenario(candidate);
  }

  const sampleDir = resolve(cwd, "scenarios", "samples");
  for (const filename of await readdir(sampleDir)) {
    if (!filename.endsWith(".json")) continue;
    const candidate = join(sampleDir, filename);
    const scenario = await loadScenario(candidate);
    if (scenario.id === argument) return { scenario, path: candidate };
  }
  throw new Error(`Scenario not found: ${argument}`);
}

async function loadScenario(path) {
  const data = JSON.parse(await readFile(path, "utf8"));
  return { scenario: ScenarioSchema.parse(data), path };
}

export function screenshotPath(scenarioId, outputDir, timestamp = new Date()) {
  const stamp = timestamp.toISOString().replaceAll(/[:.]/g, "-");
  const safeId = scenarioId.replaceAll(/[^a-zA-Z0-9_-]/g, "_");
  return join(outputDir, `${safeId}-${stamp}.png`);
}

export function connectionRefusedMessage(baseUrl) {
  return `Nothing is running on the client URL ${baseUrl}. Start the game with "pnpm dev", then run pnpm qa:shot again.`;
}

export function browserInstallMessage() {
  return "Playwright Chromium is not installed. Run pnpm exec playwright install chromium, then run pnpm qa:shot again.";
}

export function formatShotResult(result, timestamp = new Date()) {
  return {
    paths: [result.path],
    scenario: result.scenario.id,
    timestamp: timestamp.toISOString(),
  };
}

export async function takeScenarioShot({
  argument,
  cwd = process.cwd(),
  baseUrl = process.env.QA_BASE_URL ?? DEFAULT_BASE_URL,
  outputDir = resolve(cwd, ".qa", "screenshots"),
  launch = (options) => chromium.launch(options),
  now = new Date(),
} = {}) {
  const { scenario, path } = await resolveScenario(argument, cwd);
  await mkdir(outputDir, { recursive: true });
  const outputPath = screenshotPath(scenario.id, outputDir, now);
  const browser = await launch({ headless: true });
  try {
    const page = await browser.newPage();
    const url = new URL("/", baseUrl);
    url.searchParams.set("scenario", scenario.id);
    await page.goto(url.toString(), { waitUntil: "networkidle" });
    await page.screenshot({ path: outputPath, fullPage: true });
  } finally {
    await browser.close();
  }
  const runsPath = resolve(outputDir, "..", "qa-runs.json");
  const runs = existsSync(runsPath) ? JSON.parse(await readFile(runsPath, "utf8")) : [];
  runs.push({ scenario: scenario.id, screenshot: relative(cwd, outputPath), ranAt: now.toISOString() });
  await writeFile(runsPath, `${JSON.stringify(runs, null, 2)}\n`);
  return { path: outputPath, scenario, scenarioPath: relative(cwd, path) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const json = process.argv.includes("--json");
    const argument = process.argv.find((value, index) => index > 1 && value !== "--json");
    const result = await takeScenarioShot({ argument });
    const output = formatShotResult(result);
    console.log(json ? JSON.stringify(output) : result.path);
  } catch (error) {
    const baseUrl = process.env.QA_BASE_URL ?? DEFAULT_BASE_URL;
    const message = error instanceof Error ? error.message : String(error);
    const output = message.includes("ERR_CONNECTION_REFUSED")
      ? connectionRefusedMessage(baseUrl)
      : /executable doesn't exist|browser.*not found|could not find.*browser/i.test(message)
        ? browserInstallMessage()
        : message;
    console.error(output);
    process.exitCode = 1;
  }
}
