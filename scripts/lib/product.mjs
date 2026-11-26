// Detect a repo's stack and build its .factory/product.json manifest.
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { fillDefaults } from "./templates.mjs";

const readJsonSafe = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

/** Inspect a checkout and infer type, framework, package manager, commands and deploy target. */
export function detect(dir) {
  const has = (f) => existsSync(join(dir, f));
  const pkg = readJsonSafe(join(dir, "package.json"));
  const deps = {
    ...(pkg?.dependencies ?? {}),
    ...(pkg?.devDependencies ?? {}),
  };
  const scripts = pkg?.scripts ?? {};

  const pm = has("pnpm-lock.yaml")
    ? "pnpm"
    : has("yarn.lock")
      ? "yarn"
      : has("bun.lockb") || has("bun.lock")
        ? "bun"
        : "npm";
  const isExpo = "expo" in deps;
  const type = isExpo || "react-native" in deps ? "mobile" : "web";
  const framework = isExpo
    ? "expo"
    : "react-native" in deps
      ? "react-native"
      : "next" in deps
        ? "next"
        : "astro" in deps
          ? "astro"
          : "@remix-run/react" in deps || "@react-router/dev" in deps
            ? "remix"
            : "nuxt" in deps
              ? "nuxt"
              : "@sveltejs/kit" in deps
                ? "sveltekit"
                : "gatsby" in deps
                  ? "gatsby"
                  : "vite" in deps
                    ? "vite"
                    : pkg
                      ? "node"
                      : "static";

  const runScript = (s) =>
    ({
      npm: `npm run ${s}`,
      pnpm: `pnpm run ${s}`,
      yarn: `yarn run ${s}`,
      bun: `bun run ${s}`,
    })[pm];
  const script = (...names) =>
    names.find((n) => typeof scripts[n] === "string" && scripts[n].trim());
  const install = {
    npm: has("package-lock.json") ? "npm ci" : "npm install",
    pnpm: "pnpm install --frozen-lockfile",
    yarn: "yarn install --frozen-lockfile",
    bun: "bun install --frozen-lockfile",
  }[pm];

  const testScript = script("test");
  const lintScript = script("lint");
  const typecheckScript = script(
    "typecheck",
    "type-check",
    "check-types",
    "types",
    "tsc",
  );
  const buildScript = script("build");
  const e2eScript = script("test:e2e", "e2e", "playwright");
  const hasPlaywrightConfig = readdirSafe(dir).some((f) =>
    /^playwright\.config\.(t|j|mj|cj)s$/.test(f),
  );

  const commands = {
    install: pkg ? install : "",
    dev: script("dev")
      ? runScript(script("dev"))
      : isExpo
        ? "npx expo start"
        : script("start")
          ? runScript("start")
          : "",
    lint: lintScript ? runScript(lintScript) : isExpo ? "npx expo lint" : "",
    typecheck: typecheckScript
      ? runScript(typecheckScript)
      : has("tsconfig.json")
        ? // Next.js 15.5+ declares route types (LayoutProps, PageProps) in gitignored .next/types;
          // generate them first or tsc fails on every clean checkout (CI, fresh clones).
          (framework === "next" ? "npx next typegen && " : "") + tscCommand(dir)
        : "",
    test:
      testScript && !/no test specified/i.test(scripts.test)
        ? runScript("test")
        : "",
    build: buildScript
      ? runScript(buildScript)
      : isExpo
        ? "npx expo export --output-dir dist"
        : "",
    e2e: e2eScript
      ? runScript(e2eScript)
      : hasPlaywrightConfig
        ? "npx playwright test"
        : "",
  };
  if (isExpo) commands.doctor = "npx expo-doctor";

  const ci = [
    "lint",
    "typecheck",
    "test",
    ...(isExpo ? ["doctor"] : []),
    "build",
  ].filter((k) => commands[k]);
  const onStop = ["lint", "typecheck"].filter((k) => commands[k]);

  const deploy =
    has("eas.json") || isExpo
      ? "eas"
      : has("vercel.json") || "next" in deps
        ? "vercel"
        : has("netlify.toml")
          ? "netlify"
          : has("wrangler.toml") ||
              has("wrangler.json") ||
              has("wrangler.jsonc")
            ? "cloudflare"
            : has("firebase.json")
              ? "firebase"
              : "";

  return {
    hasPackageJson: Boolean(pkg),
    type,
    framework,
    packageManager: pm,
    commands,
    ci,
    gates: { onStop },
    deploy,
  };
}

function readdirSafe(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * A "solution-style" tsconfig (Vite, Astro, monorepos: `files: []` + `references`) makes plain
 * `tsc --noEmit` check nothing and exit 0 even with type errors. Build mode follows the references.
 */
function tscCommand(dir) {
  let raw = "";
  try {
    raw = readFileSync(join(dir, "tsconfig.json"), "utf8");
  } catch {
    /* unreadable: fall through to the plain command */
  }
  return /"references"\s*:\s*\[\s*\{/.test(raw)
    ? "npx tsc -b --noEmit"
    : "npx tsc --noEmit";
}

/**
 * Build a product manifest. When the checkout has a package.json, detected commands win
 * (including empty ones, i.e. "this repo has no tests yet"); otherwise template defaults are used.
 */
export function buildManifest({
  name,
  type,
  description,
  templateMeta,
  detected,
  defaultBranch,
}) {
  const defaults = structuredClone(templateMeta.product);
  const fromRepo = detected?.hasPackageJson;
  const manifest = {
    name,
    type,
    description: description || "",
    framework: fromRepo ? detected.framework : defaults.framework,
    packageManager: fromRepo
      ? detected.packageManager
      : defaults.packageManager,
    nodeVersion: defaults.nodeVersion ?? "lts/*",
    autonomy: defaults.autonomy ?? "supervised",
    commands: fromRepo ? detected.commands : defaults.commands,
    ci: fromRepo ? detected.ci : defaults.ci,
    gates: fromRepo ? detected.gates : defaults.gates,
    deploy: {
      ...(defaults.deploy ?? {}),
      ...(fromRepo && detected.deploy ? { provider: detected.deploy } : {}),
      ...(defaultBranch ? { productionBranch: defaultBranch } : {}),
    },
  };
  if (type === "mobile") manifest.mobile = defaults.mobile ?? {};
  manifest.guard = {
    protectedBranches: [...new Set(["main", "master", defaultBranch].filter(Boolean))],
  };
  return manifest;
}

export function productFile(dir) {
  return join(dir, ".factory", "product.json");
}

export function readProduct(dir) {
  return readJsonSafe(productFile(dir));
}

/** Write the manifest, or fill missing keys into an existing one. @returns 'created'|'updated'|'unchanged' */
export function writeProduct(dir, manifest, { dryRun = false } = {}) {
  const file = productFile(dir);
  const existing = readJsonSafe(file);
  const next = existing ? fillDefaults(existing, manifest) : manifest;
  const text = JSON.stringify(next, null, 2) + "\n";
  if (existing && JSON.stringify(existing, null, 2) + "\n" === text)
    return "unchanged";
  if (!dryRun) {
    mkdirSync(join(dir, ".factory"), { recursive: true });
    writeFileSync(file, text);
  }
  return existing ? "updated" : "created";
}
