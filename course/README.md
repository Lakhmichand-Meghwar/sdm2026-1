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
