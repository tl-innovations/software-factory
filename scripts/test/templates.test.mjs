import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyTemplates,
  deepMerge,
  fillDefaults,
  render,
  templateVars,
  changed,
} from "../lib/templates.mjs";

const cfg = {
  factoryRepo: "acme/software-factory",
  factoryRef: "v1",
  marketplace: "software-factory",
};
const vars = templateVars(cfg, {
  name: "acme-site",
  type: "web",
  repo: "acme/acme-site",
  description: "Marketing site",
});

test("render replaces known keys only and leaves GitHub expressions alone", () => {
  const out = render(
    'uses: "{{FACTORY_REPO}}/x.yml@{{FACTORY_REF}}" ${{ secrets.X }} {{UNKNOWN}}',
    vars,
  );
  assert.equal(
    out,
    'uses: "acme/software-factory/x.yml@v1" ${{ secrets.X }} {{UNKNOWN}}',
  );
});

test("deepMerge: objects merge, arrays union, overlay scalars win", () => {
  const merged = deepMerge(
    { a: { x: 1, keep: true }, list: ["a", "b"], s: "old" },
    { a: { x: 2 }, list: ["b", "c"], s: "new" },
  );
  assert.deepEqual(merged, {
    a: { x: 2, keep: true },
    list: ["a", "b", "c"],
    s: "new",
  });
});

test("fillDefaults only adds missing keys", () => {
  const out = fillDefaults(
    { commands: { test: "" }, ci: ["lint"] },
    {
      commands: { test: "npm test", lint: "npm run lint" },
      ci: ["lint", "test"],
      gates: { onStop: [] },
    },
  );
  assert.deepEqual(out, {
    commands: { test: "", lint: "npm run lint" },
    ci: ["lint"],
    gates: { onStop: [] },
  });
});

test("applyTemplates creates files, renders placeholders, writes managed manifest", () => {
  const dir = mkdtempSync(join(tmpdir(), "factory-tpl-"));
  const changes = applyTemplates(dir, { type: "web", vars });
  assert.ok(changed(changes).length > 5);

  const claudeMd = readFileSync(join(dir, "CLAUDE.md"), "utf8");
  assert.match(claudeMd, /^# acme-site/);
  assert.match(claudeMd, /@\.factory\/standards\.md/);

  const ci = readFileSync(
    join(dir, ".github/workflows/factory-ci.yml"),
    "utf8",
  );
  assert.match(
    ci,
    /uses: "acme\/software-factory\/\.github\/workflows\/ci\.yml@v1"/,
  );

  const settings = JSON.parse(
    readFileSync(join(dir, ".claude/settings.json"), "utf8"),
  );
  assert.equal(settings.enabledPlugins["factory@software-factory"], true);
  assert.equal(settings.enabledPlugins["factory-web@software-factory"], true);
  assert.equal(
    settings.extraKnownMarketplaces["software-factory"].source.repo,
    "acme/software-factory",
  );

  const managed = JSON.parse(
    readFileSync(join(dir, ".factory/managed.json"), "utf8"),
  );
  assert.ok(managed.files.includes(".factory/standards.md"));
  assert.ok(managed.files.includes(".github/workflows/factory-ci.yml"));
  assert.ok(!managed.files.includes("CLAUDE.md"), "seed files are not managed");

  for (const file of [
    "CLAUDE.md",
    ".factory/standards.md",
    ".github/workflows/factory-claude.yml",
  ]) {
    assert.doesNotMatch(
      readFileSync(join(dir, file), "utf8"),
      /\{\{[A-Z_]+\}\}/,
      `${file} has unrendered placeholders`,
    );
  }
});

test("applyTemplates is idempotent, keeps seeds, restores managed, preserves user settings", () => {
  const dir = mkdtempSync(join(tmpdir(), "factory-tpl-"));
  applyTemplates(dir, {
    type: "mobile",
    vars: { ...vars, PRODUCT_TYPE: "mobile" },
  });

  // second run: nothing to do
  assert.equal(
    changed(applyTemplates(dir, { type: "mobile", vars })).length,
    0,
  );

  // product edits a seed file and its settings; someone hand-edits a managed file
  writeFileSync(join(dir, "CLAUDE.md"), "# my own notes\n");
  writeFileSync(join(dir, ".factory/standards.md"), "hand edited\n");
  const settingsFile = join(dir, ".claude/settings.json");
  const s = JSON.parse(readFileSync(settingsFile, "utf8"));
  s.permissions.allow.push("Bash(make *)");
  s.env = { FOO: "1" };
  writeFileSync(settingsFile, JSON.stringify(s, null, 2));

  const changes = applyTemplates(dir, { type: "mobile", vars });
  // Only the hand-edited managed file changes: the user's settings already contain every factory
  // key, so merging them is a no-op.
  assert.deepEqual(
    changed(changes).map((c) => c.path),
    [".factory/standards.md"],
  );
  assert.equal(
    readFileSync(join(dir, "CLAUDE.md"), "utf8"),
    "# my own notes\n",
    "seed file untouched",
  );
  assert.notEqual(
    readFileSync(join(dir, ".factory/standards.md"), "utf8"),
    "hand edited\n",
    "managed file restored",
  );
  const after = JSON.parse(readFileSync(settingsFile, "utf8"));
  assert.ok(
    after.permissions.allow.includes("Bash(make *)"),
    "user permission kept",
  );
  assert.deepEqual(after.env, { FOO: "1" }, "user key kept");
  assert.equal(after.enabledPlugins["factory-mobile@software-factory"], true);
  assert.ok(existsSync(join(dir, "eas.json")), "mobile seed applied");
});

test("dry run writes nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "factory-tpl-"));
  const changes = applyTemplates(dir, { type: "web", vars, dryRun: true });
  assert.ok(changed(changes).length > 0);
  assert.equal(existsSync(join(dir, "CLAUDE.md")), false);
});
