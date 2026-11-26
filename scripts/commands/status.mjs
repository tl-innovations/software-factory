import { parseArgs } from "node:util";
import { selectProducts } from "../lib/config.mjs";
import { ghJson } from "../lib/git.mjs";
import { c, log, splitList, table, warn } from "../lib/util.mjs";

export const help = `status [--only a,b] [--type web|mobile] [--all] [--json]
    Fleet dashboard from GitHub: last push, open PRs (Claude / factory), latest CI on the default branch.`;

export async function status(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      only: { type: "string" },
      type: { type: "string" },
      all: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
  });
  const products = selectProducts({
    only: splitList(values.only),
    type: values.type,
    all: values.all,
  });
  if (!products.length) return warn("No products selected.");

  const results = products.map((p) => {
    const repo = ghJson([
      "repo",
      "view",
      p.repo,
      "--json",
      "defaultBranchRef,pushedAt,visibility,isArchived",
    ]);
    if (!repo)
      return {
        name: p.name,
        type: p.type,
        repo: p.repo,
        error: "not reachable (missing, or no access)",
      };
    const branch = repo.defaultBranchRef?.name ?? "main";
    const prs =
      ghJson([
        "pr",
        "list",
        "--repo",
        p.repo,
        "--state",
        "open",
        "--limit",
        "100",
        "--json",
        "number,isDraft,headRefName,author",
      ]) ?? [];
    const runs =
      ghJson([
        "run",
        "list",
        "--repo",
        p.repo,
        "--branch",
        branch,
        "--limit",
        "1",
        "--json",
        "conclusion,status,workflowName,createdAt",
      ]) ?? [];
    return {
      name: p.name,
      type: p.type,
      repo: p.repo,
      pushedAt: repo.pushedAt,
      openPrs: prs.length,
      claudePrs: prs.filter(
        (pr) =>
          pr.headRefName.startsWith("claude/") ||
          /claude/i.test(pr.author?.login ?? ""),
      ).length,
      factoryPrs: prs.filter(
        (pr) =>
          pr.headRefName.startsWith("factory/") ||
          pr.headRefName === "chore/factory-adopt",
      ).length,
      ci: runs[0]
        ? {
            workflow: runs[0].workflowName,
            status: runs[0].status,
            conclusion: runs[0].conclusion,
          }
        : null,
    };
  });

  if (values.json) return log(JSON.stringify(results, null, 2));
  const ciCell = (ci) =>
    !ci
      ? c.dim("no runs")
      : ci.status !== "completed"
        ? c.yellow(ci.status)
        : ci.conclusion === "success"
          ? c.green("success")
          : c.red(ci.conclusion);
  table(
    results.map((r) =>
      r.error
        ? [r.name, r.type, c.red(r.error), "", "", ""]
        : [
            r.name,
            r.type,
            r.pushedAt?.slice(0, 10) ?? "",
            `${r.openPrs}`,
            `${r.claudePrs} / ${r.factoryPrs}`,
            ciCell(r.ci),
          ],
    ),
    [
      "PRODUCT",
      "TYPE",
      "LAST PUSH",
      "OPEN PRS",
      "CLAUDE / FACTORY",
      "DEFAULT-BRANCH CI",
    ],
  );
}
