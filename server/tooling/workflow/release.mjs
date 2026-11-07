// `pnpm release`: opens the release PR main -> prod, filled from the release template: the PRs merged
// since the last release and a Rollback section naming the commit prod is on now. It first waits until
// CI has finished green on main's head commit, because the release gate fails while CI is running.
//
// It only opens the PR. It never merges into prod: no script may (see "Deploying to Railway" in
// CLAUDE.md). No version numbers or tags.
//
//   pnpm release --issue 122            wait for CI on main, then open the release PR
//   --issue <n>                         the issue the PR refers to (Refs #n, labelled platform; required)
//   --timeout <s>                       how long to wait for CI (default 1800)
//   --interval <s>                      how often to look (default 20)
//   --dry-run                           read CI once instead of waiting, and print the PR without opening it
//   --json                              machine-readable output
//
// Exit codes: 0 opened (or would open), 1 refused (release PR already open, nothing to release, CI red
// or still running at the timeout, issue wrong), 2 usage error, 3 environment problem (git, gh).
import { REQUIRED_CHECKS } from "../check-release.mjs";
import { parseArgs } from "./lib/args.mjs";
import { bodyProblems, ciStatus, issueProblems, parseMergedPrs, releasePr } from "./lib/branch-prs.mjs";
import { issueFlag, progress, report, secondsFlag, usageError } from "./lib/command.mjs";
import { root } from "./lib/context.mjs";
import {
  checkRuns,
  countCommits,
  createPr,
  fetchOrigin,
  issue as getIssue,
  gitOrExit,
  mergeLog,
  openPrs,
  repoName,
  revParse,
} from "./lib/remote.mjs";
import { result } from "./lib/report.mjs";
import { loadPrTemplates, loadTypes } from "./lib/types.mjs";
import { poll } from "./lib/wait.mjs";

const USAGE = "pnpm release --issue <n> [--timeout <s>] [--interval <s>] [--dry-run] [--json]";
const { flags, positional } = parseArgs(process.argv.slice(2), { boolean: ["json", "dry-run"] });
const json = flags.json === true;
const dryRun = flags["dry-run"] === true;
if (positional.length > 0) usageError(`unexpected argument "${positional[0]}".`, USAGE);
const number = issueFlag(flags, USAGE);
const timeoutMs = secondsFlag(flags, "timeout", 1800, USAGE);
const intervalMs = secondsFlag(flags, "interval", 20, USAGE);

const fail = (problems, warnings = []) =>
  process.exit(report("release", result("no release PR was opened", problems, warnings), { json }));
const alreadyOpen = () => {
  const open = openPrs("main", "prod");
  if (open.length > 0) {
    fail([
      {
        rule: "already-open",
        message: `A release PR is already open: ${open[0].url}`,
        fix: "Finish or close it first.",
      },
    ]);
  }
};

alreadyOpen();
const linked = getIssue(number);
const issueFound = issueProblems(linked, { number, label: "platform" });
if (issueFound.length > 0) fail(issueFound);
const issue = /** @type {NonNullable<typeof linked>} */ (linked);

progress("Fetching main and prod...");
fetchOrigin(["main", "prod"]);
if (countCommits("origin/prod..origin/main") === 0) {
  fail([{ rule: "nothing", message: "prod already has everything on main: there is nothing to release." }]);
}

// Wait for CI on main's head. main can move while we wait, so every look re-reads its head.
const repo = repoName();
const look = async () => {
  fetchOrigin(["main"]);
  const sha = revParse("origin/main");
  return { sha, ...ciStatus(checkRuns(repo, sha)) };
};
const warnings = [];
let ci;
if (dryRun) {
  ci = await look();
  if (ci.state === "pending") {
    warnings.push(
      `CI is still running on ${ci.sha.slice(0, 7)} (${ci.pending.join(", ")}); pnpm release would wait for it.`,
    );
  }
} else {
  const waited = await poll({
    attempt: look,
    done: (s) => s.state === "green",
    stop: (s) => s.state === "red",
    timeoutMs,
    intervalMs,
    onWait: (s, elapsed) =>
      progress(
        `Waiting for CI on ${s.sha.slice(0, 7)} (${Math.round(elapsed / 1000)}s): ${s.pending.join(", ")}`,
      ),
  });
  ci = waited.last;
  if (ci.state === "pending") {
    fail([
      {
        rule: "ci",
        message: `CI was still running on ${ci.sha.slice(0, 7)} after ${timeoutMs / 1000}s: ${ci.pending.join(", ")}.`,
        fix: "Run pnpm release again later, or pass a longer --timeout.",
      },
    ]);
  }
}
if (ci.state === "red") {
  fail([
    {
      rule: "ci",
      message: `CI failed on main (${ci.sha.slice(0, 7)}): ${ci.failing.join(", ")}.`,
      fix: "Fix main before releasing.",
    },
  ]);
}

// Someone may have opened one while we waited.
if (!dryRun) alreadyOpen();

const prodSha = revParse("origin/prod");
const config = loadTypes(root);
const templates = loadPrTemplates(root, config);
const draft = releasePr({
  templates,
  issue,
  mainSha: ci.sha,
  prodSha,
  prodSubject: gitOrExit(["log", "-1", "--format=%s", prodSha]).trim(),
  commits: countCommits(`origin/prod..${ci.sha}`),
  prs: parseMergedPrs(mergeLog(`origin/prod..${ci.sha}`)),
  checks: REQUIRED_CHECKS,
});
const drift = bodyProblems(draft, { config, templates });
if (drift.length > 0) fail(drift, warnings);

if (dryRun) {
  const res = {
    ...result(`would open main -> prod at ${ci.sha.slice(0, 7)}: ${draft.title}`, [], warnings),
    dryRun: true,
    ci,
    pr: draft,
  };
  process.exit(report("release", res, { json, drafts: [draft] }));
}
const url = createPr(draft);
warnings.push(
  "Check that development runs this commit (pnpm env:status), review the rollback plan and tick the remaining checklist items. Merging into prod is a person's job.",
);
process.exit(report("release", { ...result(`opened ${url}`, [], warnings), url, ci, pr: draft }, { json }));
