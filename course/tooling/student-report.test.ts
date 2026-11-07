import { describe, expect, it } from "vitest";
import { collectStats, formatStudentReport, scoreAll, scoreStudent } from "./lib/student-report.mjs";

const teamLabels = ["team-1", "team-2", "team-3", "team-4", "platform", "team-instructor"];

const commit = (oid: string, authors: (string | null)[], refs = true) => ({
  oid,
  message: refs ? "feat(team-2): add login\n\nRefs #12\n" : "feat(team-2): add login\n",
  authors,
});
const pr = (over: Record<string, unknown> = {}) => ({
  number: 30,
  state: "MERGED",
  additions: 100,
  deletions: 10,
  author: "alice",
  mergedBy: "bob",
  labels: ["team-2"],
  reviewers: [],
  commenters: [],
  commits: [],
  ...over,
});
const issue = (over: Record<string, unknown> = {}) => ({
  number: 12,
  title: "[team-2] Add login",
  author: "alice",
  assignees: [],
  labels: ["team-2", "enhancement"],
  commenters: [],
  ...over,
});
const stats = (input: Record<string, unknown>) =>
  collectStats({ prs: [], issues: [], docs: new Map(), teamLabels, ...input });
const of = (list: ReturnType<typeof stats>, login: string) => {
  const found = list.find((s) => s.login === login);
  if (!found) throw new Error(`no stats for ${login}`);
  return found;
};

describe("collectStats", () => {
  it("counts merged, open and closed PRs and the merged lines", () => {
    const s = of(
      stats({ prs: [pr(), pr({ number: 31, state: "OPEN" }), pr({ number: 32, state: "CLOSED" })] }),
      "alice",
    );
    expect([s.prsOpened, s.prsMerged, s.prsOpen, s.prsClosed]).toEqual([3, 1, 1, 1]);
    expect([s.additions, s.deletions]).toEqual([100, 10]);
  });

  it("credits AI agent commits to the PR author and counts each person once per commit", () => {
    const s = of(
      stats({ prs: [pr({ commits: [commit("a", ["alice", "claude"]), commit("b", ["claude"])] })] }),
      "alice",
    );
    expect(s.commits).toBe(2);
    expect(s.commitsWithRefs).toBe(2);
  });

  it("counts a commit once when it appears in several PRs", () => {
    const list = stats({
      prs: [
        pr({ commits: [commit("a", ["alice"])] }),
        pr({ number: 40, author: "bob", commits: [commit("a", ["alice"])] }),
      ],
    });
    expect(of(list, "alice").commits).toBe(1);
    expect(of(list, "bob").commits).toBe(0);
  });

  it("only counts a reference on its own line", () => {
    const s = of(
      stats({
        prs: [pr({ commits: [{ oid: "a", message: "fix: see Refs #3 inline", authors: ["alice"] }] })],
      }),
      "alice",
    );
    expect(s.commitsWithRefs).toBe(0);
  });

  it("ignores self-reviews and self-comments", () => {
    const list = stats({
      prs: [pr({ reviewers: ["alice", "carol", "carol"], commenters: ["alice", "dave"] })],
    });
    expect(of(list, "alice").reviewsGiven).toBe(0);
    expect(of(list, "carol").reviewsGiven).toBe(1);
    expect(of(list, "dave").comments).toBe(1);
    expect(of(list, "bob").merges).toBe(1);
  });

  it("flags issues without a team label or a matching title", () => {
    const s = of(
      stats({
        issues: [issue(), issue({ number: 13, title: "Add login" }), issue({ number: 14, labels: ["bug"] })],
      }),
      "alice",
    );
    expect(s.issuesOpened).toBe(3);
    expect(s.issuesBadlyNamed).toBe(2);
  });

  it("uses the documentation results", () => {
    const docs = new Map([
      [30, { ok: true, rules: [] }],
      [31, { ok: false, rules: ["title", "title", "checklist"] }],
    ]);
    const s = of(stats({ prs: [pr(), pr({ number: 31 })], docs }), "alice");
    expect([s.docPass, s.docFail]).toEqual([1, 1]);
    expect(s.docProblems).toEqual({ title: 1, checklist: 1 });
  });

  it("includes members without any activity", () => {
    expect(of(stats({ members: ["erin"] }), "erin").prsOpened).toBe(0);
  });
});

describe("scoreStudent", () => {
  const base = of(stats({ members: ["x"] }), "x");

  it("gives 1 and says so when there is no activity", () => {
    const r = scoreStudent(base);
    expect(r.score).toBe(1);
    expect(r.justification).toMatch(/no visible activity/);
  });

  it("gives 5 for strong delivery, process and collaboration", () => {
    const r = scoreStudent({
      ...base,
      prsOpened: 6,
      prsMerged: 6,
      commits: 10,
      commitsWithRefs: 10,
      docPass: 4,
      docFail: 2,
      issuesOpened: 3,
      reviewsGiven: 5,
      comments: 2,
      teams: { "team-2": 9 },
    });
    expect([r.delivery, r.process, r.collaboration, r.points, r.score]).toEqual([4, 3, 3, 10, 5]);
    expect(r.team).toBe("team-2");
  });

  it("maps points to the 1-5 scale", () => {
    const at = (prsMerged: number, prsOpen = 0) =>
      scoreStudent({ ...base, prsOpened: prsMerged + prsOpen, prsMerged, prsOpen }).score;
    expect(at(0, 1)).toBe(2); // 1 point
    expect(at(1)).toBe(2); // 2 points
    expect(at(2)).toBe(3); // 3 points
    expect(at(5)).toBe(3); // 4 points
  });

  it("applies the 50% and 80% thresholds", () => {
    expect(scoreStudent({ ...base, docPass: 1, docFail: 1 }).process).toBe(1);
    expect(scoreStudent({ ...base, docPass: 1, docFail: 2 }).process).toBe(0);
    expect(scoreStudent({ ...base, commits: 5, commitsWithRefs: 4 }).process).toBe(1);
    expect(scoreStudent({ ...base, commits: 5, commitsWithRefs: 3 }).process).toBe(0);
  });

  it("mentions assigned work that has not been delivered", () => {
    expect(scoreStudent({ ...base, issuesAssigned: 2 }).justification).toMatch(
      /assigned to 2 issues, none delivered yet/,
    );
  });
});

describe("scoreAll and formatStudentReport", () => {
  const list = stats({ prs: [pr()], members: ["ferenc-munde", "claude", "zed"] });

  it("leaves out instructors and agents and sorts best first", () => {
    expect(scoreAll(list).map((r) => r.login)).toEqual(["alice", "bob", "zed"]);
  });

  it("writes one table row per student and escapes pipes", () => {
    const rows = scoreAll(list);
    rows[0].justification = "a | b.";
    const md = formatStudentReport(rows, { repo: "o/r", generatedAt: "now", prCount: 1, issueCount: 0 });
    expect(md).toContain("| `alice` | team-2 | **2** |");
    expect(md).toContain("a \\| b.");
    expect(md.match(/^\| `/gm)).toHaveLength(3);
  });
});
