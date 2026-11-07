// Tests for `pnpm env:status` and `pnpm env:wait`: which URL each environment has, how /health is
// read, and how its SHA is compared with the branch the environment deploys.
import { describe, expect, it } from "vitest";
import { ENVIRONMENTS as RAILWAY } from "../../../.railway/railway.ts";
import { compareHealth, ENVIRONMENTS, envUrl, normalizeEnv, parseHealth, shaMatches } from "./lib/env.mjs";
import { poll } from "./lib/wait.mjs";

const health = (over: Record<string, unknown> = {}) => ({
  ok: true,
  env: "development",
  sha: "c9bc1c1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  startedAt: "2026-11-07T10:00:00.000Z",
  games: ["template"],
  ...over,
});

describe("ENVIRONMENTS", () => {
  it("deploys the same branches with the same APP_ENV as .railway/railway.ts", () => {
    for (const [name, env] of Object.entries(RAILWAY)) {
      expect(ENVIRONMENTS[name]).toMatchObject({ branch: env.branch, appEnv: env.appEnv });
    }
    expect(Object.keys(ENVIRONMENTS).sort()).toEqual(Object.keys(RAILWAY).sort());
  });

  it("accepts the short names", () => {
    expect(normalizeEnv("dev")).toBe("development");
    expect(normalizeEnv("development")).toBe("development");
    expect(normalizeEnv("prod")).toBe("production");
    expect(normalizeEnv("Production")).toBe("production");
    expect(normalizeEnv("staging")).toBeNull();
  });
});

describe("envUrl", () => {
  it("prefers the flag over the environment variable and drops a trailing slash", () => {
    expect(envUrl("development", { flags: {}, env: { SDM_DEV_URL: "https://dev.example.com/" } })).toEqual({
      url: "https://dev.example.com",
    });
    expect(
      envUrl("production", {
        flags: { "prod-url": "https://prod.example.com" },
        env: { SDM_PROD_URL: "https://other.example.com" },
      }),
    ).toEqual({ url: "https://prod.example.com" });
  });

  it("says which variable or flag to set when the URL is missing or not http(s)", () => {
    const missing = envUrl("production", { flags: {}, env: {} });
    expect(missing.error).toContain("SDM_PROD_URL");
    expect(missing.error).toContain("--prod-url");
    expect(envUrl("development", { flags: {}, env: { SDM_DEV_URL: "dev.example.com" } }).error).toContain(
      "http",
    );
  });
});

describe("parseHealth", () => {
  it("accepts the HealthResponse the host returns", () => {
    expect(parseHealth(health())).toEqual({ health: health() });
  });

  it("rejects anything else", () => {
    expect(parseHealth("<html>").error).toBeDefined();
    expect(parseHealth({ ok: true }).error).toContain("sha");
    expect(parseHealth(health({ ok: false })).error).toContain("ok");
  });
});

describe("shaMatches", () => {
  it("matches a full SHA against a short one of at least 7 characters, in any case", () => {
    expect(shaMatches("c9bc1c1aaaa", "c9bc1c1")).toBe(true);
    expect(shaMatches("C9BC1C1", "c9bc1c1aaaa")).toBe(true);
    expect(shaMatches("c9bc1c1", "c9bc1c2")).toBe(false);
    expect(shaMatches("c9bc", "c9bc1c1")).toBe(false);
    expect(shaMatches("dev", "c9bc1c1")).toBe(false);
  });
});

describe("compareHealth", () => {
  const expected = "c9bc1c1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  it("is ok when the environment runs the branch's head commit", () => {
    expect(compareHealth({ name: "development", health: health(), expectedSha: expected })).toEqual([]);
  });

  it("reports an environment that is unreachable, unhealthy, wrong or behind", () => {
    const rules = (over: Parameters<typeof compareHealth>[0]) => compareHealth(over).map((p) => p.rule);
    expect(rules({ name: "development", error: "fetch failed", expectedSha: expected })).toEqual([
      "unreachable",
    ]);
    expect(
      rules({ name: "development", health: health({ env: "production" }), expectedSha: expected }),
    ).toEqual(["app-env"]);
    expect(
      rules({ name: "development", health: health({ sha: "1234567abc" }), expectedSha: expected }),
    ).toEqual(["sha"]);
    expect(rules({ name: "production", health: health({ sha: "dev" }), expectedSha: expected })).toEqual([
      "app-env",
      "sha",
    ]);
  });
});

describe("poll", () => {
  // A fake clock: sleeping only moves time forward.
  const clock = () => {
    let t = 0;
    return {
      now: () => t,
      sleep: async (ms: number) => {
        t += ms;
      },
    };
  };

  it("stops as soon as the condition holds", async () => {
    const c = clock();
    let n = 0;
    const r = await poll({
      attempt: async () => ++n,
      done: (v) => v === 3,
      timeoutMs: 60_000,
      intervalMs: 1000,
      ...c,
    });
    expect(r).toEqual({ done: true, last: 3, attempts: 3 });
    expect(c.now()).toBe(2000);
  });

  it("gives up after the timeout with the last value it saw", async () => {
    const c = clock();
    const r = await poll({
      attempt: async () => "old",
      done: () => false,
      timeoutMs: 5000,
      intervalMs: 2000,
      ...c,
    });
    expect(r.done).toBe(false);
    expect(r.last).toBe("old");
    expect(c.now()).toBeLessThanOrEqual(5000);
  });

  it("can stop early when the value says waiting is pointless", async () => {
    const c = clock();
    const r = await poll({
      attempt: async () => "red",
      done: () => false,
      stop: (v) => v === "red",
      timeoutMs: 60_000,
      intervalMs: 1000,
      ...c,
    });
    expect(r).toMatchObject({ done: false, stopped: true, attempts: 1 });
  });
});
