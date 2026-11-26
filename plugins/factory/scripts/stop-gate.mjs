#!/usr/bin/env node
// Stop hook: "backpressure". When Claude tries to finish with changed files, run the product's
// fast gates (.factory/product.json → gates.onStop, e.g. ["lint", "typecheck"]). If they fail,
// block the stop (exit 2) so Claude fixes them. Rules:
//   - skips when nothing changed, or when the exact same working-tree state already passed
//   - gives up after MAX_BLOCKS consecutive blocks in a session (no infinite loops)
//   - skipped in GitHub Actions unless FACTORY_GATES_IN_CI=1; disable locally with FACTORY_STOP_GATE=off
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readStdinJson,
  projectDir,
  loadProduct,
  runShell,
  git,
  tail,
} from "./lib/common.mjs";

const MAX_BLOCKS = 2;
const GATE_TIMEOUT_MS = 4 * 60 * 1000;

const input = readStdinJson();
if (process.env.FACTORY_STOP_GATE === "off") process.exit(0);
if (
  process.env.GITHUB_ACTIONS === "true" &&
  process.env.FACTORY_GATES_IN_CI !== "1"
)
  process.exit(0);

const dir = projectDir(input);
const product = loadProduct(dir);
if (!product || product.__error) process.exit(0);
const gates = (product.gates?.onStop ?? []).filter(
  (name) => product.commands?.[name],
);
if (!gates.length) process.exit(0);

const status = git(["status", "--porcelain=v1", "-uall"], dir);
if (status === null) process.exit(0); // not a git repo

const stateDir =
  process.env.CLAUDE_PLUGIN_DATA || join(tmpdir(), "factory-plugin");
const stateFile = join(stateDir, `stop-gate-${hash(dir).slice(0, 16)}.json`);
const state = readState();
const session = input.session_id || "default";

if (!status.trim()) {
  saveState({ ...state, blocks: {} });
  process.exit(0);
}

const fingerprint = hash(
  [
    status,
    git(["diff", "HEAD"], dir) ?? git(["diff"], dir) ?? "",
    untrackedStamp(status),
  ].join("\n"),
);
// Skip states that already passed, and states we already gave up on (e.g. pre-existing failures).
// Any new edit changes the fingerprint and re-arms the gate.
if (state.lastPassed === fingerprint || state.gaveUp === fingerprint)
  process.exit(0);

const failures = [];
for (const name of gates) {
  const cmd = product.commands[name];
  const r = runShell(cmd, { cwd: dir, timeoutMs: GATE_TIMEOUT_MS });
  if (!r.ok) failures.push({ name, cmd, r });
}

if (!failures.length) {
  saveState({ ...state, lastPassed: fingerprint, blocks: {} });
  process.exit(0);
}

const blocks = state.blocks?.[session] ?? 0;
if (blocks >= MAX_BLOCKS) {
  saveState({
    ...state,
    gaveUp: fingerprint,
    blocks: { ...state.blocks, [session]: 0 },
  });
  process.stdout.write(
    JSON.stringify({
      systemMessage: `[factory] Stop gate still failing (${failures.map((f) => f.name).join(", ")}) after ${MAX_BLOCKS} attempts. Letting Claude stop. Check the failures before shipping.`,
    }),
  );
  process.exit(0);
}

saveState({ ...state, blocks: { ...state.blocks, [session]: blocks + 1 } });
const details = failures
  .map(
    ({ name, cmd, r }) =>
      `✗ ${name} (\`${cmd}\`)${r.timedOut ? " [timed out]" : ""}\n${tail(r.output, 40)}`,
  )
  .join("\n\n");
process.stderr.write(
  `[factory] Quality gate failed on your current changes (attempt ${blocks + 1}/${MAX_BLOCKS}):\n\n${details}\n\n` +
    "Fix these before finishing. If a failure is pre-existing or genuinely out of scope, stop and tell the user exactly that. Don't suppress or weaken the check.\n",
);
process.exit(2);

function hash(text) {
  return createHash("sha256").update(text).digest("hex");
}

function untrackedStamp(porcelain) {
  return porcelain
    .split(/\r?\n/)
    .filter((l) => l.startsWith("?? "))
    .map((l) => {
      const p = l.slice(3).replace(/^"|"$/g, "");
      try {
        const s = statSync(join(dir, p));
        return `${p}:${s.size}:${s.mtimeMs}`;
      } catch {
        return p;
      }
    })
    .join("\n");
}

function readState() {
  try {
    return existsSync(stateFile)
      ? JSON.parse(readFileSync(stateFile, "utf8"))
      : {};
  } catch {
    return {};
  }
}

function saveState(next) {
  try {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(stateFile, JSON.stringify(next));
  } catch {
    // State is an optimization; never fail the hook because of it.
  }
}
