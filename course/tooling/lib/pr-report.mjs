// The rules behind `node course/tooling/pr-report.mjs`: is a pull request documented well enough for the evaluation?
// Pure (no GitHub, no file system), so every rule is unit-tested. The template rules come from
// `pnpm check:pr`; this file adds what check:pr cannot see from the PR alone: the linked issue's team
// label and the issue references in the commits.
import { checkPr } from "../../../server/tooling/workflow/lib/check-pr.mjs";

const CLOSING = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i;
const ANY_REFERENCE = /\b(?:refs|close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i;
// Messages git or a tool generates (same list as check:commit).
const EXEMPT_COMMIT = /^(?:Merge |Revert "|fixup! |squash! |amend! )/;

/**
 * The issue a PR body links. Work PRs must close it; sync and release PRs (head `main`) may use "Refs".
 * @param {string | null | undefined} body
 * @param {{ allowRefs?: boolean }} [opts]
 * @returns {number | null}
 */
export function linkedIssue(body, opts = {}) {
  const m = (opts.allowRefs ? ANY_REFERENCE : CLOSING).exec(body ?? "");
  return m ? Number(m[1]) : null;
}

/**
 * Which team a PR belongs to in the report: its team label, else the title (the scope of a Conventional
 * Commit title, `feat(team-2): …`, or the `[team-2] …` prefix older PRs used), else the branch prefix.
 * @param {{ title: string, head: string, labels: string[] }} pr
 * @param {string[]} teamLabels
 */
export function teamOf(pr, teamLabels) {
  const fromLabels = pr.labels.filter((l) => teamLabels.includes(l));
  if (fromLabels.length === 1) return fromLabels[0];
  const trimmed = pr.title.trim();
  const title = /^[a-z]+\(([^)]+)\)!?:/.exec(trimmed)?.[1] ?? /^\[([^\]]+)\]/.exec(trimmed)?.[1];
  if (title && teamLabels.includes(title)) return title;
  const branch = pr.head.split("/")[0];
  if (teamLabels.includes(branch)) return branch;
  const feature = /^feature\/(team-[1-4])$/.exec(pr.head)?.[1];
  if (feature && teamLabels.includes(feature)) return feature;
  return null;
}

/**
 * PR titles follow Conventional Commits ("feat(team-2): add login page") since #86 merged. PRs opened
 * before then got their title under the rule of their time, "[team-2] Add login page", and are judged by it.
 */
export const TITLE_RULE_CHANGED_AT = "2026-11-06T14:29:27Z";

/** @param {{ createdAt?: string | null }} pr */
export const allowsLegacyTitle = (pr) =>
  Boolean(pr.createdAt) && Date.parse(pr.createdAt) < Date.parse(TITLE_RULE_CHANGED_AT);

/**
 * Audits one pull request.
 * @param {{
 *   pr: { number: number, title: string, body: string | null, head: string, base: string, labels: string[], state: string, author: string, url?: string, createdAt?: string | null },
 *   commits: { oid?: string, message: string }[],
 *   commitsTruncated?: boolean,
 *   issue: { number: number, labels: string[] } | null,
 *   config: { teamLabels: string[] },
 *   templates: Record<string, string>,
 * }} input `issue` is the linked issue as GitHub returned it (null if the PR links none or it does not exist)
 */
