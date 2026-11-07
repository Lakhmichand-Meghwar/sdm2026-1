// `pnpm team:promote <N>`: opens the PR feature/team-N -> main, filled from the chore template, with
// the PRs merged into the feature branch since main last had it. It only opens the PR; merging needs
// green CI and a review like any other PR.
//
//   pnpm team:promote 2 --issue 40      open feature/team-2 -> main, closing issue #40 (labelled team-2)
//   <N>                                 team 1 to 4; defaults to --team, then git config sdm.team
//   --team team-N                       the team, if <N> is not given
//   --issue <n>                         the issue the PR closes (required)
//   --dry-run                           check everything and print the PR, but don't open it
//   --json                              machine-readable output
//
// Exit codes: 0 opened (or would open), 1 refused (nothing to promote, PR already open, issue wrong),
// 2 usage error, 3 environment problem (git, gh).
import { parseArgs } from "./lib/args.mjs";
import { bodyProblems, issueProblems, parseMergedPrs, promotePr, resolveTeam } from "./lib/branch-prs.mjs";
import { issueFlag, progress, report, usageError } from "./lib/command.mjs";
import { root } from "./lib/context.mjs";
import {
  countCommits,
  createPr,
  fetchOrigin,
  issue as getIssue,
  gitConfig,
  mergeLog,
  openPrs,
  predictConflicts,
  remoteBranchExists,
} from "./lib/remote.mjs";
import { result } from "./lib/report.mjs";
import { loadPrTemplates, loadTypes } from "./lib/types.mjs";

const USAGE = "pnpm team:promote <N> --issue <n> [--team team-N] [--dry-run] [--json]";
const { flags, positional } = parseArgs(process.argv.slice(2), { boolean: ["json", "dry-run"] });
const json = flags.json === true;
const dryRun = flags["dry-run"] === true;
if (positional.length > 1) usageError(`unexpected argument "${positional[1]}".`, USAGE);

const who = resolveTeam({
  positional: positional[0] ?? null,
  flag: typeof flags.team === "string" ? flags.team : null,
  configured: gitConfig("sdm.team"),
});
if (who.error) usageError(who.error, USAGE);
const team = who.team;
const number = issueFlag(flags, USAGE);
const branch = `feature/${team}`;

const fail = (summary, problems, warnings = []) =>
  process.exit(report("promote", result(summary, problems, warnings), { json }));

if (!remoteBranchExists(branch)) {
  fail(`${branch} was not promoted`, [{ rule: "branch", message: `origin has no ${branch} branch.` }]);
}
progress(`Fetching main and ${branch}...`);
fetchOrigin(["main", branch]);
const ahead = countCommits(`origin/main..origin/${branch}`);
if (ahead === 0) {
  fail(`${branch} was not promoted`, [
    { rule: "nothing", message: `main already has everything on ${branch}.` },
  ]);
}
const existing = openPrs(branch, "main");
if (existing.length > 0) {
  fail(`${branch} was not promoted`, [
    { rule: "already-open", message: `A PR from ${branch} into main is already open: ${existing[0].url}` },
  ]);
}
const linked = getIssue(number);
const issueProblemsFound = issueProblems(linked, { number, label: team, open: true });
if (issueProblemsFound.length > 0) fail(`${branch} was not promoted`, issueProblemsFound);

const warnings = [];
const behind = countCommits(`origin/${branch}..origin/main`);
if (behind > 0)
  warnings.push(
    `${branch} is ${behind} commit(s) behind main. Bring it up to date first: pnpm branches:sync ${team.slice(5)}.`,
  );
const predicted = predictConflicts("origin/main", `origin/${branch}`);
if (predicted === null) warnings.push("This git can't predict conflicts (needs git 2.38 or later).");

const config = loadTypes(root);
const templates = loadPrTemplates(root, config);
const draft = promotePr({
  templates,
  issue: /** @type {NonNullable<typeof linked>} */ (linked),
  team,
  ahead,
  behind,
  prs: parseMergedPrs(mergeLog(`origin/main..origin/${branch}`)),
  conflicts: predicted ?? [],
});
const drift = bodyProblems(draft, { config, templates });
if (drift.length > 0)
  fail("the drafted PR doesn't pass check:pr (has the template changed?)", drift, warnings);

if (dryRun) {
  const res = {
    ...result(`would open ${branch} -> main: ${draft.title}`, [], warnings),
    dryRun: true,
    pr: draft,
  };
  process.exit(report("promote", res, { json, drafts: [draft] }));
}
const url = createPr(draft);
const res = { ...result(`opened ${url}`, [], warnings), url, pr: draft };
res.warnings.push(
  "Tick the remaining checklist items once you have checked them; pnpm check:pr fails until then.",
);
process.exit(report("promote", res, { json }));
