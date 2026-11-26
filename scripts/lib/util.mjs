// Process, output and small helpers for the factory CLI. Zero dependencies.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const isWin = process.platform === "win32";
// These are .cmd shims on Windows and need a shell to resolve. git, gh and claude are real executables.
const WIN_SHIMS = new Set(["npm", "npx", "pnpm", "yarn", "bun", "corepack"]);

export class CommandError extends Error {
  constructor(cmd, args, result) {
    const detail = (result.stderr || result.stdout || "")
      .trim()
      .split(/\r?\n/)
      .slice(-15)
      .join("\n");
    super(
      `\`${[cmd, ...args].join(" ")}\` exited with ${result.code}${detail ? `\n${detail}` : ""}`,
    );
    this.result = result;
  }
}

function quoteWin(arg) {
  return /[\s"&|<>^()*]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

/**
 * Run an executable with an argument array (no shell, except Windows .cmd shims).
 * @returns {{code: number, stdout: string, stderr: string}}
 */
export function run(
  cmd,
  args = [],
  {
    cwd,
    input,
    allowFail = false,
    inherit = false,
    env,
    timeoutMs,
    shell,
  } = {},
) {
  const useShell = shell ?? (isWin && WIN_SHIMS.has(cmd));
  const res = spawnSync(
    useShell ? [cmd, ...args.map(quoteWin)].join(" ") : cmd,
    useShell ? [] : args,
    {
      cwd,
      input,
      shell: useShell,
      encoding: "utf8",
      env: env ? { ...process.env, ...env } : process.env,
      stdio: inherit
        ? [input !== undefined ? "pipe" : "inherit", "inherit", "inherit"]
        : "pipe",
      maxBuffer: 256 * 1024 * 1024,
      timeout: timeoutMs,
      windowsHide: true,
    },
  );
  const result = {
    code: res.error ? -1 : (res.status ?? -1),
    stdout: res.stdout ?? "",
    stderr: res.error
      ? `${res.error.message}\n${res.stderr ?? ""}`
      : (res.stderr ?? ""),
  };
  if (result.code !== 0 && !allowFail)
    throw new CommandError(cmd, args, result);
  return result;
}

/** Run a full shell command string (used for template scaffold commands). */
export function sh(command, { cwd, allowFail = false } = {}) {
  const res = spawnSync(command, {
    cwd,
    shell: true,
    stdio: "inherit",
    windowsHide: true,
  });
  const code = res.status ?? -1;
  if (code !== 0 && !allowFail)
    throw new Error(`\`${command}\` exited with ${code}`);
  return code;
}

export function has(cmd) {
  return run(cmd, ["--version"], { allowFail: true }).code === 0;
}

// ---------- output ----------
const color = !process.env.NO_COLOR && process.stdout.isTTY;
const paint = (code) => (s) => (color ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const c = {
  bold: paint(1),
  dim: paint(2),
  red: paint(31),
  green: paint(32),
  yellow: paint(33),
  cyan: paint(36),
};

export const log = (...a) => console.log(...a);
export const info = (msg) => console.log(`${c.cyan("›")} ${msg}`);
export const ok = (msg) => console.log(`${c.green("✓")} ${msg}`);
export const warn = (msg) => console.log(`${c.yellow("!")} ${msg}`);
export const bad = (msg) => console.log(`${c.red("✗")} ${msg}`);

export class FactoryError extends Error {}
export function fail(msg) {
  throw new FactoryError(msg);
}

export function table(rows, headers) {
  const all = [headers, ...rows].map((r) => r.map((v) => String(v ?? "")));
  const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
  const widths = headers.map((_, i) =>
    Math.max(...all.map((r) => strip(r[i]).length)),
  );
  const fmt = (r) =>
    r.map((v, i) => v + " ".repeat(widths[i] - strip(v).length)).join("  ");
  log(c.bold(fmt(all[0])));
  for (const r of all.slice(1)) log(fmt(r));
}

// ---------- files ----------
export function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}
export function writeJson(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}
export const normalizeEol = (s) => s.replace(/\r\n/g, "\n");

// ---------- misc ----------
export function slugify(text, maxWords = 6) {
  return (
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .trim()
      .split(/[\s-]+/)
      .filter(Boolean)
      .slice(0, maxWords)
      .join("-") || "change"
  );
}
export const today = () => new Date().toISOString().slice(0, 10);
export const isValidName = (n) => /^[a-z0-9][a-z0-9-]*$/.test(n);
export const splitList = (s) =>
  s
    ? String(s)
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
    : [];

export async function confirm(question) {
  if (!process.stdin.isTTY) return false;
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}
