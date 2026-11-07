// Rules for the commands that open PRs between the long-lived branches (see "Branches" in CLAUDE.md):
//
//   pnpm team:promote <N>   feature/team-N -> main
//   pnpm branches:sync      main -> each feature/team-N that is behind
//   pnpm release            main -> prod
//
// Pure: the commands run git and gh and pass the results in. The bodies are filled from the real
// templates, and only the checklist items a command verified itself are ticked; the rest are left
// for a person, so check:pr stays red until someone has looked.
import { REQUIRED_CHECKS } from "../../check-release.mjs";
import { checkPr } from "./check-pr.mjs";
import { fillTemplate } from "./pr-body.mjs";

/** @typedef {{ number: number, title: string, sha: string }} MergedPr */
/** @typedef {{ number: number, state: string, labels: string[] }} Issue */
/** @typedef {{ type: string, head: string, base: string, title: string, labels: string[], body: string }} PrDraft */

const TEAM = /^(?:team-)?([1-4])$/;
const short = (sha) => sha.slice(0, 7);

/**
 * Which team a command works for: the positional number, then --team, then git config sdm.team.
 * @param {{ positional?: string | null, flag?: string | null, configured?: string | null }} input
 * @returns {{ team: string, error?: undefined } | { error: string, team?: undefined }}
 */
export function resolveTeam({ positional = null, flag = null, configured = null }) {
  const given = positional ?? flag;
  if (given) {
    const m = TEAM.exec(given.trim());
    return m ? { team: `team-${m[1]}` } : { error: `"${given}" is not a game team. Use a team from 1 to 4.` };
  }
  const m = configured ? TEAM.exec(configured.trim()) : null;
  if (m) return { team: `team-${m[1]}` };
  return {
    error: `Which team? Run pnpm team:promote <N> with a team from 1 to 4${configured ? ` (your saved team is ${configured}, which has no feature branch)` : ""}.`,
  };
}

/**
 * The PRs merged in a range, from GitHub's merge commits ("Merge pull request #N from owner/branch",
 * with the PR title as the body). Input: `git log --merges --format=%H%x1f%s%x1f%b%x1e <range>`.
 * Other merges (git merge of a branch) are not PRs and are skipped. Newest first, each PR once.
 * @param {string} out
 * @returns {MergedPr[]}
 */
export function parseMergedPrs(out) {
  /** @type {MergedPr[]} */
  const prs = [];
  for (const record of out.split("\x1e")) {
    const [sha, subject, body = ""] = record.replace(/^\s+/, "").split("\x1f");
    const m = subject && /^Merge pull request #(\d+) from (\S+)/.exec(subject);
    if (!m) continue;
    const number = Number(m[1]);
    if (prs.some((p) => p.number === number)) continue;
    const title =
      body
        .split(/\r?\n/)
        .find((l) => l.trim() !== "")
        ?.trim() ?? m[2].replace(/^[^/]+\//, "");
    prs.push({ number, title, sha: sha.trim() });
  }
  return prs;
}

/** @param {MergedPr[]} prs */
export function changesList(prs) {
  return prs.length === 0 ? "None" : prs.map((p) => `- #${p.number} ${p.title}`).join("\n");
}

/**
 * CI on one commit, from its check runs (GitHub API). The newest run of each required check counts,
 * as in the release gate. Red as soon as one finished without success; pending while any is missing
 * or still running; green when all succeeded.
 * @param {{ name: string, status: string, conclusion: string | null, id?: number }[]} checkRuns
 * @param {string[]} [required]
 */
export function ciStatus(checkRuns, required = REQUIRED_CHECKS) {
  /** @type {string[]} */
  const failing = [];
  /** @type {string[]} */
  const pending = [];
  for (const name of required) {
    const newest = checkRuns.filter((r) => r.name === name).sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0];
    if (newest?.status !== "completed") pending.push(name);
    else if (newest.conclusion !== "success") failing.push(`${name} (${newest.conclusion})`);
  }
  const state = failing.length > 0 ? "red" : pending.length > 0 ? "pending" : "green";
  return { state, failing, pending };
}

