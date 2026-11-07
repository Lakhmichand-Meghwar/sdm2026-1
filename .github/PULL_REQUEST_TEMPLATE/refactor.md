<!--
Title: Conventional Commits, like a commit subject: "type(<team-label>): subject", lowercase
imperative, at most 72 characters, no period. Type: refactor. Example: "refactor(team-2): split the game loop".
Add the same team label to this PR as to its issue.
Fill in every section. Don't delete or rename the headings; `pnpm check:pr` and the evaluation read
them. Write "None" if a section does not apply. Remove these comments when you are done.
See CLAUDE.md for the full workflow.
-->

## Linked issue

Closes #

## Team

<!-- Your team label: team-1, team-2, team-3, team-4, platform or team-instructor. -->

team-

## Summary

<!-- What changed and why, in a few sentences or bullets. -->

## Behaviour unchanged

<!-- How you know the behaviour did not change (tests, replays, manual check). -->

## How to test

<!-- Steps a reviewer can follow to see the change working. -->

1.

## Screenshots

<!-- Screenshots or a short recording of visible changes. Write "None" if nothing visible changed. -->

## Checklist

- [ ] The PR closes an issue with `Closes #N`, and that issue has a team label
- [ ] This PR has the same team label as the issue
- [ ] The title follows Conventional Commits with the team label as the scope: `type(<team-label>): subject`
- [ ] The branch is named `<team-label>/<issue-number>-<short-description>`
- [ ] Changes only touch my own team's folder (see CLAUDE.md), or the issue explains why not
- [ ] Commits follow Conventional Commits and reference the issue (`Refs #N`)
- [ ] No secrets, credentials, build output or large binaries are committed
- [ ] The base branch is correct: `feature/team-N` for a work branch, `main` for a feature branch and for platform and instructor work
- [ ] The branch is up to date with its base branch
- [ ] I tested the change as described under "How to test"
