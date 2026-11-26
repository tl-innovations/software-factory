import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  loadConfig,
  isConfigured,
  selectProducts,
  ROOT,
} from "../lib/config.mjs";
import { ghJson, git, remoteFile } from "../lib/git.mjs";
import { collectFiles, render, templateVars } from "../lib/templates.mjs";
import {
  bad,
  c,
  has,
  info,
  log,
  normalizeEol,
  ok,
  run,
  splitList,
  warn,
} from "../lib/util.mjs";

export const help = `doctor [--only a,b] [--type web|mobile] [--all]
    Check local tools, factory configuration, and each product's compliance (manifest, managed-file
    drift, plugin enablement, CI secret). Exits 1 if anything is broken.`;

export async function doctor(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      only: { type: "string" },
      type: { type: "string" },
      all: { type: "boolean", default: false },
    },
  });
  let errors = 0;
  const check = (cond, good, badMsg, level = "error") => {
    if (cond) ok(good);
    else if (level === "warn") warn(badMsg);
    else {
      bad(badMsg);
      errors++;
    }
  };

  info(c.bold("Local tools"));
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  check(
    nodeMajor >= 20,
    `node ${process.versions.node}`,
    `node ${process.versions.node}: need >= 20`,
  );
  check(has("git"), "git", "git not found");
  const ghAuthed =
    has("gh") && run("gh", ["auth", "status"], { allowFail: true }).code === 0;
  check(
    ghAuthed,
    "gh (authenticated)",
    "gh missing or not logged in. Run `gh auth login`.",
  );
  check(
    has("claude"),
    "claude CLI",
    "claude CLI not found (https://code.claude.com/docs)",
    "warn",
  );

  info(c.bold("Factory"));
  const cfg = loadConfig();
  check(
    isConfigured(cfg),
    `config → ${cfg.factoryRepo}@${cfg.factoryRef}`,
    "factory.config.json has placeholders. Run `setup`.",
  );
  if (isConfigured(cfg) && ghAuthed) {
    const view = ghJson([
      "repo",
      "view",
      cfg.factoryRepo,
      "--json",
      "visibility",
    ]);
    check(
      Boolean(view),
      `${cfg.factoryRepo} exists on GitHub`,
      `${cfg.factoryRepo} not found on GitHub. Push the factory first.`,
    );
    if (view && view.visibility !== "PUBLIC") {
      const access = ghJson([
        "api",
        `repos/${cfg.factoryRepo}/actions/permissions/access`,
      ]);
      check(
        access && access.access_level !== "none",
        `private factory: workflow access = ${access?.access_level}`,
        "Private factory repo: product repos cannot call its reusable workflows. See `setup` output.",
      );
      warn(
        "Private factory: CI cannot install plugins from it (claude-agent install-plugins). Consider making it public.",
      );
    }
    const dirty = git(
      [
        "status",
        "--porcelain",
        "--",
        "templates",
        "plugins",
        ".github",
        ".claude-plugin",
      ],
      ROOT,
    ).stdout.trim();
    check(
      !dirty,
      "templates/plugins/workflows committed",
      "Uncommitted factory changes in templates/plugins/.github: commit & push before `sync`.",
      "warn",
    );
  }

  const products = selectProducts({
    only: splitList(values.only),
    type: values.type,
    all: values.all,
  });
  for (const p of products) {
    info(c.bold(`${p.name} (${p.repo})`));
    if (!ghAuthed || !isConfigured(cfg)) {
      warn("skipped (gh or config not ready)");
      continue;
    }
    const repo = ghJson(["repo", "view", p.repo, "--json", "defaultBranchRef"]);
    if (!repo) {
      bad("repo not reachable");
      errors++;
      continue;
    }
    const ref = repo.defaultBranchRef?.name ?? "main";
    const manifestText = remoteFile(p.repo, ".factory/product.json", ref);
    let manifest = null;
    try {
      manifest = manifestText ? JSON.parse(manifestText) : null;
    } catch {
      /* reported below */
    }
    check(
      Boolean(manifest),
      ".factory/product.json present",
      manifestText
        ? ".factory/product.json is invalid JSON"
        : `.factory/product.json missing on ${ref}. Run \`adopt\`/\`sync\`.`,
    );
    if (manifest) {
      check(
        manifest.type === p.type,
        `type = ${p.type}`,
        `manifest type "${manifest.type}" ≠ registry type "${p.type}"`,
      );
      const missing = (manifest.ci ?? []).filter(
        (k) => !manifest.commands?.[k],
      );
      check(
        !missing.length,
        `ci = [${(manifest.ci ?? []).join(", ")}]`,
        `ci lists commands with no value: ${missing.join(", ")}`,
        "warn",
      );
    }

    const vars = templateVars(cfg, { ...p, defaultBranch: ref });
    const drift = [];
    for (const [rel, { mode, sources }] of collectFiles(p.type)) {
      if (mode !== "managed") continue;
      const remote = remoteFile(p.repo, rel, ref);
      const expected = render(
        readFileSync(sources[0], "utf8"),
        vars,
      );
      if (remote === null || normalizeEol(remote) !== normalizeEol(expected))
        drift.push(rel);
    }
    check(
      !drift.length,
      "managed files in sync",
      `managed files out of date: ${drift.join(", ")}. Run \`sync --only ${p.name}\`.`,
      "warn",
    );

    const settingsText = remoteFile(p.repo, ".claude/settings.json", ref);
    let settings = null;
    try {
      settings = settingsText ? JSON.parse(settingsText) : null;
    } catch {
      /* reported below */
    }
    const pluginId = `factory@${cfg.marketplace}`;
    check(
      settings?.enabledPlugins?.[pluginId] === true,
      `${pluginId} enabled in .claude/settings.json`,
      `${pluginId} not enabled in .claude/settings.json`,
      "warn",
    );

    const secrets = ghJson([
      "secret",
      "list",
      "--repo",
      p.repo,
      "--json",
      "name",
    ]);
    if (secrets === null) warn("could not list secrets (needs admin access)");
    else
      check(
        secrets.some((s) => s.name === "CLAUDE_CODE_OAUTH_TOKEN"),
        "CLAUDE_CODE_OAUTH_TOKEN secret set",
        "CLAUDE_CODE_OAUTH_TOKEN secret missing: @claude and PR review will fail",
        "warn",
      );
  }

  log("");
  if (errors) {
    bad(`${errors} problem(s) found`);
    process.exitCode = 1;
  } else ok("No blocking problems");
}