/**
 * The issue a PR links: it must exist and carry the PR's team label; a PR that closes it needs it open.
 * @param {Issue | null} issue
 * @param {{ number: number, label: string, open?: boolean }} expect
 */
export function issueProblems(issue, { number, label, open = false }) {
  if (!issue) return [{ rule: "issue", message: `Issue #${number} doesn't exist.` }];
  /** @type {import("./report.mjs").Problem[]} */
  const problems = [];
  if (!issue.labels.includes(label)) {
    problems.push({
      rule: "issue",
      message: `Issue #${number} has the labels ${issue.labels.join(", ") || "(none)"}, not ${label}.`,
      fix: `Use an issue labelled ${label}, or add the label to #${number}.`,
    });
  }
  if (open && issue.state !== "OPEN") {
    problems.push({ rule: "issue", message: `Issue #${number} is closed; this PR would close it.` });
  }
  return problems;
}

const conflictText = (conflicts) =>
  conflicts.length === 0
    ? "Merging shows no conflicts."
    : `Merging conflicts in ${conflicts.map((f) => `\`${f}\``).join(", ")}; resolve them in this PR before merging.`;

/**
 * @param {{
 *   templates: Record<string, string>,
 *   issue: Issue,
 *   mainSha: string,
 *   prodSha: string,
 *   prodSubject: string,
 *   commits: number,
 *   prs: MergedPr[],
 *   checks: string[],
 * }} input checks: the CI checks that passed on mainSha
 * @returns {PrDraft}
 */
export function releasePr({ templates, issue, mainSha, prodSha, prodSubject, commits, prs, checks }) {
  const main = short(mainSha);
  const prod = short(prodSha);
  const body = fillTemplate(templates.release, {
    sections: {
      "Linked issue": `Refs #${issue.number}`,
      Team: "platform",
      Summary: [
        `Releases \`main\` at \`${main}\` to \`prod\`: ${commits} commit(s) from ${prs.length} merged pull request(s) since the last release. CI is green on \`${main}\` (${checks.join(", ")}).`,
        "",
        `Before merging, check that the development environment runs \`${main}\`: \`pnpm env:status\`, or \`pnpm env:wait development ${main}\`.`,
      ].join("\n"),
      "Included changes": changesList(prs),
      Rollback: `Go back to \`prod\` at \`${prod}\` (${prodSubject}), the commit production runs now. Fastest: in Railway, redeploy the production deployment that was running before this merge. Otherwise revert this merge commit on \`prod\` through a PR (\`git revert -m 1 <merge commit>\`), so production rebuilds \`${prod}\`. The platform team does it and tells the teams; then fix on \`main\` and release again.`,
      "How to test": [
        `1. Before merging: CI is green on \`${main}\`, the release gate passes on this PR, and \`pnpm env:status\` shows development on \`${main}\` with \`ok: true\`.`,
        "2. After merging: `pnpm env:wait production <merge commit on prod>` succeeds, and `git log origin/prod..origin/main` is empty.",
        "3. Smoke test in production: create a room, join it by code from a second browser, and move.",
      ].join("\n"),
      Screenshots: "None",
    },
    tick: {
      "The PR refers to an issue with `Refs #N`": "checked by pnpm release",
      "This PR has the same team label as the issue": true,
      "The title follows Conventional Commits": true,
      "The head branch is `main` and the base branch is `prod`": true,
      "CI is green on `main`": `checked on ${main} by pnpm release`,
    },
  });
  return {
    type: "release",
    head: "main",
    base: "prod",
    title: "chore(platform): release main to prod",
    labels: ["platform"],
    body,
  };
}

/**
 * @param {{
 *   templates: Record<string, string>,
 *   issue: Issue,
 *   team: string,
 *   behind: number,
 *   prs: MergedPr[],
 *   conflicts: string[],
 * }} input behind: commits on main that feature/team-N doesn't have
 * @returns {PrDraft}
 */
