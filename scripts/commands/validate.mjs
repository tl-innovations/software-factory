import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parseArgs } from "node:util";
import { loadRegistry, ROOT } from "../lib/config.mjs";
import {
  collectFiles,
  productTypes,
  render,
  TEMPLATE_VARS,
  TEMPLATES_DIR,
} from "../lib/templates.mjs";
import { bad, c, has, info, ok, readJson, run, warn } from "../lib/util.mjs";

export const help = `validate [--no-claude]
    Lint the factory itself: JSON files, template placeholders, marketplace ↔ plugin manifests,
    skill/agent frontmatter, hook script paths, template.json and the registry. Also runs
    \`claude plugin validate\` when the claude CLI is available. Used by the factory's own CI.`;

const SKIP_DIRS = new Set([".git", "node_modules", ".workspace"]);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (SKIP_DIRS.has(e.name)) return [];
    const abs = join(dir, e.name);
    return e.isDirectory() ? walk(abs) : [abs];
  });
}

function frontmatter(file) {
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  return Object.fromEntries(
    m[1]
      .split("\n")
      .map((l) => l.match(/^([A-Za-z][\w-]*):\s*(.*)$/))
      .filter(Boolean)
      .map(([, k, v]) => [k, v.replace(/^["']|["']$/g, "")]),
  );
}

export async function validate(argv) {
  const { values } = parseArgs({
    args: argv,
    allowNegative: true,
    options: { claude: { type: "boolean", default: true } },
  });
  const errors = [];
  const err = (msg) => errors.push(msg);
  const rel = (p) => relative(ROOT, p).split(sep).join("/");
  const files = walk(ROOT);

  // 1. JSON parses (templates are checked after rendering, below).
  for (const f of files.filter(
    (f) => f.endsWith(".json") && !rel(f).startsWith("templates/"),
  )) {
    try {
      readJson(f);
    } catch (e) {
      err(`${rel(f)}: invalid JSON (${e.message})`);
    }
  }

  // 2. Template placeholders are known, and rendered JSON templates parse.
  const dummy = Object.fromEntries(
    TEMPLATE_VARS.map((k) => [k, `x-${k.toLowerCase()}`]),
  );
  for (const f of walk(TEMPLATES_DIR)) {
    const text = readFileSync(f, "utf8");
    for (const [, key] of text.matchAll(/\{\{([A-Z_]+)\}\}/g))
      if (!TEMPLATE_VARS.includes(key))
        err(`${rel(f)}: unknown placeholder {{${key}}}`);
    if (/__[A-Z_]+__/.test(text))
      err(`${rel(f)}: looks like an old __PLACEHOLDER__ (use {{KEY}})`);
    if (f.endsWith(".json")) {
      try {
        JSON.parse(render(text, dummy));
      } catch (e) {
        err(`${rel(f)}: invalid JSON after rendering (${e.message})`);
      }
    }
  }
  for (const type of productTypes()) {
    try {
      collectFiles(type);
    } catch (e) {
      err(`templates/${type}: ${e.message}`);
    }
    const meta = readJson(join(TEMPLATES_DIR, type, "template.json"));
    if (meta.type !== type)
      err(`templates/${type}/template.json: type is "${meta.type}"`);
    for (const k of meta.product?.ci ?? [])
      if (!(k in (meta.product?.commands ?? {})))
        err(`templates/${type}/template.json: ci "${k}" has no command`);
    for (const k of meta.product?.gates?.onStop ?? [])
      if (!(k in (meta.product?.commands ?? {})))
        err(`templates/${type}/template.json: gate "${k}" has no command`);
  }

  // 3. Marketplace ↔ plugins.
  const marketplace = readJson(
    join(ROOT, ".claude-plugin", "marketplace.json"),
  );
  for (const entry of marketplace.plugins ?? []) {
    if (typeof entry.source !== "string") continue;
    const dir = join(ROOT, entry.source);
    const manifestFile = join(dir, ".claude-plugin", "plugin.json");
    if (!existsSync(manifestFile)) {
      err(
        `marketplace plugin "${entry.name}": ${entry.source}/.claude-plugin/plugin.json missing`,
      );
      continue;
    }
    const manifest = readJson(manifestFile);
    if (manifest.name !== entry.name)
      err(
        `${rel(manifestFile)}: name "${manifest.name}" ≠ marketplace entry "${entry.name}"`,
      );
    if (!/^\d+\.\d+\.\d+/.test(manifest.version ?? ""))
      err(`${rel(manifestFile)}: set a semver "version" so updates propagate`);

    for (const skillDir of existsSync(join(dir, "skills"))
      ? readdirSync(join(dir, "skills"))
      : []) {
      const file = join(dir, "skills", skillDir, "SKILL.md");
      const fm = existsSync(file) ? frontmatter(file) : null;
      if (!fm) err(`${rel(file)}: missing or no frontmatter`);
      else {
        if (!fm.description)
          err(`${rel(file)}: frontmatter needs a description`);
        if (fm.name && fm.name !== skillDir)
          err(`${rel(file)}: name "${fm.name}" ≠ folder "${skillDir}"`);
      }
    }
    for (const agent of existsSync(join(dir, "agents"))
      ? readdirSync(join(dir, "agents")).filter((f) => f.endsWith(".md"))
      : []) {
      const fm = frontmatter(join(dir, "agents", agent));
      if (!fm?.name || !fm?.description)
        err(
          `${rel(join(dir, "agents", agent))}: frontmatter needs name and description`,
        );
    }
    const hooksFile = join(dir, "hooks", "hooks.json");
    if (existsSync(hooksFile)) {
      const text = readFileSync(hooksFile, "utf8");
      for (const [, script] of text.matchAll(
        /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"\\\s]+)/g,
      )) {
        if (!existsSync(join(dir, script)))
          err(`${rel(hooksFile)}: references missing ${script}`);
      }
    }
  }

  // 4. Registry.
  const { products } = loadRegistry();
  const types = productTypes();
  const seen = new Set();
  for (const p of products) {
    for (const k of ["name", "repo", "type", "status"])
      if (!p[k])
        err(`registry: product ${JSON.stringify(p.name ?? p)} missing "${k}"`);
    if (p.type && !types.includes(p.type))
      err(`registry: ${p.name} has unknown type "${p.type}"`);
    if (
      p.status &&
      !["active", "maintenance", "paused", "archived"].includes(p.status)
    )
      err(`registry: ${p.name} has unknown status "${p.status}"`);
    for (const key of [p.name, p.repo]) {
      if (seen.has(key)) err(`registry: duplicate ${key}`);
      seen.add(key);
    }
  }

  // 5. Claude Code's own validator.
  if (values.claude && has("claude")) {
    for (const target of [
      ".",
      ...(marketplace.plugins ?? [])
        .filter((p) => typeof p.source === "string")
        .map((p) => p.source),
    ]) {
      const r = run("claude", ["plugin", "validate", target], {
        cwd: ROOT,
        allowFail: true,
      });
      if (r.code !== 0)
        err(
          `claude plugin validate ${target}:\n${(r.stdout + r.stderr).trim()}`,
        );
      else info(c.dim(`claude plugin validate ${target}: ok`));
    }
  } else if (values.claude)
    warn("claude CLI not found: skipped `claude plugin validate`.");

  if (errors.length) {
    for (const e of errors) bad(e);
    process.exitCode = 1;
  } else
    ok(
      `Factory valid (${products.length} product(s), ${(marketplace.plugins ?? []).length} plugin(s), ${types.length} product type(s))`,
    );
}
