// Enforces "work inside your own team's folder" (CLAUDE.md): a work branch may change files its label
// owns and shared files. Another owner's files are an error, unless the issue carries the
// "cross-team" label, which says the issue explains why; then they are warnings.
import { ownerOf } from "./ownership.mjs";

export const CROSS_TEAM_LABEL = "cross-team";

/**
 * @param {{
 *   label: string,
 *   files: string[],
 *   ownership: { path: string, owner: string }[],
 *   crossTeam: boolean,
 * }} input
 */
export function checkOwnership({ label, files, ownership, crossTeam }) {
  const foreign = files
    .map((file) => ({ file, owner: ownerOf(file, ownership) }))
    .filter(({ owner }) => owner !== label && owner !== "shared");

  if (crossTeam) {
    return {
      problems: [],
      warnings: foreign.map(
        ({ file, owner }) => `${file} is owned by ${owner} (allowed: the issue is ${CROSS_TEAM_LABEL}).`,
      ),
    };
  }
  return {
    problems: foreign.map(({ file, owner }) => ({
      rule: "ownership",
      file,
      message: `Owned by ${owner}, but this branch is ${label} work.`,
      fix: `Move it to a ${owner} issue, or add the "${CROSS_TEAM_LABEL}" label to the issue and explain why there.`,
    })),
    warnings: [],
  };
}
