import { parseArgs } from "node:util";
import {
  loadConfig,
  requireConfigured,
  selectProducts,
  ROOT,
} from "../lib/config.mjs";
import {
  commitAll,
  defaultBranch,
  ensureClone,
  git,
  openPr,
  pushBranch,
  startBranch,
} from "../lib/git.mjs";
import { buildManifest, detect, writeProduct } from "../lib/product.mjs";
import {
  applyTemplates,
  changed,
  loadTemplateMeta,
  templateVars,
} from "../lib/templates.mjs";
import {
  bad,
  c,
  fail,
  info,
  log,
  ok,
  splitList,
  table,
  warn,
} from "../lib/util.mjs";

export const help = `sync [--only a,b] [--type web|mobile] [--all] [--dry-run] [--no-pr] [--allow-dirty]
    Re-apply factory templates to every product. Managed files are overwritten, merge files are merged,
    seed files are only created if missing. Changes land as one PR per product on branch factory/sync.`;

const BRANCH = "factory/sync";

export async function sync(argv) {
  const { values } = parseArgs({
    args: argv,
    allowNegative: true,
    options: {
      only: { type: "string" },
      type: { type: "string" },
      all: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      pr: { type: "boolean", default: true },
      "allow-dirty": { type: "boolean", default: false },
    },
  });
  const cfg = loadConfig();
  requireConfigured(cfg);
  const dryRun = values["dry-run"];

  // Products must only receive templates that are committed and pushed: managed workflows reference
  // reusable workflows by ref on GitHub, so unpushed changes would break product CI.
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
  if (dirty && !values["allow-dirty"] && !dryRun)
    fail(
      `Uncommitted factory changes:\n${dirty}\nCommit and push them first (or pass --allow-dirty).`,
    );
  const unpushed = git(["rev-list", "--count", "@{u}..HEAD"], ROOT, {
    allowFail: true,
  });
  if (unpushed.code === 0 && Number(unpushed.stdout.trim()) > 0)
    warn(
      "The factory has unpushed commits. Products will reference what is on GitHub.",
    );
  const factorySha =
    git(["rev-parse", "--short", "HEAD"], ROOT, {
      allowFail: true,
    }).stdout.trim() || "unknown";

  const products = selectProducts({
    only: splitList(values.only),
    type: values.type,
    all: values.all,
  });
  if (!products.length) return warn("No products selected.");

  const rows = [];
  for (const product of products) {
    info(`${c.bold(product.name)} (${product.repo})`);
    try {
      const dir = ensureClone(product, cfg);
      const base = defaultBranch(dir);
      startBranch(dir, BRANCH, base);
      const meta = loadTemplateMeta(product.type);
      const vars = templateVars(cfg, product);
      const manifest = buildManifest({
        name: product.name,
        type: product.type,
        description: product.description,
        templateMeta: meta,
        detected: detect(dir),
      });
      const productAction = writeProduct(dir, manifest, { dryRun }); // only fills missing keys
      const changes = applyTemplates(dir, { type: product.type, vars, dryRun });
      const touched = [
        ...(productAction !== "unchanged"
          ? [{ path: ".factory/product.json", action: productAction }]
          : []),
        ...changed(changes),
      ];
      for (const ch of touched) log(`  ${ch.action.padEnd(8)} ${ch.path}`);
      for (const ch of changes.filter((x) => x.action === "error"))
        warn(`  ${ch.path}: ${ch.note}`);

      if (!touched.length) {
        rows.push([product.name, c.green("in sync"), ""]);
        continue;
      }
      if (dryRun) {
        git(["checkout", "--quiet", base], dir);
        rows.push([
          product.name,
          c.yellow(`${touched.length} file(s) would change`),
          "",
        ]);
        continue;
      }
      commitAll(
        dir,
        `chore(factory): sync from ${cfg.factoryRepo}@${factorySha}\n\n${touched.map((t) => `- ${t.action} ${t.path}`).join("\n")}`,
      );
      if (!values.pr) {
        rows.push([product.name, "committed locally", dir]);
        continue;
      }
      pushBranch(dir, BRANCH);
      const pr = openPr(dir, {
        base,
        head: BRANCH,
        title: "chore(factory): sync factory standards",
        body: `Automated sync from [${cfg.factoryRepo}@${factorySha}](https://github.com/${cfg.factoryRepo}/commit/${factorySha}).\n\n${touched.map((t) => `- ${t.action} \`${t.path}\``).join("\n")}\n\nManaged files are owned by the factory. To change them, edit the template in the factory repo and re-run \`factory sync\`.`,
      });
      rows.push([
        product.name,
        pr.created ? "PR opened" : "PR updated",
        pr.url,
      ]);
    } catch (err) {
      bad(`  ${err.message.split("\n")[0]}`);
      rows.push([product.name, c.red("error"), err.message.split("\n")[0]]);
    }
  }
  log("");
  table(rows, ["PRODUCT", "RESULT", "DETAIL"]);
}
