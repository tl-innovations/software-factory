#!/usr/bin/env node
// PreToolUse(Bash): deny destructive / out-of-policy commands, ask before releases and deploys.
// Active only in factory products (repos with .factory/product.json).
import {
  readStdinJson,
  projectDir,
  loadProduct,
  currentBranch,
  decide,
} from "./lib/common.mjs";
import { evaluateCommand } from "./lib/bash-policy.mjs";

const input = readStdinJson();
const command = input?.tool_input?.command;
if (typeof command !== "string" || !command.trim()) process.exit(0);

const dir = projectDir(input);
const product = loadProduct(dir);
if (!product) process.exit(0);

const verdict = evaluateCommand(command, {
  protectedBranches: product.guard?.protectedBranches ?? ["main", "master"],
  currentBranch: () => currentBranch(dir),
});
if (verdict) decide(verdict.decision, verdict.reason);
process.exit(0);
