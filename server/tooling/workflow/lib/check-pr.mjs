// Validates a pull request against its template. Pure: the caller passes the PR data and the
// template texts, so the same rules run in CI, locally and in tests.
import { baseFor, kindOfMainPr, WORK_BRANCH } from "./rules.mjs";
import { headingsOf, sectionsOf, stripComments } from "./template.mjs";

const normalize = (s) => s.trim().toLowerCase();
const WORK_TYPES = ["feature", "bug", "docs", "chore", "refactor"];

/**
 * Finds which PR template a body follows from the headings only that template has.
 * Several matches are narrowed to the most specific one (a release body also contains everything a
 * sync body has).
 * @param {string} body
 * @param {Record<string, string>} templates PR type -> template Markdown
 */
export function detectPrType(body, templates) {
  const common = new Set(headingsOf(templates.feature).map(normalize));
  const present = new Set(sectionsOf(body).map((s) => normalize(s.heading)));
  /** @type {Record<string, string[]>} */
  const unique = {};
  for (const [type, md] of Object.entries(templates)) {
    if (type === "feature") continue;
    unique[type] = headingsOf(md)
      .map(normalize)
      .filter((h) => !common.has(h));
  }
  const full = Object.keys(unique).filter(
    (t) => unique[t].length > 0 && unique[t].every((h) => present.has(h)),
  );
  const best = full.filter(
    (t) =>
      !full.some(
        (o) =>
          o !== t && unique[o].length > unique[t].length && unique[t].every((h) => unique[o].includes(h)),
      ),
  );
  const partial = Object.keys(unique).filter(
    (t) => !full.includes(t) && unique[t].some((h) => present.has(h)),
  );
  return { candidates: best, partial };
}

/**
 * @param {{
 *   title: string,
 *   body: string | null,
 *   head: string,
 *   base: string,
 *   labels?: string[] | null,
 *   type?: string | null,
 *   config: { teamLabels: string[] },
 *   templates: Record<string, string>,
 *   classification?: { undecided?: boolean, type?: string, rule?: string } | null,
 * }} input templates: PR type -> template Markdown
 */
