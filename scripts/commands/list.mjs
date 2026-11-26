import { parseArgs } from "node:util";
import { loadRegistry } from "../lib/config.mjs";
import { log, table } from "../lib/util.mjs";

export const help = `list [--json]
    Show the products in registry/products.json.`;

export async function list(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { json: { type: "boolean", default: false } },
  });
  const { products } = loadRegistry();
  if (values.json) return log(JSON.stringify(products, null, 2));
  if (!products.length)
    return log("No products yet. Add one with `new` or `adopt`.");
  table(
    products.map((p) => [
      p.name,
      p.type,
      p.status,
      p.repo,
      p.framework ?? "",
      p.deploy ?? "",
    ]),
    ["NAME", "TYPE", "STATUS", "REPO", "FRAMEWORK", "DEPLOY"],
  );
}
