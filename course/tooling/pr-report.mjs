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
// Exit codes: 0 report written, 2 usage error, 3 environment problem (gh missing or not logged in).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EXIT, parseArgs } from "../../server/tooling/workflow/lib/args.mjs";
import { loadTypes } from "../../server/tooling/workflow/lib/types.mjs";
import { auditPr, formatReport, groupByTeam, linkedIssue } from "./lib/pr-report.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const { flags } = parseArgs(process.argv.slice(2), { boolean: ["json", "failing"] });
const str = (name) => (typeof flags[name] === "string" ? flags[name] : null);

const STATES = { open: ["OPEN"], merged: ["MERGED"], closed: ["CLOSED"], all: ["OPEN", "MERGED", "CLOSED"] };
const state = str("state") ?? "all";
const config = loadTypes(root);
const team = str("team");
if (!STATES[state] || (team && !config.teamLabels.includes(team))) {
  console.error(
    `usage: node course/tooling/pr-report.mjs [--state ${Object.keys(STATES).join("|")}] [--team ${config.teamLabels.join("|")}] [--failing] [--json] [--repo owner/name]`,
  );
  process.exit(EXIT.usage);
}

/** Runs a GraphQL query with the GitHub CLI. */
function graphql(query, variables) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [k, v] of Object.entries(variables)) if (v !== null) args.push("-F", `${k}=${v}`);
  try {
    return JSON.parse(execFileSync("gh", args, { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 })).data;
  } catch (err) {
    console.error(
      `error: could not read from GitHub with the GitHub CLI (installed and logged in with "gh auth login"?): ${err.stderr?.toString().trim() || err.message}`,
    );
    process.exit(EXIT.environment);
  }
}

/** Reads every page of a connection. */
function paginate(query, variables, pick) {
  const nodes = [];
  let cursor = null;
  do {
    const conn = pick(graphql(query, { ...variables, cursor }));
    nodes.push(...conn.nodes);
    cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (cursor);
  return nodes;
}

let repo = str("repo");
if (!repo) {
  try {
    repo = execFileSync("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  } catch (err) {
    console.error(`error: could not find the repository (pass --repo owner/name): ${err.message}`);
    process.exit(EXIT.environment);
  }
}
const [owner, name] = repo.split("/");

const COMMITS = 100;
const prs = paginate(
  `query($owner: String!, $name: String!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      pullRequests(first: 50, after: $cursor, states: [${STATES[state].join(", ")}], orderBy: { field: CREATED_AT, direction: DESC }) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number title body url state headRefName baseRefName
          author { login }
          labels(first: 20) { nodes { name } }
          commits(first: ${COMMITS}) { totalCount nodes { commit { oid message } } }
        }
      }
    }
  }`,
  { owner, name },
  (d) => d.repository.pullRequests,
);

const issues = new Map(
  paginate(
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

let results = prs.map((p) => {
  const pr = {
    number: p.number,
    title: p.title,
    body: p.body,
    url: p.url,
    state: p.state,
    author: p.author?.login ?? "ghost",
    head: p.headRefName,
    base: p.baseRefName,
    labels: p.labels.nodes.map((l) => l.name),
  };
  const number = linkedIssue(pr.body, { allowRefs: pr.head === "main" });
  return auditPr({
    pr,
    commits: p.commits.nodes.map((c) => ({ oid: c.commit.oid, message: c.commit.message })),
    commitsTruncated: p.commits.totalCount > COMMITS,
    issue: number === null ? null : (issues.get(number) ?? null),
    config,
    templates,
  });
});
if (team) results = results.filter((r) => r.team === team);

const failingOnly = flags.failing === true;
const groups = groupByTeam(results, config.teamLabels)
  .map((g) => (failingOnly ? { ...g, passing: [] } : g))
  .filter((g) => !failingOnly || g.failCount > 0);

if (flags.json === true) {
  console.log(JSON.stringify({ repo, state, generatedAt: new Date().toISOString(), teams: groups }, null, 2));
} else {
  const generatedAt = `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;
  process.stdout.write(formatReport(groups, { repo, state, generatedAt, failingOnly }));
}
process.exit(EXIT.ok);
