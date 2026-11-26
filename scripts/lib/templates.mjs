// Template rendering and application.
//
// templates/<layer>/<mode>/<path>, layers = "common" then the product type ("web" | "mobile"):
//   seed/     written once if missing; afterwards the product owns the file
//   managed/  overwritten on every sync; listed in .factory/managed.json (protected by the plugin hook)
//   merge/    JSON deep-merged into the existing file (objects merge, arrays union, template scalars win)
// A type layer file replaces a common file at the same path (seed/managed). Merge files accumulate.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { ROOT } from "./config.mjs";
import { fail, normalizeEol, readJson } from "./util.mjs";

export const TEMPLATES_DIR = join(ROOT, "templates");
export const TEMPLATE_VARS = [
  "FACTORY_REPO",
  "FACTORY_REF",
  "MARKETPLACE",
  "PRODUCT_NAME",
  "PRODUCT_DIR",
  "PRODUCT_TYPE",
  "PRODUCT_REPO",
  "DESCRIPTION",
];
const MODES = ["seed", "managed", "merge"];

export function productTypes() {
  return readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        d.name !== "common" &&
        existsSync(join(TEMPLATES_DIR, d.name, "template.json")),
    )
    .map((d) => d.name);
}

export function loadTemplateMeta(type) {
  const file = join(TEMPLATES_DIR, type, "template.json");
  if (!existsSync(file))
    fail(
      `Unknown product type "${type}". Available: ${productTypes().join(", ")}`,
    );
  return readJson(file);
}

export function templateVars(cfg, { name, type, repo, description, dir }) {
  return {
    FACTORY_REPO: cfg.factoryRepo,
    FACTORY_REF: cfg.factoryRef ?? "main",
    MARKETPLACE: cfg.marketplace ?? "software-factory",
    PRODUCT_NAME: name,
    PRODUCT_DIR: dir ?? name,
    PRODUCT_TYPE: type,
    PRODUCT_REPO: repo ?? "",
    DESCRIPTION: description || `${name} (${type})`,
  };
}

/** Replace {{KEY}} for known keys only, so GitHub's ${{ expr }} and unknown text pass through untouched. */
export function render(text, vars) {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (m, key) =>
    Object.hasOwn(vars, key) ? String(vars[key]) : m,
  );
}

function walk(dir, base = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const abs = join(dir, entry.name);
    return entry.isDirectory()
      ? walk(abs, base)
      : [relative(base, abs).split(sep).join("/")];
  });
}

/** @returns {Map<string, {mode: string, sources: string[]}>} keyed by repo-relative path */
export function collectFiles(type) {
  const files = new Map();
  for (const layer of ["common", type]) {
    for (const mode of MODES) {
      const dir = join(TEMPLATES_DIR, layer, mode);
      for (const rel of walk(dir)) {
        const src = join(dir, rel);
        const existing = files.get(rel);
        if (existing && existing.mode !== mode)
          fail(
            `Template conflict: ${rel} is "${existing.mode}" in one layer and "${mode}" in another.`,
          );
        if (mode === "merge" && existing) existing.sources.push(src);
        else files.set(rel, { mode, sources: [src] });
      }
    }
  }
  return files;
}

export function deepMerge(base, overlay) {
  if (Array.isArray(base) && Array.isArray(overlay)) {
    const seen = new Set(base.map((v) => JSON.stringify(v)));
    return [...base, ...overlay.filter((v) => !seen.has(JSON.stringify(v)))];
  }
  if (isPlainObject(base) && isPlainObject(overlay)) {
    const out = { ...base };
    for (const [k, v] of Object.entries(overlay))
      out[k] = k in base ? deepMerge(base[k], v) : v;
    return out;
  }
  return overlay === undefined ? base : overlay;
}

/** Add keys from `defaults` that are missing in `existing`. Existing values always win. Arrays are not merged. */
export function fillDefaults(existing, defaults) {
  if (!isPlainObject(existing) || !isPlainObject(defaults)) return existing;
  const out = { ...existing };
  for (const [k, v] of Object.entries(defaults)) {
    if (!(k in out)) out[k] = v;
    else if (isPlainObject(out[k]) && isPlainObject(v))
      out[k] = fillDefaults(out[k], v);
  }
  return out;
}

const isPlainObject = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Render and apply templates to a product checkout.
 * @returns {{path: string, mode: string, action: 'created'|'updated'|'unchanged'|'kept'|'error', note?: string}[]}
 */
export function applyTemplates(targetDir, { type, vars, dryRun = false }) {
  const changes = [];
  const managedPaths = [];
  const write = (dest, content) => {
    if (dryRun) return;
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content);
  };

  for (const [rel, { mode, sources }] of [...collectFiles(type)].sort(
    ([a], [b]) => a.localeCompare(b),
  )) {
    const dest = join(targetDir, rel);
    const exists = existsSync(dest);

    if (mode === "seed") {
      if (exists) changes.push({ path: rel, mode, action: "kept" });
      else {
        write(dest, render(readFileSync(sources[0], "utf8"), vars));
        changes.push({ path: rel, mode, action: "created" });
      }
      continue;
    }

    if (mode === "managed") {
      managedPaths.push(rel);
      const content = render(readFileSync(sources[0], "utf8"), vars);
      if (
        exists &&
        normalizeEol(readFileSync(dest, "utf8")) === normalizeEol(content)
      ) {
        changes.push({ path: rel, mode, action: "unchanged" });
      } else {
        write(dest, content);
        changes.push({
          path: rel,
          mode,
          action: exists ? "updated" : "created",
        });
      }
      continue;
    }

    // merge
    let current = {};
    if (exists) {
      try {
        current = JSON.parse(readFileSync(dest, "utf8"));
      } catch (err) {
        changes.push({
          path: rel,
          mode,
          action: "error",
          note: `existing file is not valid JSON (${err.message}); left untouched`,
        });
        continue;
      }
    }
    const overlay = sources
      .map((s) => JSON.parse(render(readFileSync(s, "utf8"), vars)))
      .reduce((acc, o) => deepMerge(acc, o), {});
    const next = JSON.stringify(deepMerge(current, overlay), null, 2) + "\n";
    if (exists && JSON.stringify(current, null, 2) + "\n" === next)
      changes.push({ path: rel, mode, action: "unchanged" });
    else {
      write(dest, next);
      changes.push({ path: rel, mode, action: exists ? "updated" : "created" });
    }
  }

  // The manifest of managed files: the plugin's protect-files hook reads it.
  const manifestRel = ".factory/managed.json";
  const manifest =
    JSON.stringify(
      {
        $comment:
          "Written by the software factory. These files are overwritten by `factory sync`. Change them in the factory repo.",
        factoryRepo: vars.FACTORY_REPO,
        factoryRef: vars.FACTORY_REF,
        files: managedPaths.sort(),
      },
      null,
      2,
    ) + "\n";
  const manifestDest = join(targetDir, manifestRel);
  const manifestExists = existsSync(manifestDest);
  if (
    manifestExists &&
    normalizeEol(readFileSync(manifestDest, "utf8")) === manifest
  ) {
    changes.push({ path: manifestRel, mode: "managed", action: "unchanged" });
  } else {
    write(manifestDest, manifest);
    changes.push({
      path: manifestRel,
      mode: "managed",
      action: manifestExists ? "updated" : "created",
    });
  }
  return changes;
}

export const changed = (changes) =>
  changes.filter((x) => x.action === "created" || x.action === "updated");
