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

Work inside your own team's folder. Changes to another team's folder or to the shared folders need an issue that says why, on a line of its own (`Cross-team: <why>`), and a review from someone on the owning team.

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

Branch protection isn't set up yet, so these rules are followed by convention. Follow them as if they were enforced. It must be on before the first deploy (see [Deploying to Railway](#deploying-to-railway)).

## Deploying to Railway

Railway is where the game is hosted. **Nothing is deployed until the go-live checklist below is complete.** After that, only the rules below can change what is running.

`main` is the development branch (there is no separate `dev` branch): everything merged into `main` is deployed to the development environment. **Nothing on `main` reaches production by itself.** Production changes only when a release PR is merged into `prod`, and the [blocks](#blocks) below make sure of it. Railway belongs to the platform team: teams don't create or change Railway services, variables or domains. Open a `platform` issue instead.

### Rules

1. **Deploy only through the pipeline.** What runs on Railway is what was merged: `main` deploys to the development environment and `prod` to production (see [Branches](#branches)). Nobody deploys from a laptop (`railway up`), from a work branch, or by editing a service in the Railway dashboard. No workflow, bot or script may push or merge into `prod`, auto-merge stays off, and Railway's production environment follows the `prod` branch, never `main`.
2. **Gate before `main`.** A change reaches `main` only when CI and the Workflow checks are green and someone other than the author approved the PR. Railway services use Wait for CI (`checkSuites` in `.railway/railway.ts`), so a commit with a red check is never deployed.
3. **Gate before `prod`.** A release PR (`main` into `prod`) goes ahead only when all of this is true:
   - CI is green on `main`.
   - The commit already ran in the development environment, and its `/health` reports that commit's SHA with `ok: true`.
   - The PR's *Rollback* section names the commit to go back to.
   - Someone other than the author approved the PR, and the `production` GitHub Environment approved the deploy.

   The `release gate` check verifies the first three automatically on every PR into `prod`.
4. **Infrastructure is code.** Services, domains, variables and replicas are defined in `.railway/railway.ts` and changed through a reviewed PR that includes the `railway config plan` output. Don't use `railway.json` or `railway.toml`: Railway deprecated them and stops reading them on 2026-12-01. Anything missing from the file is deleted on apply, so every new service must be added there.
5. **Secrets stay out of the repository.** Keys, tokens and passwords live in Railway variables (sealed, for secrets) or GitHub Actions secrets. Never commit them, paste them into an issue, PR or chat, or print them in logs. Only `.env.example` (names, no values) is committed.
6. **Environments are separate.** Development and production use different variables, databases and domains. Never point development at production data, or the reverse. `APP_ENV` says where the code runs, and `/health` returns it together with the deployed SHA.
7. **Every service has a `/health` endpoint.** It is Railway's health check. A deploy that is not healthy is not fixed by restarting it by hand: investigate, or roll back. Keep the endpoint fast and free of dependencies.
8. **Keep it small.** One replica per service. No new service, database or paid add-on without an issue that says why and who pays for it.
9. **Roll back first, then fix.** If production breaks, redeploy the last good deployment in Railway (or revert the release PR on `prod`) and tell the team. Then fix on `main` and release again. Don't debug on production.

### Blocks

These are what stop `main` from going to production on its own. Two of them ship with the repository; the rest need a repository admin, because GitHub only lets admins create rulesets and environments.

| Block | What it stops | Where | Status |
|---|---|---|---|
| Release gate | A PR into `prod` that is not from `main`, is a draft or a fork, has red or missing CI on the commit being released, or has no Rollback plan | `.github/workflows/release-gate.yml`, `server/tooling/check-release.mjs` | In the repository. It only *blocks* once the `prod` ruleset requires the `release gate` check |
| `prod` ruleset | Direct pushes, force pushes and deletion of `prod`; merging without an approving review or while a check is red; squash and rebase merges | `.github/rulesets/prod.json` | Needs an admin to import it (see the README in that folder) |
| `main` ruleset | Direct pushes and force pushes to `main`; merging without a review or with red CI | `.github/rulesets/main.json` | Needs an admin to import it |
| Auto-merge off | A release PR merging itself | Repository setting | Off today; an admin keeps it off |
| Railway source branches | Production deploying `main` | `.railway/railway.ts` | Set up with #9 |
| Wait for CI | A commit with a red check being deployed | `checkSuites` in `.railway/railway.ts` | Set up with #9 |
| `production` environment | A production deploy without a human approval | GitHub Environment | Needs an admin |

Until the rulesets are imported, nothing technical stops a push to `prod` or a merge of a red PR. Follow the rules as if it did.

### Go-live checklist

All of these are done before the first deploy. Items marked *(admin)* need the repository owner.

- [ ] CI and the Workflow checks pass on `main`.
- [ ] `release-gate.yml` is on `main`, and the `prod` and `main` rulesets from `.github/rulesets/` are imported, in that order *(admin)*.
- [ ] Auto-merge is off *(admin)*.
- [ ] The Railway project is defined in `.railway/railway.ts`, production follows `prod` and development follows `main`, and the `railway config plan` output was reviewed (#9).
- [ ] Wait for CI is on for every service.
- [ ] The `production` GitHub Environment exists with a required reviewer *(admin)*.
- [ ] The Railway GitHub app is installed on the repository, and the Railway tokens are stored as GitHub Actions secrets *(admin)*.
- [ ] Variables are set in Railway, nothing secret is in the repository, and development and production use different values.
- [ ] `/health` returns `env` and `sha` in every environment.
- [ ] A rollback was rehearsed once in the development environment.
- [ ] `server/ARCHITECTURE.md` describes the setup and how to promote a release (#9).

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
- Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`, for example `feat(team-2): add login page`. Types: `feat`, `fix`, `docs`, `refactor`, `chore`, `ci`, `build`, `test`, `perf`. The scope is your team label.
- Write the subject in the imperative mood, lowercase, at most 72 characters, without a trailing period ("add login page", not "Added login page.").
- Reference the issue on its own line in the body, e.g. `Refs #14`.
- Do not commit secrets, credentials, build output or large binaries.
- Set up the commit template once: `git config commit.template .gitmessage`.

### 4. Pull request

- One pull request per issue.
- Fill in every section of the [pull request template](.github/pull_request_template.md). Don't delete or rename its headings.
- The PR must carry the same team label as its issue.
- The title follows [Conventional Commits](https://www.conventionalcommits.org/), like a commit subject, with the team label as the scope: `feat(team-2): add login page`. The type matches the PR template (`feat` for a feature, `fix` for a bug, `docs`, `refactor`, or `chore`/`ci`/`build`/`test`/`perf` for a chore; `chore` for release and sync PRs). Issue titles keep the `[team-2] Add login page` form.
- The description links the issue with a closing keyword (`Closes #14`) and summarizes what changed and how it was tested.
- Set the base branch as described in [Branches](#branches): `feature/team-N` for a work branch, `main` for a feature branch (and for platform and instructor work), `prod` for a release.
- Keep the PR focused. Unrelated changes go in their own issue and PR.

### 5. Review and merge

- At least one approving review is required before merging. Nobody approves their own PR.
- All checks must pass.
- Resolve every review comment before merging.
- Rebase on or merge in the base branch if your branch is behind, then merge.
- Delete the branch after it is merged.

## Templates, classification and checks

Issues, pull requests and commits follow templates. **A script chooses the type, a skill fills the template, a check validates the result.** Agents never pick the type, template, team label or base branch themselves.

| | Templates | Agent skill | Check |
|---|---|---|---|
| Issue | `.github/ISSUE_TEMPLATE/`: feature, bug, docs, chore, refactor | `fill-issue` | `pnpm check:issue` |
| Pull request | `.github/PULL_REQUEST_TEMPLATE/`: the same five, plus release and sync | `fill-pr` | `pnpm check:pr`, also run by CI |
| Commit | `.gitmessage` | `write-commit` | `pnpm check:commit`, also run by CI |

- `pnpm workflow:classify --kind issue|pr|commit` decides the type from the change set (uncommitted files, `--staged`, or `--base <ref>`), plus the team label, the template and the base branch. The same change always gives the same answer.
- If no rule decides, it exits 1 and lists the candidates. Pass `--type` after asking; it never guesses between feature, bug and refactor.
- A PR from `main` is a release (into `prod`) or a sync (into `feature/team-N`): pass `--target`.
- Every template heading is required, in order, and must be filled in. Write `None` if a section does not apply.
- The skills live in `.claude/skills/`. The rules and their rationale are in `server/tooling/workflow/`.

**Before opening a PR, run `pnpm preflight`; it must pass.** It runs lint, typecheck, tests and the build, then checks the branch (name, base, linked issue), folder ownership, commit messages, committed files, secrets, docs links, game config and simulation determinism, and says how to fix each failure. Agents run `pnpm preflight:quick` (lint, typecheck, ownership) after every change. CI runs the same checks on every PR. Files owned by another team are only allowed when the issue explains why on a line of its own: `Cross-team: <why>`.

## Labels

The repo has only two kinds of labels; there are no type, size or priority labels. Every label is defined in `server/tooling/workflow/labels.json`, and `pnpm labels:sync` makes GitHub match it (dry run by default, `--apply` to change). Don't create labels by hand.

| Labels | Rule | Set by |
|---|---|---|
| `team-1` … `team-4`, `platform`, `team-instructor` | exactly one on every issue and PR | you |
| `stackpile`, `waiting-on.author`, `waiting-on.review`, `waiting-on.merge` | on open PRs only | the labeller |

The **labeller** (`pnpm labels:prs`, the "PR labels" workflow) runs every 10 minutes and whenever a PR or review changes. It only touches these four labels, and removes them when a PR is closed or merged:

- `stackpile`: the PR is stacked on another PR (its base isn't `main`, `prod` or a `feature/team-N` branch). It merges after the PR below it.
- Exactly one waiting label, checked in this order:
  1. `waiting-on.author`: a reviewer requested changes, a review thread is unresolved, or the PR is a draft. The author pushes fixes, resolves the threads, or marks the PR ready.
  2. `waiting-on.review`: no approving review from someone other than the author yet. A teammate reviews it.
  3. `waiting-on.merge`: approved with nothing open. Whoever merges for the team merges it.

## Never

- Push directly to `main`, `prod` or a `feature/team-N` branch.
- Force-push to any of those branches or to someone else's branch.
- Open a pull request from a team work branch straight into `main` or `prod`.
- Merge a PR without a team label, a linked issue or an approving review.
- Rewrite history that others have already pulled.
