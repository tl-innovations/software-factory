import { parseArgs } from "node:util";
import { loadConfig, saveConfig, ROOT } from "../lib/config.mjs";
import { ghJson } from "../lib/git.mjs";
import { fail, info, log, ok, warn, c } from "../lib/util.mjs";

export const help = `setup [--repo owner/name] [--ref main] [--owner github-owner]
    Point factory.config.json at this factory's GitHub repo (auto-detected from the git remote).`;

export async function setup(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      repo: { type: "string" },
      ref: { type: "string" },
      owner: { type: "string" },
    },
  });
  const cfg = loadConfig();
  const repo =
    values.repo ??
    ghJson(["repo", "view", "--json", "nameWithOwner"], { cwd: ROOT })
      ?.nameWithOwner;
  if (!repo) {
    fail(
      "Could not detect this factory's GitHub repo. Push it first (e.g. `gh repo create --source . --push --public`) or pass --repo owner/name.",
    );
  }
  const raw = {
    ...cfg.raw,
    factoryRepo: repo,
    githubOwner: values.owner ?? repo.split("/")[0],
    ...(values.ref ? { factoryRef: values.ref } : {}),
  };
  saveConfig(raw);
  ok(
    `factory.config.json → factoryRepo=${raw.factoryRepo}, githubOwner=${raw.githubOwner}, factoryRef=${raw.factoryRef}`,
  );

  const view = ghJson(["repo", "view", repo, "--json", "visibility,owner"]);
  if (view && view.visibility !== "PUBLIC") {
    const ownerType = ghJson(["api", `users/${repo.split("/")[0]}`])?.type;
    const level = ownerType === "Organization" ? "organization" : "user";
    warn(
      `${repo} is ${view.visibility.toLowerCase()}. Two things need attention:`,
    );
    log(`  1. Let product repos call its reusable workflows:`);
    log(
      `       ${c.cyan(`gh api -X PUT repos/${repo}/actions/permissions/access -f access_level=${level}`)}`,
    );
    log(
      `  2. CI can't clone a private plugin marketplace. Either make the factory public (it holds`,
    );
    log(
      `     process and config, not product code) or set install-plugins: false in factory-claude.yml.`,
    );
  }

  info("Next steps:");
  log(
    `  - Install the Claude GitHub App for all repos: ${c.cyan("https://github.com/apps/claude")}`,
  );
  log(
    `  - Create a subscription token for CI: ${c.cyan("claude setup-token")} (keep it for \`factory new --set-secret\`)`,
  );
  log(
    `  - Tag a stable ref for products to pin: ${c.cyan("git tag v1 && git push origin v1")}, then set factoryRef to "v1"`,
  );
  log(
    `  - Add products: ${c.cyan("node scripts/factory.mjs new <name> --type web")} or ${c.cyan("adopt <owner/repo>")}`,
  );
}
