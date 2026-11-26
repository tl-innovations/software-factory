import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  loadConfig,
  requireConfigured,
  selectProducts,
  ROOT,
} from "../lib/config.mjs";
import {
  commitAll,
  commitsAhead,
  defaultBranch,
  ensureClone,
  git,
  isDirty,
  openPr,
  pushBranch,
  startBranch,
} from "../lib/git.mjs";
import {
  bad,
  c,
  confirm,
  fail,
  info,
  log,
  ok,
  run as exec,
  slugify,
  splitList,
  table,
  today,
  warn,
} from "../lib/util.mjs";

export const help = `run "<prompt>" | --prompt-file <file>  [--only a,b] [--type web|mobile] [--all]
        [--model sonnet] [--max-turns 40] [--branch name] [--no-pr] [--dry-run] [--yes]
    Run one headless Claude Code task in every selected product (one at a time). Each gets a fresh
    branch from its default branch, then the runner commits, pushes and opens a PR. Uses your
    subscription: fleet runs share usage limits with your interactive sessions.`;

const FLEET_PROMPT = `You are running unattended as one step of a software-factory fleet run across many repositories.
- Do not ask questions; make reasonable assumptions and list them in your final summary.
- Make the requested change in THIS repository only, following CLAUDE.md and .factory/standards.md.
- Before finishing, run the checks listed under "ci" in .factory/product.json (the factory verify skill does this) and fix what you broke.
- Do NOT commit, push, or open pull requests. The fleet runner does that after you finish.
- If the request does not apply to this repository, change nothing and explain why.
- End with a short summary: what changed, the check results, assumptions, and anything left undone.`;

export async function run(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    allowNegative: true,
    options: {
      "prompt-file": { type: "string" },
      only: { type: "string" },
      type: { type: "string" },
      all: { type: "boolean", default: false },
      model: { type: "string" },
      "max-turns": { type: "string" },
      branch: { type: "string" },
      pr: { type: "boolean", default: true },
      "dry-run": { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
    },
  });
  const prompt = values["prompt-file"]
    ? readFileSync(values["prompt-file"], "utf8")
    : positionals.join(" ");
  if (!prompt.trim()) fail('Usage: run "<prompt>" [--only a,b]');
  const cfg = loadConfig();
  requireConfigured(cfg);

  const products = selectProducts({
    only: splitList(values.only),
    type: values.type,
    all: values.all,
  });
  if (!products.length) return warn("No products selected.");
  const slug = slugify(prompt.split(/\r?\n/)[0]);
  const branch = values.branch ?? `factory/run-${slug}`;
  const model = values.model ?? cfg.fleetRun.model;
  const maxTurns = String(values["max-turns"] ?? cfg.fleetRun.maxTurns);

  info(
    `Fleet run on ${products.length} product(s): ${products.map((p) => p.name).join(", ")}`,
  );
  log(
    `  branch=${branch} model=${model} max-turns=${maxTurns} permission-mode=${cfg.fleetRun.permissionMode}`,
  );
  if (values["dry-run"]) return info("Dry run: nothing executed.");
  if (products.length > 1 && !values.yes) {
    warn(
      "Each product is a full Claude Code session and counts against your subscription usage.",
    );
    if (!(await confirm("Proceed?")))
      return info("Cancelled. (Pass --yes to skip this prompt.)");
  }

  const claude = resolveClaude();
  const logDir = join(cfg.workspaceDirAbs, "runs", `${today()}-${slug}`);
  mkdirSync(logDir, { recursive: true });
  // Pass the system prompt as a file: multi-line arguments don't survive Windows .cmd shims.
  const systemPromptFile = join(logDir, "fleet-system-prompt.md");
  writeFileSync(systemPromptFile, FLEET_PROMPT);
  const rows = [];

  for (const product of products) {
    info(`${c.bold(product.name)}: running Claude…`);
    try {
      const dir = ensureClone(product, cfg);
      const base = defaultBranch(dir);
      startBranch(dir, branch, base);
      installDeps(dir);
      const res = exec(
        claude.cmd,
        [
          "-p",
          "--output-format",
          "json",
          "--model",
          model,
          "--max-turns",
          maxTurns,
          "--permission-mode",
          cfg.fleetRun.permissionMode,
          "--append-system-prompt-file",
          systemPromptFile,
          ...sessionArgs(dir, product.type),
        ],
        {
          cwd: dir,
          input: prompt,
          allowFail: true,
          shell: claude.shell,
          timeoutMs: 60 * 60 * 1000,
        },
      );
      writeFileSync(
        join(logDir, `${product.name}.json`),
        res.stdout || res.stderr,
      );
      let result = {};
      try {
        result = JSON.parse(res.stdout);
      } catch {
        result = {
          result: (res.stdout || res.stderr).slice(-2000),
          is_error: res.code !== 0,
        };
      }
      const summary = String(result.result ?? "").trim();
      if (res.code !== 0 || result.is_error)
        warn(
          `  Claude exited with ${res.code}${result.subtype ? ` (${result.subtype})` : ""}`,
        );

      if (!isDirty(dir) && commitsAhead(dir, base) === 0) {
        rows.push([
          product.name,
          "no changes",
          summary.split("\n")[0].slice(0, 80),
        ]);
        git(["checkout", "--quiet", base], dir);
        continue;
      }
      const title = `chore(factory): ${prompt.split(/\r?\n/)[0].slice(0, 60)}`;
      commitAll(
        dir,
        `${title}\n\nFleet run via the software factory.\n\nPrompt:\n${prompt}`,
      );
      if (!values.pr) {
        rows.push([product.name, "committed locally", dir]);
        continue;
      }
      pushBranch(dir, branch);
      const pr = openPr(dir, {
        base,
        head: branch,
        title,
        body: `Automated fleet run from the software factory.\n\n### Prompt\n\n${prompt}\n\n### Claude's summary\n\n${summary || "_(no summary returned)_"}\n\n---\nReview carefully: this was produced unattended. Model: \`${model}\`.`,
      });
      rows.push([
        product.name,
        pr.created ? "PR opened" : "PR updated",
        pr.url,
      ]);
      ok(`  ${pr.url}`);
    } catch (err) {
      bad(`  ${err.message.split("\n")[0]}`);
      rows.push([product.name, c.red("error"), err.message.split("\n")[0]]);
    }
  }
  log("");
  table(rows, ["PRODUCT", "RESULT", "DETAIL"]);
  log(c.dim(`Full Claude output per product: ${logDir}`));
}