export function auditPr({ pr, commits, commitsTruncated = false, issue, config, templates }) {
  const template = checkPr({
    title: pr.title,
    body: pr.body,
    head: pr.head,
    base: pr.base,
    labels: pr.labels,
    config,
    templates,
    allowLegacyTitle: allowsLegacyTitle(pr),
  });
  /** @type {{ rule: string, message: string }[]} */
  const problems = [...template.problems];
  /** @type {string[]} */
  const warnings = [...template.warnings];
  const add = (rule, message) => problems.push({ rule, message });

  // A work branch carries the commits of one issue. Integration PRs (feature/team-N into main) and
  // sync/release PRs (from main) carry many issues' commits, so only work PRs are checked here.
  const isWorkPr = pr.head !== "main" && !/^feature\/team-[1-4]$/.test(pr.head);
  const number = linkedIssue(pr.body, { allowRefs: !isWorkPr });

  if (isWorkPr && number !== null) {
    const prTeam = pr.labels.filter((l) => config.teamLabels.includes(l));
    if (!issue) {
      add("issue", `The linked issue #${number} does not exist.`);
    } else {
      const issueTeam = issue.labels.filter((l) => config.teamLabels.includes(l));
      if (issueTeam.length !== 1) {
        add(
          "issue-label",
          `The linked issue #${number} needs exactly one team label; it has ${issueTeam.length}${issueTeam.length ? ` (${issueTeam.join(", ")})` : ""}.`,
        );
      } else if (prTeam.length === 1 && prTeam[0] !== issueTeam[0]) {
        add(
          "issue-label",
          `The PR is labelled ${prTeam[0]} but the linked issue #${number} is labelled ${issueTeam[0]}.`,
        );
      }
    }

    const ref = new RegExp(`^\\s*(?:Refs|Closes|Fixes|Resolves)\\s+#${number}\\b`, "im");
    const checked = commits.filter((c) => !EXEMPT_COMMIT.test(c.message));
    const missing = checked.filter((c) => !ref.test(c.message));
    if (missing.length > 0) {
      const examples = missing
        .slice(0, 3)
        .map((c) => `"${c.message.split("\n")[0].slice(0, 60)}"`)
        .join(", ");
      add(
        "commit-refs",
        `${missing.length} of ${checked.length} commit(s) do not reference the issue with "Refs #${number}": ${examples}${missing.length > 3 ? ", ..." : ""}.`,
      );
    }
    if (commitsTruncated)
      warnings.push("The PR has more commits than were read; only the first ones were checked.");
  }

  return {
    number: pr.number,
    title: pr.title,
    url: pr.url ?? null,
    state: pr.state,
    author: pr.author,
    head: pr.head,
    base: pr.base,
    team: teamOf(pr, config.teamLabels),
    type: template.type,
    linkedIssue: number,
    ok: problems.length === 0,
    problems,
    warnings,
  };
}

/**
 * Groups audit results per team, in the order of `teamLabels`, with PRs that belong to no team last.
 * @param {ReturnType<typeof auditPr>[]} results
 * @param {string[]} teamLabels
 */
export function groupByTeam(results, teamLabels) {
  const order = [...teamLabels, null];
  return order
    .map((team) => {
      const prs = results.filter((r) => r.team === team).sort((a, b) => b.number - a.number);
      const failing = prs.filter((r) => !r.ok);
      const passing = prs.filter((r) => r.ok);
      return {
        team,
        total: prs.length,
        passCount: passing.length,
        failCount: failing.length,
        failing,
        passing,
      };
    })
    .filter((g) => g.total > 0);
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Renders the report as Markdown, ready to paste into an issue or hand to an AI evaluator.
 * @param {ReturnType<typeof groupByTeam>} groups
 * @param {{ repo: string, state: string, generatedAt: string, failingOnly?: boolean }} meta
 */
export function formatReport(groups, meta) {
  const total = groups.reduce((n, g) => n + g.total, 0);
  const failing = groups.reduce((n, g) => n + g.failCount, 0);
  const lines = [
    "# Pull request documentation report",
    "",
    `Repository \`${meta.repo}\`, ${meta.state} pull requests, generated ${meta.generatedAt}.`,
    `${total - failing} of ${plural(total, "pull request")} pass. The rules are the ones in CLAUDE.md and the PR templates (see course/README.md).`,
    "",
    "| Team | PRs | Pass | Fail |",
    "|------|----:|-----:|-----:|",
    ...groups.map((g) => `| ${g.team ?? "(no team)"} | ${g.total} | ${g.passCount} | ${g.failCount} |`),
  ];
  for (const g of groups) {
    lines.push("", `## ${g.team ?? "(no team)"}`, "");
    if (g.failing.length === 0) {
      lines.push(g.total === 1 ? "The pull request passes." : `All ${g.total} pull requests pass.`);
      continue;
    }
    for (const r of g.failing) {
      const link = r.url ? `[#${r.number}](${r.url})` : `#${r.number}`;
      lines.push(`- ${link} ${r.title} (${r.state.toLowerCase()}, ${r.author})`);
      for (const p of r.problems) lines.push(`  - **${p.rule}:** ${p.message}`);
      for (const w of r.warnings) lines.push(`  - *warning:* ${w}`);
    }
    if (!meta.failingOnly && g.passing.length > 0)
      lines.push("", `Passing: ${g.passing.map((r) => `#${r.number}`).join(", ")}`);
  }
  return `${lines.join("\n")}\n`;
}
