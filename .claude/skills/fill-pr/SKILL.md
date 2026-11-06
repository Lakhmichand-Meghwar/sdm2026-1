---
name: fill-pr
description: Open a GitHub pull request for this repository that follows its template. Use when the user asks to open, create or write a pull request or PR, or when finished work on a branch needs one. The classifier script chooses the template, label and base branch, you fill it in, and check:pr validates it.
---

# Fill a pull request

The rule: **the script chooses, you fill, the check decides.** Never pick the PR type, template, team label or base branch yourself, and never open a PR that `pnpm check:pr` rejects.

Prerequisites: the work is committed on a branch named `<team-label>/<issue-number>-<slug>` and an issue exists (open one with the `fill-issue` skill first if not). Commits should follow the format checked by `pnpm check:commit` (see `write-commit`).

## 1. Classify

Run from the repo root, with the branch the PR comes from:

```bash
pnpm workflow:classify --kind pr --base <base-ref> --json
```

Use `origin/main` as `<base-ref>` for platform and instructor work, `origin/feature/team-N` for team work.

- It returns `type`, `label`, `base` (the branch to target) and `template`.
- **Exit code 1 means it could not decide** (`undecided: true`, with `candidates`). Ask the user which type it is, then re-run with `--type <their answer>`.
- Releases and syncs have `main` as their head. Pass `--target prod` for a release or `--target feature/team-N` for a sync, and `--label platform` (they use `Refs #N`, not `Closes #N`).
- If it lists several owners for the changed files, the change must be split, because a PR has exactly one team label.

## 2. Gather the facts

- The issue: `gh issue view <n>` (the number is in the branch name). The summary must match what the issue asked for.
- The commits and diff: `git log --oneline <base-ref>..HEAD` and `git diff <base-ref>...HEAD --stat`.

## 3. Fill the template

Read the file named in `template`. Write the PR body to a scratch file (not into the repo) that keeps **every `##` heading, in order, with the exact same text**. Remove the HTML comments.

- **Title:** `[<label>] <short imperative summary>`.
- **Linked issue:** `Closes #<n>` (work PRs) or `Refs #<n>` (release and sync).
- **Team:** the label, as plain text.
- **Summary:** what changed and why, from the diff and the issue. Add the type-specific sections (Root cause, Pages affected, Impact, Behaviour unchanged, Included changes, Rollback) when the template has them.
- **How to test:** only steps and commands that you actually ran, with their real results. If you did not run something, say so. Never claim a test passed that you did not run.
- **Screenshots:** `None` if nothing visible changed.
- **Checklist:** tick an item only if it is true. If one is not, fix the cause (rename the branch, change the base) before ticking it. Notes after an item are fine.
- Write in English. Use only facts from the issue, the code and the commands you ran.

## 4. Check

```bash
pnpm check:pr --title "<title>" --body-file <body-file> --head <branch> --base <base> --labels <label> --git-base <base-ref>
```

Fix every problem and re-run. A warning about a different classification is worth reading: use the template the classifier chose unless the user says otherwise. After three failed rounds, stop and show the user the remaining messages.

## 5. Open

```bash
git push -u origin <branch>
gh pr create --base <base> --head <branch> --title "<title>" --body-file <body-file> --label <label>
```

Report the PR URL. Do not request reviewers, merge, or enable auto-merge unless the user asks.
