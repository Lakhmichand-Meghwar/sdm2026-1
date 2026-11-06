// The release gate: decides whether a pull request into `prod` may go live. It exists so that nothing
// on `main` reaches production by itself: a release is a deliberate PR that passes these checks, is
// approved by someone else and, once the rulesets in .github/rulesets/ are imported, cannot be merged
// without this check being green.
//
//   node server/tooling/check-release.mjs --event "$GITHUB_EVENT_PATH" --checks check-runs.json
//
//   --event <file>    the pull_request event payload
//   --checks <file>   the GitHub API response for the head commit's check runs
//                     (gh api repos/<owner>/<repo>/commits/<sha>/check-runs?per_page=100)
//   --json            machine-readable output
//
// Exit codes: 0 the release may go ahead, 1 it is blocked, 2 usage error.
// Plain JavaScript with no dependencies, like check-setup.mjs.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The CI jobs (see .github/workflows/ci.yml) that must have passed on the commit being released. */
export const REQUIRED_CHECKS = ["checks (ubuntu-latest)", "checks (windows-latest)", "checks (macos-latest)"];

/** @param {string} md */
function rollbackSection(md) {
  const text = md.replace(/<!--[\s\S]*?-->/g, "");
  const m = /^##\s+Rollback\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(text);
  if (!m) return null;
  return m[1].replace(/^\s*(?:[-*]|\d+\.)\s*$/gm, "").trim();
}

/**
 * @param {{
 *   pr: { baseRef: string, headRef: string, headRepo: string, baseRepo: string, draft: boolean, headSha: string, body: string | null },
 *   checkRuns: { name: string, status: string, conclusion: string | null, id?: number }[],
 *   requiredChecks?: string[],
 * }} input
 * @returns {{ ok: boolean, problems: { rule: string, message: string }[] }}
 */
export function checkRelease({ pr, checkRuns, requiredChecks = REQUIRED_CHECKS }) {
  /** @type {{ rule: string, message: string }[]} */
  const problems = [];
  const add = (rule, message) => problems.push({ rule, message });

  if (pr.baseRef !== "prod") add("base", `A release goes into prod, not ${pr.baseRef}.`);
  if (pr.headRef !== "main") {
    add(
      "head",
      `Only main can be released to prod; this PR comes from ${pr.headRef}. Merge your work into main first.`,
    );
  }
  if (pr.headRepo !== pr.baseRepo)
    add("fork", `The release must come from this repository, not ${pr.headRepo}.`);
  if (pr.draft) add("draft", "A draft cannot be released. Mark it ready for review.");

  // CI must have passed on the exact commit that would go live. The newest run of each job counts.
  const sha = pr.headSha.slice(0, 7);
  for (const name of requiredChecks) {
    const runs = checkRuns.filter((r) => r.name === name).sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
    if (runs.length === 0) {
      add("ci", `"${name}" has not run on ${sha}. CI must pass on the commit being released.`);
    } else if (runs[0].status !== "completed") {
      add("ci", `"${name}" is still ${runs[0].status} on ${sha}. Wait for it to finish.`);
    } else if (runs[0].conclusion !== "success") {
      add("ci", `"${name}" ${runs[0].conclusion} on ${sha}. Fix main before releasing.`);
    }
  }

  // The way back must be written down before going forward.
  const rollback = rollbackSection(pr.body ?? "");
  if (rollback === null) add("rollback", 'The PR needs a "## Rollback" section.');
  else if (rollback === "")
    add("rollback", 'The "## Rollback" section is empty: name the commit or release to go back to.');

  return { ok: problems.length === 0, problems };
}

/** Reads the pieces the gate needs from a pull_request event payload. @param {any} event */
export function prFromEvent(event) {
  const p = event.pull_request;
  return {
    baseRef: p.base.ref,
    headRef: p.head.ref,
    headRepo: p.head.repo?.full_name ?? "(deleted fork)",
    baseRepo: p.base.repo.full_name,
    draft: p.draft === true,
    headSha: p.head.sha,
    body: p.body ?? null,
  };
}

function main() {
  const args = process.argv.slice(2);
  const get = (name) => {
    const i = args.indexOf(`--${name}`);
    return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
  };
  const eventFile = get("event");
  const checksFile = get("checks");
  if (!eventFile || !checksFile || !existsSync(eventFile) || !existsSync(checksFile)) {
    console.error(
      "usage: node server/tooling/check-release.mjs --event <event.json> --checks <check-runs.json> [--json]",
    );
    process.exit(2);
  }
  const event = JSON.parse(readFileSync(eventFile, "utf8"));
  if (!event.pull_request) {
    console.error("error: the event file has no pull_request. Run this on a pull_request event.");
    process.exit(2);
  }
  const checkRuns = JSON.parse(readFileSync(checksFile, "utf8")).check_runs ?? [];
  const result = checkRelease({ pr: prFromEvent(event), checkRuns });

  if (args.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    console.log("release gate: open. CI passed on the commit being released and a rollback is written down.");
  } else {
    console.error("release gate: BLOCKED. This PR cannot go to production yet:");
    for (const p of result.problems) console.error(`  - [${p.rule}] ${p.message}`);
  }
  process.exit(result.ok ? 0 : 1);
}

// Run as a script, but stay importable for tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
