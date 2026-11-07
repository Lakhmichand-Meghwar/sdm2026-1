// Tests for the commands that open PRs between the long-lived branches: `pnpm team:promote`
// (feature/team-N -> main), `pnpm branches:sync` (main -> feature/team-N) and `pnpm release`
// (main -> prod). The bodies are built from the real templates and checked with check:pr's rules.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REQUIRED_CHECKS } from "../check-release.mjs";
import {
  bodyProblems,
  changesList,
  ciStatus,
  issueProblems,
  parseMergedPrs,
  promotePr,
  releasePr,
  resolveTeam,
  syncPr,
} from "./lib/branch-prs.mjs";
import { fillTemplate } from "./lib/pr-body.mjs";
import { sectionsOf } from "./lib/template.mjs";

const root = new URL("../../../", import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, root), "utf8");
const config = JSON.parse(read("server/tooling/workflow/types.json"));
const templates: Record<string, string> = Object.fromEntries(
  Object.entries(config.types as Record<string, { prTemplate: string | null }>)
    .filter(([, t]) => t.prTemplate)
    .map(([name, t]) => [name, read(t.prTemplate as string)]),
);
const section = (body: string, heading: string) => sectionsOf(body).find((s) => s.heading === heading)?.body;
const unticked = (body: string) => (section(body, "Checklist") ?? "").match(/- \[ \]/g)?.length ?? 0;

const SEP = "\x1f";
const END = "\x1e";
const log = (...commits: [string, string, string][]) =>
  commits.map(([sha, subject, body]) => `${sha}${SEP}${subject}${SEP}${body}${END}\n`).join("");

describe("resolveTeam", () => {
  it("takes the team number, team-N, --team or the saved sdm.team, in that order", () => {
    expect(resolveTeam({ positional: "2" })).toEqual({ team: "team-2" });
    expect(resolveTeam({ positional: "team-3" })).toEqual({ team: "team-3" });
    expect(resolveTeam({ flag: "team-4", configured: "team-1" })).toEqual({ team: "team-4" });
    expect(resolveTeam({ configured: "team-1" })).toEqual({ team: "team-1" });
  });

  it("rejects anything that isn't team 1 to 4, and never guesses", () => {
    expect(resolveTeam({ positional: "5" }).error).toContain("1 to 4");
    expect(resolveTeam({ positional: "platform" }).error).toContain("1 to 4");
    expect(resolveTeam({ configured: "platform" }).error).toContain("pnpm team:promote <N>");
    expect(resolveTeam({}).error).toContain("pnpm team:promote <N>");
  });
});

describe("parseMergedPrs", () => {
  it("reads PR numbers and titles from GitHub's merge commits, newest first, once each", () => {
    const out = log(
      [
        "c9bc1c1",
        "Merge pull request #158 from Doublespy8971/platform/145-e2e-smoke",
        "test(platform): add e2e smoke\n",
      ],
      ["aaaaaaa", "Merge branch 'main' into platform/145-e2e-smoke", ""],
      ["bbbbbbb", "Merge pull request #121 from nd2003/platform/120-scenarios", ""],
      ["ccccccc", "Merge pull request #158 from Doublespy8971/platform/145-e2e-smoke", "again"],
    );
    expect(parseMergedPrs(out)).toEqual([
      { number: 158, title: "test(platform): add e2e smoke", sha: "c9bc1c1" },
      // No body: fall back to the branch the PR came from.
      { number: 121, title: "platform/120-scenarios", sha: "bbbbbbb" },
    ]);
    expect(parseMergedPrs("")).toEqual([]);
  });

  it("lists them as Markdown, or None", () => {
    expect(changesList([{ number: 158, title: "test(platform): add e2e smoke", sha: "c9bc1c1" }])).toBe(
      "- #158 test(platform): add e2e smoke",
    );
    expect(changesList([])).toBe("None");
  });
});