/**
 * Fresh clones have no node_modules: without them the stop gate and every check fail, and Claude
 * burns its turns on environment errors. Install deterministically before Claude starts.
 */
function installDeps(dir) {
  let install = "";
  try {
    install =
      JSON.parse(readFileSync(join(dir, ".factory", "product.json"), "utf8"))
        .commands?.install ?? "";
  } catch {
    /* no manifest: nothing to install */
  }
  if (!install) return;
  log(c.dim(`  installing: ${install}`));
  const r = exec(install, [], {
    cwd: dir,
    shell: true,
    allowFail: true,
    timeoutMs: 15 * 60 * 1000,
  });
  if (r.code !== 0) {
    const tail = (r.stderr || r.stdout || "").trim().split("\n").slice(-5);
    warn(
      `  install failed (${r.code}). Claude will start anyway and report it.`,
    );
    for (const line of tail) log(c.dim(`    ${line}`));
  }
}

/**
 * Workspace clones are never "trusted" folders, so headless Claude ignores the project's
 * permissions.allow and may not load project-enabled plugins. Pass both explicitly: the product's
 * own allow/deny lists, plus the factory plugins from this checkout (the version being rolled out).
 * User-level settings are excluded so a fleet run behaves the same on every operator machine.
 */
export function sessionArgs(dir, type) {
  // Reproducible runs: skip the operator's personal ~/.claude settings (their hooks, formatters and
  // plugins would otherwise run inside every product). Project settings and auth still apply.
  const args = ["--setting-sources", "project,local"];
  for (const name of ["factory", `factory-${type}`]) {
    const pluginDir = join(ROOT, "plugins", name);
    if (existsSync(join(pluginDir, ".claude-plugin", "plugin.json")))
      args.push("--plugin-dir", pluginDir);
  }
  let perms = {};
  try {
    perms =
      JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf8"))
        .permissions ?? {};
  } catch {
    /* no project settings: rely on permission mode + hooks */
  }
  if (perms.allow?.length) args.push("--allowedTools", ...perms.allow);
  if (perms.deny?.length) args.push("--disallowedTools", ...perms.deny);
  return args;
}

/** claude is a native executable with the official installer; npm installs a .cmd shim on Windows. */
function resolveClaude() {
  if (
    exec("claude", ["--version"], { allowFail: true, shell: false }).code === 0
  )
    return { cmd: "claude", shell: false };
  if (
    process.platform === "win32" &&
    exec("claude", ["--version"], { allowFail: true, shell: true }).code === 0
  )
    return { cmd: "claude", shell: true };
  fail("claude CLI not found on PATH.");
}
