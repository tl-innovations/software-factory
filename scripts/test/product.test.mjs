import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildManifest,
  detect,
  readProduct,
  writeProduct,
} from "../lib/product.mjs";
import { loadTemplateMeta } from "../lib/templates.mjs";

function repo(files) {
  const dir = mkdtempSync(join(tmpdir(), "factory-detect-"));
  for (const [name, content] of Object.entries(files))
    writeFileSync(
      join(dir, name),
      typeof content === "string" ? content : JSON.stringify(content),
    );
  return dir;
}

test("detects a Next.js app (npm, no tests yet)", () => {
  const dir = repo({
    "package.json": {
      scripts: {
        dev: "next dev",
        build: "next build",
        lint: "eslint",
        test: 'echo "Error: no test specified" && exit 1',
      },
      dependencies: { next: "16.0.0", react: "19" },
    },
    "package-lock.json": "{}",
    "tsconfig.json": "{}",
  });
  const d = detect(dir);
  assert.equal(d.type, "web");
  assert.equal(d.framework, "next");
  assert.equal(d.packageManager, "npm");
  assert.equal(d.commands.install, "npm ci");
  assert.equal(d.commands.lint, "npm run lint");
  assert.equal(d.commands.typecheck, "npx tsc --noEmit");
  assert.equal(
    d.commands.test,
    "",
    "npm init placeholder test script is ignored",
  );
  assert.deepEqual(d.ci, ["lint", "typecheck", "build"]);
  assert.deepEqual(d.gates.onStop, ["lint", "typecheck"]);
  assert.equal(d.deploy, "vercel");
});

test("detects an Expo app with pnpm", () => {
  const dir = repo({
    "package.json": {
      scripts: {
        start: "expo start",
        lint: "expo lint",
        test: "jest",
        typecheck: "tsc --noEmit",
      },
      dependencies: { expo: "~54.0.0", "react-native": "0.81.0" },
    },
    "pnpm-lock.yaml": "",
  });
  const d = detect(dir);
  assert.equal(d.type, "mobile");
  assert.equal(d.framework, "expo");
  assert.equal(d.commands.install, "pnpm install --frozen-lockfile");
  assert.equal(d.commands.test, "pnpm run test");
  assert.equal(d.commands.typecheck, "pnpm run typecheck");
  assert.equal(d.commands.doctor, "npx expo-doctor");
  assert.deepEqual(d.ci, ["lint", "typecheck", "test", "doctor", "build"]);
  assert.equal(d.deploy, "eas");
});

test("buildManifest uses template defaults when there is no package.json", () => {
  const dir = repo({});
  const m = buildManifest({
    name: "x",
    type: "web",
    templateMeta: loadTemplateMeta("web"),
    detected: detect(dir),
  });
  assert.equal(m.commands.build, "npm run build");
  assert.deepEqual(m.ci, ["lint", "typecheck", "test", "build"]);
  assert.equal(m.autonomy, "supervised");
});

test("writeProduct fills missing keys but never overwrites existing values", () => {
  const dir = repo({});
  const first = buildManifest({
    name: "x",
    type: "web",
    templateMeta: loadTemplateMeta("web"),
    detected: detect(dir),
  });
  assert.equal(writeProduct(dir, first), "created");
  const edited = { ...readProduct(dir), autonomy: "autonomous" };
  delete edited.gates;
  writeFileSync(join(dir, ".factory/product.json"), JSON.stringify(edited));
  assert.equal(writeProduct(dir, first), "updated");
  const after = readProduct(dir);
  assert.equal(after.autonomy, "autonomous");
  assert.deepEqual(after.gates, first.gates);
  assert.equal(writeProduct(dir, first), "unchanged");
});
