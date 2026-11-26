// Shared helpers for the factory plugin's hook and skill scripts. Zero dependencies.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

/** Parse the JSON payload Claude Code sends hooks on stdin. Returns {} on empty/invalid input. */
export function readStdinJson() {
  try {
    const raw = readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function projectDir(input = {}) {
  return process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
}

/** Load .factory/product.json. Returns null when the repo isn't a factory product. */
export function loadProduct(dir) {
  const file = join(dir, ".factory", "product.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    return { __error: `Invalid .factory/product.json: ${err.message}` };
  }
}

/** Load .factory/managed.json (written by `factory sync`): the files this repo must not edit by hand. */
export function loadManaged(dir) {
  const file = join(dir, ".factory", "managed.json");
  if (!existsSync(file)) return { files: [] };
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    return { ...data, files: Array.isArray(data.files) ? data.files : [] };
  } catch {
    return { files: [] };
  }
}

/** Run a shell command string (product commands are shell strings). CI=true avoids watch modes. */
export function runShell(command, { cwd, timeoutMs = 10 * 60 * 1000 } = {}) {
  const started = Date.now();
  const res = spawnSync(command, {
    cwd,
    shell: true,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CI: process.env.CI || "true", FORCE_COLOR: "0" },
  });
  const timedOut = res.error?.code === "ETIMEDOUT" || res.signal === "SIGTERM";
  const output = `${res.stdout || ""}${res.stderr || ""}${res.error && !timedOut ? `\n${res.error.message}` : ""}`;
  return {
    ok: res.status === 0 && !timedOut,
    code: res.status,
    timedOut,
    ms: Date.now() - started,
    output,
  };
}

export function git(args, cwd) {
  const res = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return res.status === 0 ? res.stdout : null;
}

export function currentBranch(cwd) {
  const out = git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  return out ? out.trim() : null;
}

export function tail(text, lines = 60) {
  const all = String(text || "")
    .trimEnd()
    .split(/\r?\n/);
  return all.length <= lines
    ? all.join("\n")
    : [
        `… (${all.length - lines} earlier lines omitted)`,
        ...all.slice(-lines),
      ].join("\n");
}

/** Emit a PreToolUse permission decision ("deny" | "ask") and exit. */
export function decide(decision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: `[factory] ${reason}`,
      },
    }),
  );
  process.exit(0);
}
