// End-to-end tests for the plugin's hook and verify scripts, run as Claude Code would run them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS = resolve(
  fileURLToPath(import.meta.url),
  "../../../plugins/factory/scripts",
);
const ok = 'node -e "process.exit(0)"';
const failing =
  "node -e \"console.error('boom: lint error'); process.exit(1)\"";

function product(commands, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "factory-hook-"));
  mkdirSync(join(dir, ".factory"));
  writeFileSync(
    join(dir, ".factory/product.json"),
    JSON.stringify({
      name: "demo",
      type: "web",
      commands,
      ci: Object.keys(commands),
      ...extra,
    }),
  );
  writeFileSync(
    join(dir, ".factory/managed.json"),
    JSON.stringify({ factoryRepo: "acme/f", files: [".factory/standards.md"] }),
  );
  const git = (...args) =>
    spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "feat/x");
  git("add", "-A");
  git(
    "-c",
    "user.email=t@t",
    "-c",
    "user.name=t",
    "commit",
    "-q",
    "-m",
    "init",
  );
  return dir;
}

// Like the real CLAUDE_PLUGIN_DATA, hook state lives outside the product repo.
const PLUGIN_DATA = mkdtempSync(join(tmpdir(), "factory-plugin-data-"));

function hook(script, dir, payload, env = {}) {
  return spawnSync(process.execPath, [join(SCRIPTS, script)], {
    input: JSON.stringify({ cwd: dir, session_id: "s1", ...payload }),
    encoding: "utf8",
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: dir,
      CLAUDE_PLUGIN_DATA: PLUGIN_DATA,
      GITHUB_ACTIONS: "",
      ...env,
    },
  });
}

test("guard-bash denies a push to main and stays silent otherwise", () => {
  const dir = product({ lint: ok });
  const denied = hook("guard-bash.mjs", dir, {
    tool_name: "Bash",
    tool_input: { command: "git push origin main" },
  });
  assert.equal(denied.status, 0);
  const out = JSON.parse(denied.stdout);
  assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
  assert.match(
    out.hookSpecificOutput.permissionDecisionReason,
    /protected branch/,
  );

  const allowed = hook("guard-bash.mjs", dir, {
    tool_name: "Bash",
    tool_input: { command: "npm run lint" },
  });
  assert.equal(allowed.status, 0);
  assert.equal(allowed.stdout, "");
});

test("hooks do nothing outside factory products", () => {
  const dir = mkdtempSync(join(tmpdir(), "not-a-product-"));
  const r = hook("guard-bash.mjs", dir, {
    tool_input: { command: "git push origin main" },
  });
  assert.equal(r.stdout, "");
});

test("protect-files blocks managed files and secrets", () => {
  const dir = product({ lint: ok });
  const r = hook("protect-files.mjs", dir, {
    tool_name: "Edit",
    tool_input: { file_path: join(dir, ".factory", "standards.md") },
  });
  assert.equal(
    JSON.parse(r.stdout).hookSpecificOutput.permissionDecision,
    "deny",
  );
  const env = hook("protect-files.mjs", dir, {
    tool_name: "Write",
    tool_input: { file_path: ".env.local" },
  });
  assert.equal(
    JSON.parse(env.stdout).hookSpecificOutput.permissionDecision,
    "deny",
  );
  const fine = hook("protect-files.mjs", dir, {
    tool_name: "Write",
    tool_input: { file_path: join(dir, "src", "a.ts") },
  });
  assert.equal(fine.stdout, "");
});

test("stop-gate: passes clean trees, blocks failing gates, gives up after 2 blocks", () => {
  const dir = product({ lint: failing }, { gates: { onStop: ["lint"] } });
  assert.equal(
    hook("stop-gate.mjs", dir, {}).status,
    0,
    "clean tree: nothing to check",
  );

  writeFileSync(join(dir, "change.ts"), "export const x = 1;\n");
  const first = hook("stop-gate.mjs", dir, {});
  assert.equal(first.status, 2);
  assert.match(first.stderr, /boom: lint error/);
  assert.match(first.stderr, /attempt 1\/2/);
  assert.equal(
    hook("stop-gate.mjs", dir, { stop_hook_active: true }).status,
    2,
  );
  const third = hook("stop-gate.mjs", dir, { stop_hook_active: true });
  assert.equal(third.status, 0, "gives up after MAX_BLOCKS");
  assert.match(third.stdout, /still failing/);
  const fourth = hook("stop-gate.mjs", dir, {});
  assert.equal(fourth.status, 0, "doesn't re-block a state it gave up on");
  assert.equal(fourth.stdout, "");
  writeFileSync(join(dir, "change.ts"), "export const x = 2;\n");
  assert.equal(
    hook("stop-gate.mjs", dir, {}).status,
    2,
    "a new edit re-arms the gate",
  );

  assert.equal(
    hook("stop-gate.mjs", dir, {}, { GITHUB_ACTIONS: "true" }).status,
    0,
    "skipped in CI by default",
  );
  assert.equal(
    hook("stop-gate.mjs", dir, {}, { FACTORY_STOP_GATE: "off" }).status,
    0,
  );
});

test("stop-gate: passing gates are cached for the same tree state", () => {
  const dir = product({ lint: ok }, { gates: { onStop: ["lint"] } });
  writeFileSync(join(dir, "change.ts"), "export const x = 1;\n");
  assert.equal(hook("stop-gate.mjs", dir, {}).status, 0);
  assert.equal(hook("stop-gate.mjs", dir, {}).status, 0);
});

test("verify.mjs reports pass/fail with exit codes", () => {
  const pass = product({ lint: ok, test: ok });
  const r1 = spawnSync(
    process.execPath,
    [join(SCRIPTS, "verify.mjs"), "--dir", pass],
    { encoding: "utf8" },
  );
  assert.equal(r1.status, 0);
  assert.match(r1.stdout, /RESULT: PASS/);

  const fail = product({ lint: ok, test: failing, build: "" });
  const r2 = spawnSync(
    process.execPath,
    [join(SCRIPTS, "verify.mjs"), "--dir", fail, "--json"],
    { encoding: "utf8" },
  );
  assert.equal(r2.status, 1);
  const json = JSON.parse(r2.stdout);
  assert.equal(json.ok, false);
  assert.deepEqual(
    json.results.map((r) => r.status),
    ["pass", "fail", "skipped"],
  );

  const r3 = spawnSync(
    process.execPath,
    [join(SCRIPTS, "verify.mjs"), "--dir", tmpdir()],
    { encoding: "utf8" },
  );
  assert.equal(r3.status, 2, "not a product");
});
