import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkRelease, prFromEvent, REQUIRED_CHECKS } from "./check-release.mjs";

const pr = {
  baseRef: "prod",
  headRef: "main",
  headRepo: "nd2003/sdm2026-1",
  baseRepo: "nd2003/sdm2026-1",
  draft: false,
  headSha: "0123456789abcdef",
  body: "## Summary\n\nx\n\n## Rollback\n\nRedeploy the previous Railway deployment.\n\n## Checklist\n",
};
const green = REQUIRED_CHECKS.map((name, id) => ({ name, status: "completed", conclusion: "success", id }));
const gate = (over: Record<string, unknown> = {}, runs = green) =>
  checkRelease({ pr: { ...pr, ...over }, checkRuns: runs });
const rules = (r: { problems: { rule: string }[] }) => r.problems.map((p) => p.rule);

describe("checkRelease", () => {
  it("ci.yml job names and both rulesets match REQUIRED_CHECKS exactly", () => {
    const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
    const jobNames = [...read(".github/workflows/ci.yml").matchAll(/^ {4}name: "?(.+?)"?$/gm)].map(
      (m) => m[1],
    );
    expect(jobNames).toEqual(REQUIRED_CHECKS);
    for (const ruleset of [".github/rulesets/main.json", ".github/rulesets/prod.json"]) {
      const rules = JSON.parse(read(ruleset)).rules as {
        type: string;
        parameters?: { required_status_checks?: { context: string }[] };
      }[];
      const contexts =
        rules
          .find((r) => r.type === "required_status_checks")
          ?.parameters?.required_status_checks?.map((c) => c.context) ?? [];
      expect(contexts.filter((c) => c !== "release gate")).toEqual(REQUIRED_CHECKS);
    }
  });

  it("requires every CI job from ci.yml", () => {
    expect(REQUIRED_CHECKS).toEqual([
      "🧰 setup",
      "📝 config",
      "🧹 lint",
      "🔎 typecheck",
      "🧪 test",
      "📦 build",
    ]);
  });

  it("opens for a release from main with green CI and a rollback plan", () => {
    expect(gate()).toEqual({ ok: true, problems: [] });
  });

  it("blocks a PR into anything but prod", () => {
    expect(rules(gate({ baseRef: "main" }))).toEqual(["base"]);
  });

  it("blocks anything but main from going to prod", () => {
    const r = gate({ headRef: "team-2/14-login" });
    expect(rules(r)).toEqual(["head"]);
    expect(r.problems[0].message).toContain("Merge your work into main first");
  });

  it("blocks a PR from a fork and a draft", () => {
    expect(rules(gate({ headRepo: "someone/sdm2026-1" }))).toEqual(["fork"]);
    expect(rules(gate({ draft: true }))).toEqual(["draft"]);
  });

  it.each([["has not run", [] as { name: string; status: string; conclusion: string | null; id: number }[]]])(
    "blocks when CI %s",
    (_n, runs) => {
      const r = gate({}, runs);
      expect(rules(r)).toEqual(REQUIRED_CHECKS.map(() => "ci"));
      expect(r.problems[0].message).toContain("has not run on 0123456");
    },
  );

  it("blocks when one job failed, and names it", () => {
    const runs = green.map((r) => (r.name === "🧪 test" ? { ...r, conclusion: "failure" } : r));
    const r = gate({}, runs);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0].message).toContain('"🧪 test" failure');
  });

  it("blocks while a job is still running", () => {
    const runs = green.map((r, i) => (i === 0 ? { ...r, status: "in_progress", conclusion: null } : r));
    expect(gate({}, runs).problems[0].message).toContain("still in_progress");
  });

  it("uses the newest run of a job, so a green rerun fixes a red run", () => {
    const others = green.filter((r) => r.name !== "📦 build");
    const rerun = { name: "📦 build", status: "completed", conclusion: "success", id: 99 };
    const runs = [{ ...rerun, conclusion: "failure", id: 1 }, rerun, ...others];
    expect(gate({}, runs).ok).toBe(true);
    const newestRed = [{ ...rerun, conclusion: "failure" }, { ...rerun, id: 1 }, ...others];
    expect(gate({}, newestRed).ok).toBe(false);
  });

  it("ignores unrelated check runs", () => {
    const extra = {
      name: "pull request follows the template",
      status: "completed",
      conclusion: "failure",
      id: 500,
    };
    expect(gate({}, [...green, extra]).ok).toBe(true);
  });

  it.each([
    ["no Rollback section", "## Summary\n\nx\n"],
    ["an empty Rollback section", "## Rollback\n\n## Checklist\n"],
    ["a Rollback section with only a list marker", "## Rollback\n\n-\n"],
    ["a Rollback section with only a comment", "## Rollback\n\n<!-- how to go back -->\n"],
    ["no body at all", null],
  ])("blocks %s", (_n, body) => {
    expect(rules(gate({ body }))).toEqual(["rollback"]);
  });

  it("reports every problem at once", () => {
    const r = gate({ headRef: "x", draft: true, body: "" }, []);
    expect(rules(r)).toEqual(["head", "draft", ...REQUIRED_CHECKS.map(() => "ci"), "rollback"]);
  });
});

describe("prFromEvent", () => {
  it("reads the PR from a pull_request event payload", () => {
    const event = {
      pull_request: {
        draft: false,
        body: "b",
        base: { ref: "prod", repo: { full_name: "o/r" } },
        head: { ref: "main", sha: "abc", repo: { full_name: "o/r" } },
      },
    };
    expect(prFromEvent(event)).toEqual({
      baseRef: "prod",
      headRef: "main",
      headRepo: "o/r",
      baseRepo: "o/r",
      draft: false,
      headSha: "abc",
      body: "b",
    });
  });

  it("copes with a deleted fork", () => {
    const event = {
      pull_request: {
        base: { ref: "prod", repo: { full_name: "o/r" } },
        head: { ref: "x", sha: "a", repo: null },
      },
    };
    expect(prFromEvent(event).headRepo).toBe("(deleted fork)");
  });
});
