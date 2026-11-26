import { parseArgs } from "node:util";
import {
  loadConfig,
  requireConfigured,
  upsertProduct,
  loadRegistry,
} from "../lib/config.mjs";
import {
  commitAll,
  defaultBranch,
  ensureClone,
  openPr,
  pushBranch,
  startBranch,
} from "../lib/git.mjs";
import {
  buildManifest,
  detect,
  readProduct,
  writeProduct,
} from "../lib/product.mjs";
import {
  applyTemplates,
  changed,
  loadTemplateMeta,
  templateVars,
} from "../lib/templates.mjs";
import { c, fail, info, isValidName, log, ok, today } from "../lib/util.mjs";

export const help = `adopt <owner/repo> [--type web|mobile] [--name id] [--description "..."] [--no-pr] [--dry-run]
    Bring an existing repo into the factory: detect its stack, add the manifest + factory files on a
    branch (chore/factory-adopt), open a PR, and register it.`;

const BRANCH = "chore/factory-adopt";

export async function adopt(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    allowNegative: true,
    options: {
      type: { type: "string" },
      name: { type: "string" },
      description: { type: "string", default: "" },
      pr: { type: "boolean", default: true },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const [repo] = positionals;
  if (!repo || !/^[^/\s]+\/[^/\s]+$/.test(repo))
    fail("Usage: adopt <owner/repo>");
  const cfg = loadConfig();
  requireConfigured(cfg);

  const name =
    values.name ??
    repo
      .split("/")[1]
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");
  if (!isValidName(name))
    fail(`"${name}" isn't a valid product id. Pass --name.`);
  const clash = loadRegistry().products.find(
    (p) => p.name === name && p.repo !== repo,
  );
  if (clash)
    fail(`Name "${name}" is already used by ${clash.repo}. Pass --name.`);

  info(`Cloning ${repo} into the workspace…`);
  const dir = ensureClone({ name, repo }, cfg);
  const base = defaultBranch(dir);
  startBranch(dir, BRANCH, base);

  const detected = detect(dir);
  const type = values.type ?? detected.type;
  const meta = loadTemplateMeta(type);
  const existing = readProduct(dir);
  const manifest = buildManifest({
    name,
    type,
    description: values.description || existing?.description,
    templateMeta: meta,
    detected,
  });
  const vars = templateVars(cfg, {
    name,
    type,
    repo,
    description: manifest.description,
  });
  const dryRun = values["dry-run"];

  const productAction = writeProduct(dir, manifest, { dryRun });
  const changes = applyTemplates(dir, { type, vars, dryRun });
  log(`  ${productAction.padEnd(9)} .factory/product.json`);
  for (const ch of changes)
    if (ch.action !== "unchanged")
      log(
        `  ${ch.action.padEnd(9)} ${ch.path}${ch.note ? c.dim(`  (${ch.note})`) : ""}`,
      );
  log(
    c.dim(
      `  detected: ${detected.framework}, ${detected.packageManager}, ci=[${manifest.ci.join(", ")}], deploy=${manifest.deploy?.provider || "?"}`,
    ),
  );

  if (dryRun) return info("Dry run: nothing written.");
  if (!changed(changes).length && productAction === "unchanged")
    return ok(`${repo} is already factory-compliant.`);

  commitAll(
    dir,
    `chore: adopt into the software factory\n\nAdds .factory/product.json, factory standards, CI and Claude workflows.\nFactory: ${cfg.factoryRepo}@${cfg.factoryRef}`,
  );
  upsertProduct({
    name,
    repo,
    type,
    status: "active",
    description: manifest.description || undefined,
    framework: manifest.framework,
    deploy: manifest.deploy?.provider,
    addedAt: today(),
  });
  ok("Registered in registry/products.json (commit this in the factory repo)");

  if (!values.pr)
    return info(
      `Committed on ${BRANCH} in ${dir}. Push it yourself when ready.`,
    );
  pushBranch(dir, BRANCH);
  const pr = openPr(dir, {
    base,
    head: BRANCH,
    title: "chore: adopt into the software factory",
    body: adoptBody(cfg, manifest, changes),
  });
  ok(`${pr.created ? "Opened" : "Updated"} ${pr.url}`);
  info(
    "After merging: set the CLAUDE_CODE_OAUTH_TOKEN secret, open the repo in Claude Code, and run /factory:onboard.",
  );
}

function adoptBody(cfg, manifest, changes) {
  const files = changes
    .filter((x) => x.action === "created" || x.action === "updated")
    .map((x) => `- \`${x.path}\` (${x.mode}, ${x.action})`);
  return `This PR brings the repo into the [software factory](https://github.com/${cfg.factoryRepo}).

## What's added
- \`.factory/product.json\`: the product manifest. CI, Claude's stop gate and \`/factory:verify\` all read it. **Check the detected commands below.**
${files.join("\n")}

## Detected manifest
\`\`\`json
${JSON.stringify({ type: manifest.type, framework: manifest.framework, packageManager: manifest.packageManager, commands: manifest.commands, ci: manifest.ci, gates: manifest.gates }, null, 2)}
\`\`\`

## Before merging
- [ ] The commands above are right for this repo (an empty string means "not available yet")
- [ ] Secret \`CLAUDE_CODE_OAUTH_TOKEN\` is set (\`gh secret set CLAUDE_CODE_OAUTH_TOKEN\`), and the Claude GitHub App has access to this repo

## After merging
Open the repo in Claude Code, accept the factory plugins, and run \`/factory:onboard\` to fill in CLAUDE.md.
`;
}
