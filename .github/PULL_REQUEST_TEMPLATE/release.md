<!--
Title: chore(<team-label>): release main to prod
Release PRs have `main` as their head branch (no work branch, no new commits). They use `Refs #N` because
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

<!-- What goes live: the state of `main` and why it is ready. -->

## Included changes

<!-- The pull requests that go live with this release. -->

## Rollback

<!-- How to go back if the release breaks: which commit or release to restore and who does it. -->

## How to test

<!-- Steps a reviewer can follow, e.g. CI is green and the commit count between the branches is 0 afterwards. -->

1.

## Screenshots

<!-- Write "None" for a branch merge. -->

## Checklist

- [ ] The PR refers to an issue with `Refs #N`, and that issue has a team label
- [ ] This PR has the same team label as the issue
- [ ] The title follows Conventional Commits with the team label as the scope: `type(<team-label>): subject`
- [ ] The head branch is `main` and the base branch is `prod`
- [ ] CI is green on `main`
- [ ] The rollback plan above is realistic
- [ ] No secrets, credentials, build output or large binaries are committed
- [ ] The branch is up to date with its base branch
- [ ] I tested the change as described under "How to test"

