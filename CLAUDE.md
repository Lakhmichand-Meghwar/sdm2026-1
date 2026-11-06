# Repository rules

> This file is the single source of truth for how everyone (humans and AI agents) works in this repository. `AGENTS.md` only points here. Change the rules here, through a reviewed PR.

These rules apply to every agent (and every human) working in this repository. They are not optional: if a change does not follow this workflow, it does not get merged.

## Repository layout

| Folder          | Owner       | Label             |
|-----------------|-------------|-------------------|
| `games/team-1/` | Team 1      | `team-1`          |
| `games/team-2/` | Team 2      | `team-2`          |
| `games/team-3/` | Team 3      | `team-3`          |
| `games/team-4/` | Team 4      | `team-4`          |
| `course/`       | Instructors | `team-instructor` |
| `server/`       | Platform    | `platform`        |

Work inside your own team's folder. Changes to another team's folder or to the shared folders need an issue that says why, and a review from someone on the owning team.

## Tech stack

Everyone uses the same stack. Don't introduce alternatives without an issue that explains why.

- **Frontend:** **Vite + TypeScript**, one app per team in `games/team-N/` (start from `server/template/`).
- **Multiplayer:** Colyseus 0.18 on the server, `@colyseus/sdk` in the clients. Colyseus 0.18 changed many APIs, so read [server/CLAUDE.md](server/CLAUDE.md) before writing Colyseus code.
- **Hosting:** Railway.
- **Language:** TypeScript everywhere. The commands for install, lint, typecheck and tests are in [server/CLAUDE.md](server/CLAUDE.md).

## Branches

| Branch | Purpose | Deploys to | Receives pull requests from |
|--------|---------|------------|-----------------------------|
| `prod` | Release: what is live | Railway production | `main` |
| `main` | The cutting edge: finished work from all teams | Railway dev | `feature/team-N`, `platform/*` branches |
| `feature/team-N` | Team N's integration branch | not deployed | Team N's work branches (`team-N/<issue>-…`) |

```
team-N/<issue>-<description>  →  feature/team-N  →  main  →  prod
        (work branch)           (team review)     (CI green)  (release)
```

1. **Work branch → `feature/team-N`.** One pull request per issue, reviewed by a teammate. Everything your team is building lands here first, so one team's unfinished work never breaks another team.
2. **`feature/team-N` → `main`.** Only when CI is green for the feature branch. The CI/CD checks are owned by P1 and described in [server/ARCHITECTURE.md](server/ARCHITECTURE.md) as they are added.
3. **`main` → `prod`.** A release pull request, opened when `main` works and is ready to go live.
4. **Stay current.** After your feature branch has been merged into `main`, merge `main` back into `feature/team-N` before starting the next piece of work.

Platform work (`server/`, CI, Railway) and instructor work (`course/`, workflow files) don't belong to a game team, so their branches (`platform/<issue>-…`, `team-instructor/<issue>-…`) open pull requests straight into `main`.

Branch protection isn't set up yet, so these rules are followed by convention. Follow them as if they were enforced.

## Workflow

Every change goes through the same path: **issue → branch → commits → pull request → review → merge.** No shortcuts.

### 1. Issue first

- Open an issue before writing any code. No issue, no branch, no PR.
- The issue must carry exactly one team label: `team-1`, `team-2`, `team-3`, `team-4`, `platform` or `team-instructor`. The label says which team owns the work.
- The title starts with the team name: `[team-2] Add login page`.
- Describe what is changing and why, and what "done" looks like.

### 2. Branch

- Never commit directly to `main`, `prod` or a `feature/team-N` branch. They only change through merged pull requests.
- Branch from an up-to-date `feature/team-N` (platform and instructor work: from `main`).
- Name the branch after the team label and the issue: `<team-label>/<issue-number>-<short-description>`
  - Examples: `team-2/14-add-login-page`, `platform/8-ci-checks`, `team-instructor/20-add-team-instructor-rules`

### 3. Commits

- Keep each commit to one logical change.
- Write the message in the imperative mood ("Add login page", not "Added login page").
- Reference the issue in the commit body, e.g. `Refs #14`.
- Do not commit secrets, credentials, build output or large binaries.

### 4. Pull request

- One pull request per issue.
- Fill in every section of the [pull request template](.github/pull_request_template.md). Don't delete or rename its headings.
- The PR must carry the same team label as its issue.
- The title starts with the team name: `[team-2] Add login page`.
- The description links the issue with a closing keyword (`Closes #14`) and summarizes what changed and how it was tested.
- Set the base branch as described in [Branches](#branches): `feature/team-N` for a work branch, `main` for a feature branch (and for platform and instructor work), `prod` for a release.
- Keep the PR focused. Unrelated changes go in their own issue and PR.

### 5. Review and merge

- At least one approving review is required before merging. Nobody approves their own PR.
- All checks must pass.
- Resolve every review comment before merging.
- Rebase on or merge in the base branch if your branch is behind, then merge.
- Delete the branch after it is merged.

## Never

- Push directly to `main`, `prod` or a `feature/team-N` branch.
- Force-push to any of those branches or to someone else's branch.
- Open a pull request from a team work branch straight into `main` or `prod`.
- Merge a PR without a team label, a linked issue or an approving review.
- Rewrite history that others have already pulled.
