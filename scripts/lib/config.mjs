// factory.config.json and the product registry.
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fail, readJson, writeJson } from "./util.mjs";

export const ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const CONFIG_FILE = join(ROOT, "factory.config.json");
const REGISTRY_FILE = join(ROOT, "registry", "products.json");

export function loadConfig() {
  const raw = readJson(CONFIG_FILE);
  const abs = (p) => (isAbsolute(p) ? p : resolve(ROOT, p));
  return {
    raw,
    ...raw,
    productsDirAbs: abs(raw.productsDir ?? ".."),
    workspaceDirAbs: abs(raw.workspaceDir ?? ".workspace"),
    fleetRun: {
      model: "sonnet",
      maxTurns: 40,
      permissionMode: "acceptEdits",
      ...(raw.fleetRun ?? {}),
    },
  };
}

export function saveConfig(raw) {
  writeJson(CONFIG_FILE, raw);
}

export function isConfigured(cfg) {
  return (
    Boolean(cfg.factoryRepo) &&
    !cfg.factoryRepo.startsWith("OWNER/") &&
    cfg.githubOwner &&
    cfg.githubOwner !== "OWNER"
  );
}

export function requireConfigured(cfg) {
  if (!isConfigured(cfg))
    fail(
      "factory.config.json still has placeholder values. Run `node scripts/factory.mjs setup` first.",
    );
}

// ---------- registry ----------
export function loadRegistry() {
  if (!existsSync(REGISTRY_FILE))
    return { $schema: "./products.schema.json", products: [] };
  const data = readJson(REGISTRY_FILE);
  data.products ??= [];
  return data;
}

export function saveRegistry(data) {
  data.products.sort((a, b) => a.name.localeCompare(b.name));
  writeJson(REGISTRY_FILE, data);
}

export function upsertProduct(entry) {
  const data = loadRegistry();
  const i = data.products.findIndex(
    (p) => p.name === entry.name || p.repo === entry.repo,
  );
  if (i >= 0) data.products[i] = { ...data.products[i], ...entry };
  else data.products.push(entry);
  saveRegistry(data);
  return entry;
}

/** Filter registry products for fleet commands. Paused/archived are skipped unless `all`. */
export function selectProducts({ only = [], type, all = false } = {}) {
  const { products } = loadRegistry();
  const unknown = only.filter((n) => !products.some((p) => p.name === n));
  if (unknown.length)
    fail(
      `Unknown product(s): ${unknown.join(", ")}. See \`node scripts/factory.mjs list\`.`,
    );
  return products.filter(
    (p) =>
      (only.length
        ? only.includes(p.name)
        : all || !["paused", "archived"].includes(p.status)) &&
      (!type || p.type === type),
  );
}
