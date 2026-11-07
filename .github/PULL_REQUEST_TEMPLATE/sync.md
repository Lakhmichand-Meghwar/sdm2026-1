<!--
Title: chore(<team-label>): bring feature/team-N up to date with main
Sync PRs have `main` as their head branch (no work branch, no new commits). They use `Refs #N` because
one issue can cover several of them. Fill in every section; `pnpm check:pr` and the evaluation read the
headings. Write "None" if a section does not apply. Remove these comments when you are done.
See CLAUDE.md, "Branches".
-->

## Linked issue

Refs #

## Team

<!-- Your team label: platform for branch syncs and releases. -->

platform

## Summary

<!-- Which branch is brought up to date with `main`, how many commits behind it was, and whether there are conflicts. -->

## Included changes

<!-- The pull requests or commits that arrive with this merge. -->

## How to test

<!-- Steps a reviewer can follow, e.g. CI is green and the commit count between the branches is 0 afterwards. -->

1.

## Screenshots

<!-- Write "None" for a branch merge. -->

## Checklist

- [ ] The PR refers to an issue with `Refs #N`, and that issue has a team label
- [ ] This PR has the same team label as the issue
- [ ] The title follows Conventional Commits with the team label as the scope: `type(<team-label>): subject`
- [ ] The head branch is `main` and the base branch is `feature/team-N`
- [ ] The merge adds no new commits of its own, or the conflicts that were resolved are listed in the summary
- [ ] No secrets, credentials, build output or large binaries are committed
- [ ] The branch is up to date with its base branch
- [ ] I tested the change as described under "How to test"

