import { existsSync, mkdirSync, readdirSync } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { parseArgs } from "node:util";
import {
  loadConfig,
  loadRegistry,
  requireConfigured,
  upsertProduct,
  ROOT,
} from "../lib/config.mjs";
import { commitAll, gh, git } from "../lib/git.mjs";
import { buildManifest, detect, writeProduct } from "../lib/product.mjs";
import {
  applyTemplates,
  changed,
  collectFiles,
  loadTemplateMeta,
  render,
  templateVars,
} from "../lib/templates.mjs";
import {
  c,
  fail,
  info,
  isValidName,
  log,
  ok,
  run,
  sh,
  today,
  warn,
} from "../lib/util.mjs";

export const help = `new <name> --type web|mobile [options]
    Scaffold a new product, apply factory templates, create its GitHub repo, and register it.
      --description "..."   one-line product description
      --owner <owner>       GitHub owner (default: githubOwner from config)
      --dir <path>          where to create it (default: <productsDir>/<name>)
      --public              create a public repo (default: private)
      --no-scaffold         skip the framework scaffold (templates only)
      --no-github           don't create a GitHub repo
      --set-secret          copy $CLAUDE_CODE_OAUTH_TOKEN into the repo's Actions secrets
      --no-baseline         skip running the ci checks on the fresh scaffold
      --dry-run             show what would happen`;

