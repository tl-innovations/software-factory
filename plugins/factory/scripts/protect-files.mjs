#!/usr/bin/env node
// PreToolUse(Write|Edit|NotebookEdit): block writes to secrets and factory-managed files.
// Active only in factory products (repos with .factory/product.json).
import { relative, resolve, sep } from "node:path";
import {
  readStdinJson,
  projectDir,
  loadProduct,
  loadManaged,
  decide,
} from "./lib/common.mjs";
import { evaluateFile } from "./lib/file-policy.mjs";

const input = readStdinJson();
const filePath =
  input?.tool_input?.file_path || input?.tool_input?.notebook_path;
if (typeof filePath !== "string" || !filePath) process.exit(0);

const dir = projectDir(input);
const product = loadProduct(dir);
if (!product) process.exit(0);

const rel = relative(dir, resolve(dir, filePath)).split(sep).join("/");
if (rel.startsWith("..")) process.exit(0); // outside this repo: not our concern

const managed = loadManaged(dir);
const verdict = evaluateFile(rel, {
  managed: managed.files,
  factoryRepo: managed.factoryRepo,
});
if (verdict) decide(verdict.decision, verdict.reason);
process.exit(0);