export function syncPr({ templates, issue, team, behind, prs, conflicts }) {
  const branch = `feature/${team}`;
  const body = fillTemplate(templates.sync, {
    sections: {
      "Linked issue": `Refs #${issue.number}`,
      Team: "platform",
      Summary: `Brings \`${branch}\` up to date with \`main\`: it is ${behind} commit(s) behind. ${conflicts.length === 0 ? "Merging shows no conflicts." : conflictText(conflicts)}`,
      "Included changes": changesList(prs),
      "How to test": [
        "1. CI is green on this PR.",
        `2. After merging: \`git log origin/${branch}..origin/main\` is empty.`,
      ].join("\n"),
      Screenshots: "None",
    },
    tick: {
      "The PR refers to an issue with `Refs #N`": "checked by pnpm branches:sync",
      "This PR has the same team label as the issue": true,
      "The title follows Conventional Commits": true,
      "The head branch is `main` and the base branch is `feature/team-N`": true,
      ...(conflicts.length === 0 ? { "The merge adds no new commits of its own": true } : {}),
    },
  });
  return {
    type: "sync",
    head: "main",
    base: branch,
    title: `chore(platform): bring ${branch} up to date with main`,
    labels: ["platform"],
    body,
  };
}

/**
 * The promotion of a team's integration branch into main. check:pr treats a PR from feature/team-N
 * like work (Closes #N, one of the five work templates); it is a chore, like release and sync PRs.
 * @param {{
 *   templates: Record<string, string>,
 *   issue: Issue,
 *   team: string,
 *   ahead: number,
 *   behind: number,
 *   prs: MergedPr[],
 *   conflicts: string[],
 * }} input ahead: commits main doesn't have yet; behind: commits on main the feature branch lacks
 * @returns {PrDraft}
 */
export function promotePr({ templates, issue, team, ahead, behind, prs, conflicts }) {
  const branch = `feature/${team}`;
  const lines = [
    `Brings ${team}'s finished work into \`main\`: ${ahead} commit(s) from ${prs.length} merged pull request(s) on \`${branch}\`.`,
  ];
  if (behind > 0) {
    lines.push(
      `\`${branch}\` is ${behind} commit(s) behind main. Merge main into it first (\`pnpm branches:sync\`), or resolve it in this PR.`,
    );
  }
  lines.push(conflictText(conflicts), `Included pull requests:\n\n${changesList(prs)}`);
  const body = fillTemplate(templates.chore, {
    sections: {
      "Linked issue": `Closes #${issue.number}`,
      Team: team,
      Summary: lines.join("\n\n"),
      Impact: `Once merged, ${team}'s changes deploy to the development environment. Other teams get them when \`main\` is merged back into their feature branches (\`pnpm branches:sync\`).`,
      "How to test": [
        "1. CI and the Workflow checks are green on this PR.",
        `2. After merging: \`git log origin/main..origin/${branch}\` is empty, and \`pnpm env:status\` shows development on the new \`main\`.`,
      ].join("\n"),
      Screenshots: "None",
    },
    tick: {
      "The PR closes an issue with `Closes #N`": "checked by pnpm team:promote",
      "This PR has the same team label as the issue": true,
      "The title follows Conventional Commits": true,
      "The branch is named `<team-label>/<issue-number>-<short-description>`": `not applicable: ${branch} is ${team}'s integration branch`,
      "The base branch is correct": true,
      ...(behind === 0 ? { "The branch is up to date with its base branch": true } : {}),
    },
  });
  return {
    type: "chore",
    head: branch,
    base: "main",
    title: `chore(${team}): merge ${branch} into main`,
    labels: [team],
    body,
  };
}

/**
 * What check:pr would reject in a drafted PR, apart from the checklist items left for a person.
 * @param {PrDraft} pr
 * @param {{ config: any, templates: Record<string, string> }} ctx
 */
export function bodyProblems(pr, { config, templates }) {
  const { problems } = checkPr({ ...pr, config, templates });
  return problems.filter((p) => !(p.rule === "checklist" && /not ticked/.test(p.message)));
}
