# Course

Information for participants of the hackathon: how we work, how progress is tracked and how the results are evaluated.

## Meeting

During the hackathon we use this Google Meet room:

**https://meet.google.com/qca-ueup-nmr**

## Ground rules

- **Everything in English:** code, comments, commit messages, issues, pull requests and documentation.
- **AI first:** use AI agents for as much of the work as possible.
- **Your own folder:** each team works only in its own folder under `games/` (`games/team-1/`, `games/team-2/`, ...).

## Teams

Every issue and pull request carries exactly one team label:

| Label               | Who               | Folder          |
|---------------------|-------------------|-----------------|
| `team-1` … `team-4` | the game teams    | `games/team-N/` |
| `platform`          | the platform team | `server/`       |
| `team-instructor`   | the instructors   | `course/`       |

## Project boards

Every team has its own GitHub Project with the issues and pull requests that carry its label. Issues and PRs are added to the boards by their team label, so label your work correctly.

| Board | Contents |
|---|---|
| [team-1](https://github.com/users/ferenc-munde/projects/3) | issues and PRs labeled `team-1` |
| [team-2](https://github.com/users/ferenc-munde/projects/4) | issues and PRs labeled `team-2` |
| [team-3](https://github.com/users/ferenc-munde/projects/5) | issues and PRs labeled `team-3` |
| [team-4](https://github.com/users/ferenc-munde/projects/6) | issues and PRs labeled `team-4` |
| [platform](https://github.com/users/ferenc-munde/projects/7) | issues and PRs labeled `platform` |
| [All teams](https://github.com/users/ferenc-munde/projects/8) | every issue and PR; filter by team with `label:team-2` etc. |

## Tracking progress

We track progress with GitHub issues and pull requests.

1. **Issue first, then work.** Before you start a piece of work, open an issue:
   - Title starts with your team label: `[team-2] Short description`, `[team-instructor] ...`
   - Describe the **goal** and the **done when** criteria (a short checklist).
   - Add your team label and assign the issue to whoever works on it.
2. **Every pull request closes an issue.** Put `Closes #<issue number>` in the PR description, so the issue is closed automatically when the PR is merged.
   - Every PR follows the template for its type (feature, bug, docs, chore, refactor, release or sync) in [`.github/PULL_REQUEST_TEMPLATE/`](../.github/PULL_REQUEST_TEMPLATE/). Don't pick it yourself: `pnpm workflow:classify --kind pr` chooses the template, team label and base branch, the `fill-pr` agent skill fills it in, and `pnpm check:pr` (also run by CI) validates it.
   - Fill in every section, in order, and tick the checklist. Write `None` if a section does not apply. Don't delete or rename the headings: the checks and the evaluation read them.
   - Details: [Templates, classification and checks](../CLAUDE.md#templates-classification-and-checks) in `CLAUDE.md`.
   - The full workflow (branch names, labels, reviews) is in [AGENTS.md](../AGENTS.md).

## Evaluation

At the end of the hackathon the results are evaluated with the help of AI, based on each team's issues, pull requests and commits. The main criteria:

- **Delivery:** how much of what you planned got done (closed issues with merged PRs).
- **Result:** the state of the game: does it run, how complete it is.
- **Process:** clean workflow: clear issues, small PRs, meaningful descriptions.
- **Collaboration:** contributions spread across the team members.

Only work that is visible in this repository counts, so keep your issues and PRs up to date.

### Checking PR documentation

The evaluation reads the pull requests, so they have to be documented well enough. One command lists, per team, which PRs are not, and why:

```bash
node course/tooling/pr-report.mjs                     # every PR: open, merged and closed
node course/tooling/pr-report.mjs --state open        # only open PRs, to fix gaps during the hackathon
node course/tooling/pr-report.mjs --team team-2       # only one team
node course/tooling/pr-report.mjs --failing           # leave out the passing PRs
node course/tooling/pr-report.mjs --json              # machine-readable, e.g. as input for an AI evaluator
```

It needs the [GitHub CLI](https://cli.github.com/), logged in with `gh auth login`. The output is Markdown: a pass/fail table per team, then every failing PR with its problems. Paste it into an issue or a chat, or save it with `node course/tooling/pr-report.mjs > pr-report.md`.

A PR passes when all of this is true (the rules from [CLAUDE.md](../CLAUDE.md) and the PR templates):

- The title is in the commit format with the team label as its scope, for example `feat(team-2): add login page`, and the PR has exactly one team label, the same one.
- The branch is named `<team-label>/<issue-number>-<short-description>` and targets the right base branch.
- The description follows its template in `.github/PULL_REQUEST_TEMPLATE/`: every heading is present, in order and filled in, `## Linked issue` has `Closes #N`, `## Team` names the team, and every checklist item is ticked. This part is the same check as `pnpm check:pr --number <N>`.
- The linked issue exists and has the same team label as the PR.
- Every commit references the linked issue on its own line (`Refs #N`). Merge commits are skipped.

Sync and release PRs (from `main`) and integration PRs (`feature/team-N` into `main`) carry several issues, so for them only the template rules are checked.

**During the hackathon:** run `node course/tooling/pr-report.mjs --state open --failing` now and then, and fix what it lists (edit the PR description, add the label, retarget the base branch). Commits that are already pushed don't have to be rewritten; reference the issue in the next ones.

**For the evaluation:** run `node course/tooling/pr-report.mjs` once at the end and hand the report (or the `--json` output) to the evaluator together with the issues, PRs and commits. PRs merged before a rule existed (for example, titles like `[team-2] Add login` from before the commit format, or a checklist from before it grew to ten items) fail that rule; take that into account when weighting the result. The report still attributes such PRs to their team through the old `[team-N]` prefix.

### Student activity report

For the instructors, one command scores every student from 1 (weak) to 5 (strong), with the key numbers and a justification:

```bash
node course/tooling/student-report.mjs > .private/student-scores.md
node course/tooling/student-report.mjs --json > .private/student-scores.json   # e.g. as input for an AI evaluator
```

**The output contains individual scores and this repository is public: never commit it.** Keep it in `.private/`, which git ignores. Like the PR report, it needs the GitHub CLI, logged in.

The score uses the criteria above that can be measured per person, from 0 to 10 points. *Result* (does the game run) is a team criterion and is not part of it.

| Area | Points | Rule |
|---|---|---|
| **Delivery** | 0–4 | Merged PRs authored: 5 or more → 4, 2–4 → 3, 1 → 2. No merged PR but an open one → 1. |
| **Process** | 0–3 | +1 if at least half of your PRs pass the PR documentation report; +1 if at least 80% of your commits reference an issue (`Refs #N` on its own line); +1 if every issue you opened has a team label and a matching `[team-…]` title. |
| **Collaboration** | 0–3 | Reviewed other people's PRs: 5 or more → 2, 1–4 → 1. +1 for commenting on other people's issues or PRs. |

Points become the score: 0 → **1**, 1–2 → **2**, 3–4 → **3**, 5–7 → **4**, 8–10 → **5**. Instructors, organizer accounts and AI agents are not scored.

Keep in mind when you use it:

- Only work visible on GitHub counts. Pair programming, work on a teammate's machine or unpushed work doesn't show up.
- Commits co-authored by an AI agent (the course is AI first) count for the PR author. A commit that appears in several PRs (work branch → `feature/team-N` → `main`) is counted once.
- Lines of code are shown for context and are not scored.
- Rules that changed during the hackathon (for example the PR title format) make older PRs fail the documentation report through no fault of the author. Take that into account, as for the PR report.
- Admin work, for example by the repository owner, doesn't show up in issues, PRs or reviews.
