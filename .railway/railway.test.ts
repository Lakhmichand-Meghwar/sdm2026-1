import { spawnSync } from "node:child_process";
import { createRailwayContext, type ProjectDefinition, type ServiceNode } from "railway/iac";
import { describe, expect, it } from "vitest";
import program, { ENVIRONMENTS, type EnvironmentName, GAMES } from "./railway.ts";

async function plan(environment: string): Promise<ServiceNode[]> {
  const definition: ProjectDefinition = await program(createRailwayContext({ environment }), (name, def) => ({
    name,
    ...def,
  }));
  return (definition.resources ?? []).flat() as ServiceNode[];
}

describe.each(Object.keys(ENVIRONMENTS) as EnvironmentName[])("railway.ts in %s", (environment) => {
  const { branch, appEnv } = ENVIRONMENTS[environment];

  it("has one service per game", async () => {
    expect((await plan(environment)).map((s) => s.name)).toEqual(GAMES.map((g) => g.service));
  });

  it("deploys the right branch, and only after CI passed", async () => {
    for (const s of await plan(environment)) {
      expect(s.source).toMatchObject({ type: "github", repo: "nd2003/sdm2026-1", branch, checkSuites: true });
    }
  });

  it("runs one replica, health-checked on /health, with the right APP_ENV", async () => {
    for (const s of await plan(environment)) {
      const replicas = Object.values(s.deploy?.multiRegionConfig ?? {}).map((r) => r?.numReplicas ?? 0);
      expect(replicas).toEqual([1]);
      expect(s.deploy?.healthcheckPath).toBe("/health");
      expect(s.deploy?.sleepApplication).toBe(false);
      expect(s.deploy?.startCommand).toMatch(/^node /);
      expect(s.variables?.APP_ENV).toEqual({ type: "literal", value: appEnv });
    }
  });
});

describe("railway.ts", () => {
  it("never deploys main to production", () => {
    expect(ENVIRONMENTS.production.branch).toBe("prod");
  });

  it("refuses an environment it doesn't manage", async () => {
    await expect(plan("staging")).rejects.toThrow(/not "staging"/);
  });

  it("loads with plain Node type stripping, the way the Railway CLI runs it", () => {
    // A file:// URL, not a path: on Windows, import("D:\\...") reads "d:" as a URL scheme and fails.
    const url = new URL("./railway.ts", import.meta.url).href;
    const run = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "-e", `await import(${JSON.stringify(url)});`],
      { encoding: "utf8" },
    );
    expect(run.stderr).not.toMatch(/Error/);
    expect(run.status).toBe(0);
  });
});
