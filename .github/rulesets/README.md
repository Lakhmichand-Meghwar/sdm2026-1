# Rulesets

Branch rules that make the workflow in `CLAUDE.md` enforced instead of followed by convention. GitHub does not read this folder: a **repository admin** has to import each file once.

| File | Protects | What it blocks |
|---|---|---|
| `prod.json` | `prod` (production) | Direct pushes, force pushes and deletion. Merging without an approving review by someone other than the last pusher, without resolved conversations, or while `release gate` or CI is red. Only merge commits are allowed, so a release is the exact `main` history. No bypass, not even for admins. |
| `main.json` | `main` (development) | Direct pushes, force pushes and deletion. Merging without an approving review or while CI or the `instructor gate` is red. With `.github/CODEOWNERS`, a change under `course/` also needs an instructor to approve it. |

## Import (admin)

1. Open **Settings → Rules → Rulesets → New ruleset → Import a ruleset**.
2. Choose `prod.json`, review it and create it. Repeat for `main.json`.
3. In **Settings → General → Pull Requests**, leave **Allow auto-merge** switched off (it is off today). Auto-merge on a release PR would defeat the point of the gate.

Or from a terminal, as an admin:

```bash
gh api -X POST repos/nd2003/sdm2026-1/rulesets --input .github/rulesets/prod.json
gh api -X POST repos/nd2003/sdm2026-1/rulesets --input .github/rulesets/main.json
```

## Notes

- `instructor gate` comes from `instructor-gate.yml`, which runs from the base branch (`pull_request_target`). It runs on every PR and passes when the PR does not use the `team-instructor` identity, so requiring it is safe. Its first run, on the PR that adds it, fails with `Cannot find module .../check-instructor.mjs`, because the job checks out `main` and the script is not there yet; that is expected. Like `release gate`, import the rulesets only after the workflow is on `main` **and has passed once there**.
- `main.json` sets `require_code_owner_review`, which is what makes `.github/CODEOWNERS` binding: the instructors listed there must approve changes under `course/` and to `.github/instructors.json`. The list in `CODEOWNERS` has to match `.github/instructors.json` (a test checks it).
- The status check names must match the job names in `.github/workflows/`: `release gate` (`release-gate.yml`) and `🧰 setup`, `📝 config`, `🧹 lint`, `🔎 typecheck`, `🧪 test` and `📦 build` (`ci.yml`, emoji included). Rename a job and the ruleset (and `REQUIRED_CHECKS` in `server/tooling/check-release.mjs`) must change with it, or merging stops.
- `release gate` only exists once `release-gate.yml` is on `main`. Import `prod.json` after that, or no PR into `prod` can ever pass.
- When the pull request checks from the workflow tooling land (`pull request follows the template`, from `workflow-checks.yml`), add them to `required_status_checks` in `main.json`.
- Nobody can bypass `prod.json`. If an admin needs to, they edit the ruleset first, and that change is visible in the audit log.
