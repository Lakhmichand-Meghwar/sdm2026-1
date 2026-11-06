import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkPr, detectPrType } from "./lib/check-pr.mjs";
import { headingsOf } from "./lib/template.mjs";

const root = new URL("../../../", import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, root), "utf8");
const config = JSON.parse(read("server/tooling/workflow/types.json"));

// The real templates, so a template change is covered by these tests.
const templates = Object.fromEntries(
  Object.entries(config.types as Record<string, { prTemplate: string | null }>)
    .filter(([, t]) => t.prTemplate)
    .map(([name, t]) => [name, read(t.prTemplate as string)]),
);

/** Fills a template: replaces placeholders, ticks every box and gives extra sections content. */
function fill(type: string, over: { linked?: string; team?: string } = {}) {
  let md = templates[type].replace(/<!--[\s\S]*?-->/g, "");
  md = md.replace(
    /^(Closes|Refs) #$/m,
    over.linked ?? (type === "release" || type === "sync" ? "Refs #33" : "Closes #12"),
  );
  md = md.replace(/^(team-|platform)$/m, over.team ?? "team-2");
  md = md.replace(/- \[ \]/g, "- [x]");
  // Give every section that is still empty some content.
  return md
    .replace(/(## How to test\n)\s*1\.\n/, "$1\npnpm test\n")
    .replace(/(## Pages affected\n)\s*-\s*\n/, "$1\n- README.md\n")
    .replace(/(## [^\n]+\n)\s*(?=## |(?![\s\S]))/g, "$1\nNone\n\n");
}

const work = {
  title: "[team-2] Add login",
  head: "team-2/12-add-login",
  base: "feature/team-2",
  labels: ["team-2"],
};
const check = (over: Record<string, unknown> = {}, body = fill("feature")) =>
  checkPr({ ...work, body, config, templates, ...over });
const rules = (r: { problems: { rule: string }[] }) => r.problems.map((p) => p.rule);

describe("every PR template", () => {
  it.each(Object.keys(templates))("%s keeps the six required headings", (type) => {
    const headings = headingsOf(templates[type]);
    for (const h of ["Linked issue", "Team", "Summary", "How to test", "Screenshots", "Checklist"]) {
      expect(headings).toContain(h);
    }
  });

  it.each(["feature", "bug", "docs", "chore", "refactor"])("a filled %s template passes", (type) => {
    const r = check({}, fill(type));
    expect(r.problems).toEqual([]);
    expect(r.type).toBe(type);
  });

  it.each(["feature", "bug", "docs", "chore", "refactor", "release", "sync"])(
    "%s is rejected while unfilled",
    (type) => {
      const base = type === "release" ? "prod" : type === "sync" ? "feature/team-2" : work.base;
      const head = type === "release" || type === "sync" ? "main" : work.head;
      expect(checkPr({ ...work, head, base, body: templates[type], config, templates }).ok).toBe(false);
    },
  );
});

describe("work PRs", () => {
  it("accepts a correct PR", () => {
    expect(check()).toMatchObject({ ok: true, type: "feature" });
  });

  it("detects the bug template from its own heading", () => {
    expect(check({}, fill("bug"))).toMatchObject({ ok: true, type: "bug" });
  });

  it("rejects a title without a [label] prefix or with an unknown one", () => {
    expect(rules(check({ title: "Add login" }))).toContain("title");
    expect(check({ title: "[frontend] Add login" }).problems[0].message).toContain("not a team label");
  });

  it("needs exactly one team label, matching the title", () => {
    expect(rules(check({ labels: [] }))).toContain("labels");
    expect(rules(check({ labels: ["team-1", "team-2"] }))).toContain("labels");
    expect(check({ labels: ["team-1"] }).problems[0].message).toContain("team label is team-1");
  });

  it("rejects a badly named branch and a branch label that differs from the title", () => {
    expect(rules(check({ head: "my-fix" }))).toContain("branch");
    expect(check({ head: "team-1/12-add-login" }).problems[0].message).toContain(
      "differs from the title label",
    );
  });

  it("rejects the wrong base branch", () => {
    const r = check({ base: "main" });
    expect(r.problems[0]).toMatchObject({ rule: "base" });
    expect(r.problems[0].message).toContain("feature/team-2");
  });

  it("platform work targets main", () => {
    const r = check(
      { title: "[platform] Add CI", head: "platform/8-ci", base: "main", labels: ["platform"] },
      fill("feature", { team: "platform" }),
    );
    expect(r.problems).toEqual([]);
  });

  it("a feature branch targets main", () => {
    expect(check({ head: "feature/team-2", base: "main" }).problems).toEqual([]);
  });

  it('needs "Closes #N", not a bare placeholder or Refs', () => {
    expect(rules(check({}, fill("feature", { linked: "Closes #" })))).toContain("linked-issue");
    expect(rules(check({}, fill("feature", { linked: "Refs #12" })))).toContain("linked-issue");
  });

  it("rejects a Team section that is a placeholder or differs from the title", () => {
    expect(rules(check({}, fill("feature", { team: "team-" })))).toContain("team");
    expect(check({}, fill("feature", { team: "team-1" })).problems[0].message).toContain(
      "title says [team-2]",
    );
  });

  it("reports an unticked checklist item", () => {
    const body = fill("feature").replace("- [x] I tested", "- [ ] I tested");
    expect(rules(check({}, body))).toEqual(["checklist"]);
  });

  it("accepts notes after a checklist item", () => {
    const body = fill("feature").replace(
      '- [x] I tested the change as described under "How to test"',
      '- [x] I tested the change as described under "How to test" (CI is green)',
    );
    expect(check({}, body).ok).toBe(true);
  });

  it("reports a missing and an empty section", () => {
    const body = fill("feature")
      .replace(/## Screenshots[\s\S]*?(?=## Checklist)/, "")
      .replace("pnpm test", "");
    expect(rules(check({}, body))).toEqual(expect.arrayContaining(["heading", "empty"]));
  });

  it("rejects a work PR that uses the release template", () => {
    expect(rules(check({}, fill("release")))).toContain("template");
  });

  it("rejects a body that mixes two templates", () => {
    const body = `${fill("bug")}\n## Pages affected\n\n- README.md\n`;
    expect(rules(check({}, body))).toContain("template");
  });

  it("warns, but does not fail, when the classifier disagrees with the template", () => {
    const r = check({ classification: { undecided: false, type: "chore", rule: "commit-prefix" } });
    expect(r.ok).toBe(true);
    expect(r.warnings[0]).toContain('classify this as "chore"');
  });
});

describe("PRs from main", () => {
  const release = {
    title: "[platform] Release main to prod",
    head: "main",
    base: "prod",
    labels: ["platform"],
  };
  const sync = {
    title: "[platform] Bring feature/team-1 up to date",
    head: "main",
    base: "feature/team-1",
    labels: ["platform"],
  };
  const run = (pr: typeof release, type: string, body = fill(type, { team: "platform" })) =>
    checkPr({ ...pr, body, config, templates });

  it("accepts a filled release and a filled sync, with Refs #N", () => {
    expect(run(release, "release")).toMatchObject({ ok: true, type: "release", problems: [] });
    expect(run(sync, "sync")).toMatchObject({ ok: true, type: "sync", problems: [] });
  });

  it("main into any other branch is rejected", () => {
    expect(
      rules(
        checkPr({ ...release, base: "main", body: fill("release", { team: "platform" }), config, templates }),
      ),
    ).toContain("base");
  });

  it("a sync body is not enough for a release (no Rollback section)", () => {
    expect(
      run(release, "sync", fill("sync", { team: "platform" }))
        .problems.map((p) => p.message)
        .join(),
    ).toContain("Rollback");
  });
});

describe("detectPrType", () => {
  it("narrows a release body to release, not sync", () => {
    expect(detectPrType(fill("release"), templates).candidates).toEqual(["release"]);
    expect(detectPrType(fill("sync"), templates).candidates).toEqual(["sync"]);
  });

  it("finds nothing in a plain feature body", () => {
    expect(detectPrType(fill("feature"), templates).candidates).toEqual([]);
  });

  it("reports a template that is only partly there", () => {
    const body = fill("feature").replace("## Screenshots", "## Rollback\n\nundo\n\n## Screenshots");
    expect(detectPrType(body, templates).partial).toContain("release");
  });
});
