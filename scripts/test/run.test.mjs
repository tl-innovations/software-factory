import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sessionArgs } from "../commands/run.mjs";

test("fleet runs pass plugins and the product's permissions explicitly (untrusted clones)", () => {
  const dir = mkdtempSync(join(tmpdir(), "factory-run-"));
  mkdirSync(join(dir, ".claude"));
  writeFileSync(
    join(dir, ".claude", "settings.json"),
    JSON.stringify({
      permissions: { allow: ["Bash(npm run *)"], deny: ["Read(./.env)"] },
    }),
  );
  const args = sessionArgs(dir, "web");
  const pluginDirs = args.filter((_, i) => args[i - 1] === "--plugin-dir");
  assert.equal(pluginDirs.length, 2);
  assert.match(pluginDirs[0], /plugins[\\/]factory$/);
  assert.match(pluginDirs[1], /plugins[\\/]factory-web$/);
  assert.deepEqual(
    args.slice(
      args.indexOf("--allowedTools") + 1,
      args.indexOf("--allowedTools") + 2,
    ),
    ["Bash(npm run *)"],
  );
  assert.equal(args[args.indexOf("--disallowedTools") + 1], "Read(./.env)");

  // No settings file and an unknown type: core plugin only, no permission flags.
  const bare = sessionArgs(mkdtempSync(join(tmpdir(), "factory-run-")), "nope");
  assert.equal(bare.filter((a) => a === "--plugin-dir").length, 1);
  assert.ok(!bare.includes("--allowedTools"));
});