describe("ciStatus", () => {
  const green = REQUIRED_CHECKS.map((name, id) => ({ name, status: "completed", conclusion: "success", id }));

  it("is green when every required check passed, using the newest run of each", () => {
    expect(ciStatus(green).state).toBe("green");
    const rerun = [
      ...green,
      { name: REQUIRED_CHECKS[0], status: "completed", conclusion: "failure", id: -1 },
    ];
    expect(ciStatus(rerun).state).toBe("green");
  });

  it("is pending while a check is missing or still running", () => {
    const r = ciStatus(green.slice(1));
    expect(r.state).toBe("pending");
    expect(r.pending).toEqual([REQUIRED_CHECKS[0]]);
    const running = green.map((c, i) => (i === 2 ? { ...c, status: "in_progress", conclusion: null } : c));
    expect(ciStatus(running)).toMatchObject({ state: "pending", pending: [REQUIRED_CHECKS[2]] });
  });

  it("is red as soon as one finished check didn't succeed, even while others run", () => {
    const runs = green.map((c, i) =>
      i === 0 ? { ...c, conclusion: "failure" } : i === 1 ? { ...c, status: "queued", conclusion: null } : c,
    );
    expect(ciStatus(runs)).toMatchObject({ state: "red", failing: [`${REQUIRED_CHECKS[0]} (failure)`] });
  });
});

describe("issueProblems", () => {
  const issue = { number: 122, state: "OPEN", labels: ["platform", "enhancement"] };
  it("accepts an issue with the expected team label", () => {
    expect(issueProblems(issue, { number: 122, label: "platform" })).toEqual([]);
  });
  it("rejects a missing issue, the wrong label, and a closed issue when the PR closes it", () => {
    expect(issueProblems(null, { number: 9, label: "platform" })[0].message).toContain("#9 doesn't exist");
    expect(issueProblems(issue, { number: 122, label: "team-2" })[0].rule).toBe("issue");
    expect(issueProblems({ ...issue, state: "CLOSED" }, { number: 122, label: "platform" })).toEqual([]);
    expect(
      issueProblems({ ...issue, state: "CLOSED" }, { number: 122, label: "platform", open: true })[0].message,
    ).toContain("closed");
  });
});

describe("fillTemplate", () => {
  it("keeps every heading in order, drops the comments and fills the given sections", () => {
    const body = fillTemplate(templates.sync, { sections: { Summary: "Hello." } });
    expect(body).not.toContain("<!--");
    expect(sectionsOf(body).map((s) => s.heading)).toEqual(sectionsOf(templates.sync).map((s) => s.heading));
    expect(section(body, "Summary")).toBe("Hello.");
    expect(section(body, "Team")).toBe("platform");
  });

  it("ticks only the checklist items it is told to, with an optional note", () => {
    const body = fillTemplate(templates.release, {
      sections: {},
      tick: { "CI is green on `main`": "checked by pnpm release" },
    });
    expect(body).toContain("- [x] CI is green on `main` (checked by pnpm release)");
    expect(unticked(body)).toBe(8);
  });

  it("fails loudly when a section or checklist item no longer exists in the template", () => {
    expect(() => fillTemplate(templates.sync, { sections: { Rollback: "x" } })).toThrow(/Rollback/);
    expect(() => fillTemplate(templates.sync, { sections: {}, tick: { "No such item": true } })).toThrow(
      /No such item/,
    );
  });
});

const prs = [{ number: 158, title: "test(platform): add e2e smoke", sha: "c9bc1c1" }];
const platformIssue = { number: 122, state: "OPEN", labels: ["platform"] };

