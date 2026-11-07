// Fills a PR template for the commands that open PRs themselves. Every heading of the template is
// kept, in order; the guidance comments are dropped. A section or checklist item that is not in the
// template is an error, so a template change can't silently produce a body check:pr rejects.
import { headingsOf, sectionsOf } from "./template.mjs";

/**
 * @param {string} template the template's Markdown
 * @param {{
 *   sections: Record<string, string>,
 *   tick?: Record<string, string | true>,
 * }} input sections: heading -> content (others keep the template's text);
 *   tick: start of a checklist item -> true, or a note shown after it
 */
export function fillTemplate(template, { sections, tick = {} }) {
  const headings = headingsOf(template);
  for (const heading of Object.keys(sections)) {
    if (!headings.includes(heading)) throw new Error(`The template has no "## ${heading}" section.`);
  }
  const defaults = Object.fromEntries(sectionsOf(template).map((s) => [s.heading, s.body]));

  const used = new Set();
  const parts = headings.map((heading) => {
    let content = sections[heading] ?? defaults[heading] ?? "";
    if (heading === "Checklist") {
      content = content
        .split(/\r?\n/)
        .map((line) => {
          const m = /^(\s*-\s*)\[ \]\s*(.*)$/.exec(line);
          if (!m) return line;
          const key = Object.keys(tick).find((k) => m[2].startsWith(k));
          if (!key) return line;
          used.add(key);
          const note = tick[key] === true ? "" : ` (${tick[key]})`;
          return `${m[1]}[x] ${m[2]}${note}`;
        })
        .join("\n");
    }
    return `## ${heading}\n\n${content.trim()}\n`;
  });
  for (const key of Object.keys(tick)) {
    if (!used.has(key)) throw new Error(`The template's checklist has no item "${key}".`);
  }
  return parts.join("\n");
}
