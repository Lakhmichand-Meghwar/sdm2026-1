# Rulesets

Branch rules that make the workflow in `CLAUDE.md` enforced instead of followed by convention. GitHub does not read this folder: a **repository admin** has to import each file once.

| File | Protects | What it blocks |
|---|---|---|
| `prod.json` | `prod` (production) | Direct pushes, force pushes and deletion. Merging without an approving review by someone other than the last pusher, without resolved conversations, or while `release gate` or CI is red. Only merge commits are allowed, so a release is the exact `main` history. No bypass, not even for admins. |
| `main.json` | `main` (development) | Direct pushes, force pushes and deletion. Merging without an approving review or while CI is red. |

## Import (admin)

1. Open **Settings → Rules → Rulesets → New ruleset → Import a ruleset**.
2. Choose `prod.json`, review it and create it. Repeat for `main.json`.
3. In **Settings → General → Pull Requests**, leave **Allow auto-merge** switched off (it is off today). Auto-merge on a release PR would defeat the point of the gate.
4. In **Settings → Environments**, create `production` with a required reviewer (used by the production deploy, see "Deploying to Railway" in `CLAUDE.md`).

Or from a terminal, as an admin:

```bash
gh api -X POST repos/nd2003/sdm2026-1/rulesets --input .github/rulesets/prod.json
gh api -X POST repos/nd2003/sdm2026-1/rulesets --input .github/rulesets/main.json
```

## Notes

- The status check names must match the job names in `.github/workflows/`: `release gate` (`release-gate.yml`) and `checks (<os>)` (`ci.yml`). Rename a job and the ruleset must change with it, or merging stops.
- `release gate` only exists once `release-gate.yml` is on `main`. Import `prod.json` after that, or no PR into `prod` can ever pass.
- When the pull request checks from the workflow tooling land (`pull request follows the template`, from `workflow-checks.yml`), add them to `required_status_checks` in `main.json`.
- Nobody can bypass `prod.json`. If an admin needs to, they edit the ruleset first, and that change is visible in the audit log.