describe("releasePr", () => {
  const input = {
    templates,
    issue: platformIssue,
    mainSha: "c9bc1c1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    prodSha: "2214c37bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    prodSubject: "Merge pull request #38 from nd2003/main",
    commits: 61,
    prs,
    checks: REQUIRED_CHECKS,
  };

  it("opens main -> prod with the release template, the merged PRs and a rollback to prod's commit", () => {
    const pr = releasePr(input);
    expect(pr).toMatchObject({
      type: "release",
      head: "main",
      base: "prod",
      title: "chore(platform): release main to prod",
      labels: ["platform"],
    });
    expect(section(pr.body, "Linked issue")).toBe("Refs #122");
    expect(section(pr.body, "Included changes")).toBe("- #158 test(platform): add e2e smoke");
    expect(section(pr.body, "Summary")).toContain("`c9bc1c1`");
    expect(section(pr.body, "Summary")).toContain("61 commit(s) from 1 merged pull request(s)");
    const rollback = section(pr.body, "Rollback") ?? "";
    expect(rollback).toContain("`2214c37`");
    expect(rollback).toContain("git revert -m 1");
    expect(pr.body).not.toMatch(/v\d+\.\d+|tag/i);
  });

  it("passes check:pr apart from the checklist items a person still has to tick", () => {
    const pr = releasePr(input);
    expect(bodyProblems(pr, { config, templates })).toEqual([]);
    expect(pr.body).toContain("- [x] The head branch is `main` and the base branch is `prod`");
    expect(pr.body).toContain("- [x] CI is green on `main`");
    expect(pr.body).toContain("- [ ] The rollback plan above is realistic");
    expect(pr.body).toContain('- [ ] I tested the change as described under "How to test"');
  });
});

describe("syncPr", () => {
  it("opens main -> feature/team-N with the sync template and says whether it conflicts", () => {
    const pr = syncPr({ templates, issue: platformIssue, team: "team-2", behind: 4, prs, conflicts: [] });
    expect(pr).toMatchObject({
      type: "sync",
      head: "main",
      base: "feature/team-2",
      title: "chore(platform): bring feature/team-2 up to date with main",
      labels: ["platform"],
    });
    expect(section(pr.body, "Summary")).toContain("4 commit(s) behind");
    expect(section(pr.body, "Summary")).toContain("no conflicts");
    expect(bodyProblems(pr, { config, templates })).toEqual([]);

    const conflicted = syncPr({
      templates,
      issue: platformIssue,
      team: "team-2",
      behind: 4,
      prs,
      conflicts: ["games/team-2/a.ts"],
    });
    expect(section(conflicted.body, "Summary")).toContain("`games/team-2/a.ts`");
  });
});

describe("promotePr", () => {
  const issue = { number: 40, state: "OPEN", labels: ["team-2"] };

  it("opens feature/team-N -> main as a chore PR that check:pr accepts, closing the team's issue", () => {
    const pr = promotePr({ templates, issue, team: "team-2", ahead: 7, behind: 0, prs, conflicts: [] });
    expect(pr).toMatchObject({
      type: "chore",
      head: "feature/team-2",
      base: "main",
      title: "chore(team-2): merge feature/team-2 into main",
      labels: ["team-2"],
    });
    expect(section(pr.body, "Linked issue")).toBe("Closes #40");
    expect(section(pr.body, "Team")).toBe("team-2");
    expect(section(pr.body, "Summary")).toContain("7 commit(s)");
    expect(bodyProblems(pr, { config, templates })).toEqual([]);
  });

  it("says when the feature branch is behind main or would conflict", () => {
    const pr = promotePr({ templates, issue, team: "team-2", ahead: 7, behind: 3, prs, conflicts: ["x.ts"] });
    const summary = section(pr.body, "Summary") ?? "";
    expect(summary).toContain("3 commit(s) behind main");
    expect(summary).toContain("`x.ts`");
  });
});

describe("bodyProblems", () => {
  it("reports what check:pr would reject, other than unticked items", () => {
    const pr = releasePr({
      templates,
      issue: platformIssue,
      mainSha: "c9bc1c1",
      prodSha: "2214c37",
      prodSubject: "x",
      commits: 1,
      prs: [],
      checks: REQUIRED_CHECKS,
    });
    expect(bodyProblems({ ...pr, base: "main" }, { config, templates }).map((p) => p.rule)).toContain("base");
  });
});
