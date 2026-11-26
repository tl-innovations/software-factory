#!/usr/bin/env node
// Software factory CLI: manage a fleet of product repos from this control repo.
// Usage: node scripts/factory.mjs <command> [options]     (or: npm run factory -- <command>)
import { CommandError, FactoryError, bad, c, log } from "./lib/util.mjs";
import * as setupCmd from "./commands/setup.mjs";
import * as listCmd from "./commands/list.mjs";
import * as newCmd from "./commands/new.mjs";
import * as adoptCmd from "./commands/adopt.mjs";
import * as syncCmd from "./commands/sync.mjs";
import * as statusCmd from "./commands/status.mjs";
import * as doctorCmd from "./commands/doctor.mjs";
import * as runCmd from "./commands/run.mjs";
import * as validateCmd from "./commands/validate.mjs";

const COMMANDS = {
  setup: [setupCmd.setup, setupCmd.help],
  list: [listCmd.list, listCmd.help],
  new: [newCmd.newProduct, newCmd.help],
  adopt: [adoptCmd.adopt, adoptCmd.help],
  sync: [syncCmd.sync, syncCmd.help],
  status: [statusCmd.status, statusCmd.help],
  doctor: [doctorCmd.doctor, doctorCmd.help],
  run: [runCmd.run, runCmd.help],
  validate: [validateCmd.validate, validateCmd.help],
};

function usage() {
  log(
    `${c.bold("software factory")}: manage web and mobile product repos with Claude Code\n`,
  );
  log(`Usage: node scripts/factory.mjs <command> [options]\n`);
  for (const [, help] of Object.values(COMMANDS))
    log(`  ${help.replace(/\n/g, "\n  ")}\n`);
  log("Docs: docs/README.md");
}

const [name, ...argv] = process.argv.slice(2);
if (!name || name === "help" || name === "--help" || name === "-h") {
  usage();
} else if (!COMMANDS[name]) {
  bad(`Unknown command "${name}"`);
  usage();
  process.exitCode = 1;
} else if (argv.includes("--help") || argv.includes("-h")) {
  log(`  ${COMMANDS[name][1]}`);
} else {
  try {
    await COMMANDS[name][0](argv);
  } catch (err) {
    if (
      err instanceof FactoryError ||
      err instanceof CommandError ||
      err?.code?.startsWith?.("ERR_PARSE_ARGS")
    ) {
      bad(err.message);
      process.exitCode = 1;
    } else {
      throw err;
    }
  }
}
