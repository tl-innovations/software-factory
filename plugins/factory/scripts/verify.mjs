#!/usr/bin/env node
// Run the product's quality checks from .factory/product.json and print a compact report.
//
//   node verify.mjs                     run every check listed in "ci"
//   node verify.mjs --only lint,test    run a subset (any key under "commands")
//   node verify.mjs --skip build        run "ci" minus some checks
//   node verify.mjs --install           run commands.install first
//   node verify.mjs --json              machine-readable output
//   node verify.mjs --dir path/to/repo  default: CLAUDE_PROJECT_DIR or cwd
//
// Exit codes: 0 all passed, 1 a check failed, 2 configuration problem.
import { parseArgs } from "node:util";
import { loadProduct, runShell, tail } from "./lib/common.mjs";

const { values } = parseArgs({
  options: {
    only: { type: "string" },
    skip: { type: "string" },
    install: { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    dir: { type: "string" },
    lines: { type: "string", default: "60" },
  },
  allowPositionals: true,
});

const dir = values.dir || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const product = loadProduct(dir);
if (!product)
  exitConfig(
    `No .factory/product.json in ${dir}. Is this a factory product? (Run \`factory adopt\` from the factory repo.)`,
  );
if (product.__error) exitConfig(product.__error);

const list = (s) =>
  s
    ? s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
    : null;
const skip = new Set(list(values.skip) ?? []);
let names = list(values.only) ??
  product.ci ?? ["lint", "typecheck", "test", "build"];
names = names.filter((n) => !skip.has(n));
if (values.install)
  names = ["install", ...names.filter((n) => n !== "install")];

const results = [];
for (const name of names) {
  const cmd = product.commands?.[name];
  if (!cmd) {
    results.push({ name, cmd: null, status: "skipped" });
    continue;
  }
  if (!values.json) process.stderr.write(`→ ${name}: ${cmd}\n`);
  const r = runShell(cmd, { cwd: dir });
  results.push({
    name,
    cmd,
    status: r.ok ? "pass" : "fail",
    seconds: +(r.ms / 1000).toFixed(1),
    timedOut: r.timedOut,
    output: r.ok ? undefined : r.output,
  });
  if (!r.ok && name === "install") break; // nothing else can pass without dependencies
}

const failed = results.filter((r) => r.status === "fail");
if (values.json) {
  process.stdout.write(
    JSON.stringify(
      { product: product.name, ok: failed.length === 0, results },
      null,
      2,
    ) + "\n",
  );
} else {
  const width = Math.max(...results.map((r) => r.name.length), 5);
  const icon = { pass: "✓", fail: "✗", skipped: "-" };
  const lines = [
    `factory verify: ${product.name ?? "(unnamed)"} (${product.type ?? "?"})`,
  ];
  for (const r of results) {
    lines.push(
      `  ${icon[r.status]} ${r.name.padEnd(width)}  ${r.cmd ?? "(no command configured)"}${r.seconds !== undefined ? `  ${r.seconds}s` : ""}${r.timedOut ? "  [timed out]" : ""}`,
    );
  }
  for (const r of failed) {
    lines.push(
      "",
      `--- ${r.name} output (tail) ---`,
      tail(r.output, Number(values.lines) || 60),
    );
  }
  lines.push(
    "",
    failed.length
      ? `RESULT: FAIL (${failed.length} of ${results.filter((r) => r.status !== "skipped").length} failed)`
      : "RESULT: PASS",
  );
  process.stdout.write(lines.join("\n") + "\n");
}
process.exit(failed.length ? 1 : 0);

function exitConfig(message) {
  if (values.json)
    process.stdout.write(JSON.stringify({ ok: false, error: message }) + "\n");
  else process.stderr.write(`factory verify: ${message}\n`);
  process.exit(2);
}