export async function newProduct(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    allowNegative: true,
    options: {
      type: { type: "string" },
      description: { type: "string", default: "" },
      owner: { type: "string" },
      dir: { type: "string" },
      public: { type: "boolean", default: false },
      scaffold: { type: "boolean", default: true },
      github: { type: "boolean", default: true },
      "set-secret": { type: "boolean", default: false },
      baseline: { type: "boolean", default: true },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const [name] = positionals;
  if (!name || !isValidName(name))
    fail("Usage: new <kebab-case-name> --type web|mobile");
  if (!values.type) fail("--type is required (web | mobile)");
  const cfg = loadConfig();
  requireConfigured(cfg);
  if (loadRegistry().products.some((p) => p.name === name))
    fail(`"${name}" is already in the registry.`);

  const type = values.type;
  const meta = loadTemplateMeta(type);
  const owner = values.owner ?? cfg.githubOwner;
  const repo = `${owner}/${name}`;
  const dir = values.dir
    ? isAbsolute(values.dir)
      ? values.dir
      : resolve(process.cwd(), values.dir)
    : join(cfg.productsDirAbs, name);
  const vars = templateVars(cfg, {
    name,
    type,
    repo,
    description: values.description,
    dir: basename(dir),
  });
  const scaffoldCmd =
    values.scaffold && meta.scaffold ? render(meta.scaffold, vars) : null;

  if (values["dry-run"]) {
    info(`Would create ${c.bold(name)} (${type}) at ${dir}`);
    if (scaffoldCmd) {
      log(`  scaffold: ${scaffoldCmd}  (in ${dirname(dir)})`);
      for (const step of meta.postScaffold ?? [])
        log(`  post-scaffold: ${render(step, vars)}`);
    }
    for (const [rel, { mode }] of collectFiles(type))
      log(`  ${mode.padEnd(7)} ${rel}`);
    log(`  manifest .factory/product.json`);
    if (values.baseline && scaffoldCmd)
      log(`  baseline: run the manifest's ci checks on the fresh scaffold`);
    if (values.github)
      log(
        `  gh repo create ${repo} --${values.public ? "public" : "private"} --source ${dir} --push`,
      );
    return;
  }

  if (existsSync(dir) && readdirSync(dir).length)
    fail(
      `${dir} already exists and is not empty. Use \`adopt\` for existing repos.`,
    );

  // 1. Scaffold the framework app (or an empty folder).
  if (scaffoldCmd) {
    info(`Scaffolding: ${scaffoldCmd}`);
    mkdirSync(dirname(dir), { recursive: true });
    sh(scaffoldCmd, { cwd: dirname(dir) });
    if (!existsSync(dir))
      fail(
        `Scaffold finished but ${dir} doesn't exist. Check the scaffold command in templates/${type}/template.json.`,
      );
  } else {
    mkdirSync(dir, { recursive: true });
  }

  // 1b. One-time setup steps whose output belongs in the first commit (e.g. `expo lint`
  // generating its ESLint config). They may exit non-zero; the baseline check reports that.
  if (scaffoldCmd) {
    for (const step of meta.postScaffold ?? []) {
      info(`Post-scaffold: ${step}`);
      if (sh(render(step, vars), { cwd: dir, allowFail: true }) !== 0)
        warn(`  "${step}" exited non-zero (see the baseline check below)`);
    }
  }

  // 2. Manifest + templates.
  const manifest = buildManifest({
    name,
    type,
    description: values.description,
    templateMeta: meta,
    detected: detect(dir),
  });
  writeProduct(dir, manifest);
  const changes = applyTemplates(dir, { type, vars });
  ok(
    `Applied ${changed(changes).length} factory files + .factory/product.json`,
  );

  // 3. Commit.
  if (!existsSync(join(dir, ".git")))
    git(["init", "--quiet", "-b", "main"], dir);
  // Scaffolders run their own `git init`, which follows the user's init.defaultBranch (often
  // "master"). New products always use "main": the CI triggers and manifest are rendered for it.
  else if (git(["branch", "-M", "main"], dir, { allowFail: true }).code !== 0)
    git(["symbolic-ref", "HEAD", "refs/heads/main"], dir);
  commitAll(
    dir,
    `chore: bootstrap ${name} from the software factory\n\nFactory: ${cfg.factoryRepo}@${cfg.factoryRef}`,
  );
  ok("Committed");

  // 3b. Baseline: are the manifest's checks green on the untouched scaffold?
  const baseline = values.baseline && scaffoldCmd ? runBaseline(dir) : null;

  // 4. GitHub repo.
  if (values.github) {
    const desc = values.description
      ? ["--description", values.description]
      : [];
    gh(
      [
        "repo",
        "create",
        repo,
        values.public ? "--public" : "--private",
        "--source",
        dir,
        "--push",
        ...desc,
      ],
      { inherit: true },
    );
    ok(`Created https://github.com/${repo}`);
    if (values["set-secret"]) {
      const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
      if (!token)
        warn(
          "--set-secret: $CLAUDE_CODE_OAUTH_TOKEN is not set, so the secret was skipped.",
        );
      else {
        run(
          "gh",
          ["secret", "set", "CLAUDE_CODE_OAUTH_TOKEN", "--repo", repo],
          { input: token },
        );
        ok("Set the CLAUDE_CODE_OAUTH_TOKEN secret");
      }
    }
  }

  // 5. Register.
  const localPath = relative(ROOT, dir).split("\\").join("/");
  upsertProduct({
    name,
    repo,
    type,
    status: "active",
    description: values.description || undefined,
    framework: manifest.framework,
    deploy: manifest.deploy?.provider,
    localPath,
    addedAt: today(),
  });
  ok("Registered in registry/products.json (commit this in the factory repo)");

  info("Next:");
  if (baseline?.failed.length)
    log(
      `  - ${c.yellow(`Get the baseline green first (${baseline.failed.join(", ")} failing).`)} ${c.cyan("/factory:onboard")} fixes it in the onboarding PR`,
    );
  if (values.github && !values["set-secret"])
    log(
      `  - ${c.cyan(`gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo ${repo}`)}  (paste the token from \`claude setup-token\`)`,
    );
  log(
    `  - Make sure the Claude GitHub App can access ${repo}: https://github.com/apps/claude`,
  );
  log(
    `  - ${c.cyan(`cd ${dir} && claude`)}, accept the factory marketplace/plugins when prompted, then run ${c.cyan("/factory:onboard")}`,
  );
  if (type === "mobile")
    log(
      `  - Link EAS: ${c.cyan("npx eas-cli@latest init")}, then add the EXPO_TOKEN secret if you want CI EAS jobs`,
    );
}

/** Run the plugin's verify script on a fresh product and report which ci checks pass. */
function runBaseline(dir) {
  info(
    "Baseline check: running the manifest's ci commands on the fresh scaffold…",
  );
  const script = join(ROOT, "plugins", "factory", "scripts", "verify.mjs");
  const r = run(process.execPath, [script, "--dir", dir, "--json"], {
    allowFail: true,
  });
  let report;
  try {
    report = JSON.parse(r.stdout);
  } catch {
    warn("  Baseline check didn't produce a report. Skipping it.");
    return null;
  }
  const failed = (report.results ?? [])
    .filter((x) => x.status === "fail")
    .map((x) => x.name);
  for (const x of report.results ?? [])
    log(
      `  ${x.status === "pass" ? c.green("✓") : x.status === "fail" ? c.red("✗") : "-"} ${x.name}`,
    );
  if (failed.length)
    warn(
      `  The scaffold isn't green out of the box (${failed.join(", ")}). That's upstream template code, not factory code.`,
    );
  else ok("  Baseline is green");
  return { failed };
}