export function checkPr({
  title,
  body: rawBody,
  head,
  base,
  labels = null,
  type = null,
  config,
  templates,
  classification = null,
}) {
  const body = rawBody ?? "";
  /** @type {{ rule: string, message: string }[]} */
  const problems = [];
  /** @type {string[]} */
  const warnings = [];
  const add = (rule, message) => problems.push({ rule, message });

  // Title: "[team-label] Summary"
  const t = /^\[([^\]]+)\]\s+(\S.*)$/.exec(title.trim());
  const titleLabel = t?.[1] ?? null;
  if (!t) {
    add("title", `Title must look like "[<team-label>] Short summary" (got "${title.trim()}").`);
  } else if (!config.teamLabels.includes(t[1])) {
    add("title", `"[${t[1]}]" is not a team label. Use one of: ${config.teamLabels.join(", ")}.`);
  }

  // Labels: exactly one team label, matching the title.
  if (labels) {
    const team = labels.filter((l) => config.teamLabels.includes(l));
    if (team.length !== 1) {
      add("labels", `Needs exactly one team label (${config.teamLabels.join(", ")}); has ${team.length}.`);
    } else if (titleLabel && titleLabel !== team[0]) {
      add("labels", `Title says [${titleLabel}] but the team label is ${team[0]}.`);
    }
  }

  // Head and base branches. A PR from main is a release (into prod) or a sync (into feature/team-N).
  /** @type {string | null} */
  let fixedType = null;
  const isWorkPr = head !== "main";
  if (head === "main") {
    fixedType = kindOfMainPr(base);
    if (!fixedType)
      add("base", `A PR from main must target prod (release) or feature/team-N (sync), not ${base}.`);
  } else {
    if (!/^feature\/team-[1-4]$/.test(head)) {
      const m = WORK_BRANCH.exec(head);
      if (!m) {
        add(
          "branch",
          `Branch "${head}" must be named <team-label>/<issue-number>-<short-description>, e.g. team-2/14-add-login.`,
        );
      } else if (titleLabel && m[1] !== titleLabel) {
        add("branch", `Branch label "${m[1]}" differs from the title label "${titleLabel}".`);
      }
    }
    const expected = baseFor(head, config.teamLabels);
    if (expected && expected !== base) add("base", `A PR from ${head} must target ${expected}, not ${base}.`);
  }

  // Which template does the body follow?
  let chosen = type ?? fixedType;
  if (!chosen) {
    const { candidates, partial } = detectPrType(body, templates);
    const work = candidates.filter((c) => WORK_TYPES.includes(c));
    if (candidates.length > work.length) {
      add(
        "template",
        `A PR from ${head} cannot use the ${candidates.filter((c) => !WORK_TYPES.includes(c)).join("/")} template; that one is for PRs from main.`,
      );
    }
    if (work.length > 1)
      add(
        "template",
        `The body mixes the headings of several templates (${work.join(", ")}). Use one template.`,
      );
    if (work.length === 0 && partial.length > 0) {
      add(
        "template",
        `The body has some of the ${partial.join("/")} template's headings but not all of them. Use the full template.`,
      );
    }
    chosen = work.length === 1 ? work[0] : "feature";
  }
  if (!templates[chosen]) {
    add("template", `No PR template for type "${chosen}".`);
    return { ok: false, type: chosen, problems, warnings };
  }

  // Every heading of the template, in order, with content.
  const sections = sectionsOf(body);
  const required = headingsOf(templates[chosen]);
  let cursor = -1;
  for (const heading of required) {
    const idx = sections.findIndex((s) => normalize(s.heading) === normalize(heading));
    if (idx === -1) {
      add("heading", `Missing section "## ${heading}".`);
      continue;
    }
    if (idx < cursor) add("order", `Section "## ${heading}" is out of order; follow the template.`);
    cursor = Math.max(cursor, idx);

    const content = stripComments(sections[idx].body).trim();
    if (content.replace(/^\s*(?:[-*]|\d+\.)\s*$/gm, "").trim() === "") {
      add("empty", `Section "## ${heading}" is empty. Fill it in, or write "None" if it does not apply.`);
      continue;
    }
    if (heading === "Linked issue") {
      const word = isWorkPr ? "Closes|Fixes|Resolves" : "Closes|Fixes|Resolves|Refs";
      if (!new RegExp(`\\b(?:${word})\\s+#\\d+`, "i").test(content)) {
        add(
          "linked-issue",
          `"## Linked issue" needs ${isWorkPr ? '"Closes #<number>"' : '"Refs #<number>" or "Closes #<number>"'}.`,
        );
      }
    } else if (heading === "Team") {
      const team = content.split(/\s+/)[0].replace(/[`*]/g, "");
      if (!config.teamLabels.includes(team)) {
        add("team", `"## Team" must be a team label (${config.teamLabels.join(", ")}), got "${team}".`);
      } else if (titleLabel && team !== titleLabel) {
        add("team", `"## Team" says ${team} but the title says [${titleLabel}].`);
      }
    } else if (heading === "Checklist") {
      const boxes = content.split(/\r?\n/).filter((l) => /^\s*-\s*\[[ xX]\]/.test(l));
      const needed = (stripComments(templates[chosen]).match(/^\s*-\s*\[ \]/gm) ?? []).length;
      const open = boxes.filter((l) => /^\s*-\s*\[ \]/.test(l));
      if (boxes.length < needed)
        add("checklist", `Checklist has ${boxes.length} items; the template has ${needed}.`);
      if (open.length > 0)
        add(
          "checklist",
          `${open.length} checklist item(s) are not ticked. Tick them, or fix what they check.`,
        );
    }
  }

  // The classifier is deterministic, so a different answer from the template used is worth a look.
  if (
    isWorkPr &&
    classification &&
    !classification.undecided &&
    classification.type &&
    classification.type !== chosen
  ) {
    warnings.push(
      `The changed files and commits classify this as "${classification.type}" (rule: ${classification.rule}) but the body follows the ${chosen} template.`,
    );
  }

  return { ok: problems.length === 0, type: chosen, problems, warnings };
}
