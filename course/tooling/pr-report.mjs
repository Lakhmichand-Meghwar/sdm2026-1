// `node course/tooling/pr-report.mjs`: lists, per team, which pull requests are not documented well
// enough for the evaluation and why. Reads the PRs, their commits and the linked issues from GitHub with
// the GitHub CLI, then runs the rules in lib/pr-report.mjs, which reuse `pnpm check:pr`.
//
//   node course/tooling/pr-report.mjs                        every PR (open, merged and closed), as Markdown
//   node course/tooling/pr-report.mjs --state open           only open PRs (also: merged, closed, all)
//   node course/tooling/pr-report.mjs --team team-2          only one team
//   node course/tooling/pr-report.mjs --failing              leave out the passing PRs
//   node course/tooling/pr-report.mjs --json                 machine-readable output, e.g. for an AI evaluator
//   node course/tooling/pr-report.mjs --repo owner/name      another repository than the current one
//
//   node course/tooling/pr-report.mjs --fix                  dry run: shows how each failing PR would be fixed
//   node course/tooling/pr-report.mjs --fix --apply          fixes the PRs on GitHub and comments what is left
//
// --fix only does what can be done mechanically (see lib/pr-fix.mjs): the team label, the title, template
// headings, "Closes #N", "## Team", missing checklist items (unticked) and the base branch of open PRs.
// Everything else is listed in one comment per PR, which is updated, not repeated, on the next run.
//
// Exit codes: 0 done, 1 some fixes failed, 2 usage error, 3 environment problem (gh missing or not
// logged in).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EXIT, parseArgs } from "../../server/tooling/workflow/lib/args.mjs";
import { loadTypes } from "../../server/tooling/workflow/lib/types.mjs";
import { runFixes } from "./lib/fix-runner.mjs";
import { currentRepo, paginate } from "./lib/github.mjs";
import { COMMENT_MARKER, planFix } from "./lib/pr-fix.mjs";
import { auditPr, formatReport, groupByTeam, linkedIssue } from "./lib/pr-report.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const { flags } = parseArgs(process.argv.slice(2), { boolean: ["json", "failing", "fix", "apply"] });
const str = (name) => (typeof flags[name] === "string" ? flags[name] : null);

const STATES = { open: ["OPEN"], merged: ["MERGED"], closed: ["CLOSED"], all: ["OPEN", "MERGED", "CLOSED"] };
const state = str("state") ?? "all";
const config = loadTypes(root);
const team = str("team");
if (!STATES[state] || (team && !config.teamLabels.includes(team)) || (flags.apply && !flags.fix)) {
  console.error(
    `usage: node course/tooling/pr-report.mjs [--state ${Object.keys(STATES).join("|")}] [--team ${config.teamLabels.join("|")}] [--failing] [--json] [--repo owner/name] [--fix [--apply]]`,
  );
  process.exit(EXIT.usage);
}

const repo = str("repo") ?? currentRepo(root);
const [owner, name] = repo.split("/");

const COMMITS = 100;
const prs = paginate(
  root,
  `query($owner: String!, $name: String!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      pullRequests(first: 50, after: $cursor, states: [${STATES[state].join(", ")}], orderBy: { field: CREATED_AT, direction: DESC }) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number title body url state headRefName baseRefName createdAt
          author { login }
          labels(first: 20) { nodes { name } }
          commits(first: ${COMMITS}) { totalCount nodes { commit { oid message } } }
          comments(last: 50) { nodes { databaseId body viewerDidAuthor } }
        }
      }
    }
  }`,
  { owner, name },
  (d) => d.repository.pullRequests,
);

const issues = new Map(
  paginate(
    root,
    `query($owner: String!, $name: String!, $cursor: String) {
      repository(owner: $owner, name: $name) {
        issues(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { number labels(first: 20) { nodes { name } } }
        }
      }
    }`,
    { owner, name },
    (d) => d.repository.issues,
  ).map((i) => [i.number, { number: i.number, labels: i.labels.nodes.map((l) => l.name) }]),
);

const templates = Object.fromEntries(
  Object.entries(config.types)
    .filter(([, t]) => t.prTemplate)
    .map(([type, t]) => [type, readFileSync(`${root}/${t.prTemplate}`, "utf8")]),
);

const entries = prs.map((p) => {
  const pr = {
    number: p.number,
    title: p.title,
    body: p.body,
    url: p.url,
    state: p.state,
    author: p.author?.login ?? "ghost",
    head: p.headRefName,
    base: p.baseRefName,
    createdAt: p.createdAt,
    labels: p.labels.nodes.map((l) => l.name),
  };
  const commits = p.commits.nodes.map((c) => ({ oid: c.commit.oid, message: c.commit.message }));
  const number = linkedIssue(pr.body, { allowRefs: pr.head === "main" });
  const result = auditPr({
    pr,
    commits,
    commitsTruncated: p.commits.totalCount > COMMITS,
    issue: number === null ? null : (issues.get(number) ?? null),
    config,
    templates,
  });
  const ownComment = p.comments.nodes.find((c) => c.viewerDidAuthor && c.body.includes(COMMENT_MARKER));
  return { pr, commits, result, ownComment };
});
const selected = team ? entries.filter((e) => e.result.team === team) : entries;

if (flags.fix === true) {
  const items = selected
    .filter((e) => !e.result.ok || e.ownComment)
    .map((e) => ({
      plan: planFix({ pr: e.pr, commits: e.commits, issues, config, templates }),
      ownComment: e.ownComment,
    }));
  const { failed } = runFixes({ root, repo, kind: "pr", apply: flags.apply === true, items });
  process.exit(failed > 0 ? EXIT.failed : EXIT.ok);
}

const failingOnly = flags.failing === true;
const groups = groupByTeam(
  selected.map((e) => e.result),
  config.teamLabels,
)
  .map((g) => (failingOnly ? { ...g, passing: [] } : g))
  .filter((g) => !failingOnly || g.failCount > 0);

if (flags.json === true) {
  console.log(JSON.stringify({ repo, state, generatedAt: new Date().toISOString(), teams: groups }, null, 2));
} else {
  const generatedAt = `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;
  process.stdout.write(formatReport(groups, { repo, state, generatedAt, failingOnly }));
}
process.exit(EXIT.ok);
