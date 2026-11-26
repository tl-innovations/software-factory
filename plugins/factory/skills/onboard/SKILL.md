---
name: onboard
description: Finish onboarding a repo into the software factory. Checks that the commands in .factory/product.json work, fills in the TODOs in CLAUDE.md from the real codebase, and proposes quality improvements. Use right after `factory adopt` or `factory new`, or when CLAUDE.md is missing or stale.
disable-model-invocation: true
---

# Onboard this repo into the factory

1. **Survey.** Read `package.json`, the framework and tooling configs, the top-level folder structure,
   the README, and the CI config. Identify the framework, the language, styling, data and auth, testing,
   and hosting.

2. **Make the manifest true.** For each command in `.factory/product.json` → `commands`, run it once
   (with the factory `verify` skill: `--install --only <name>`).
   - If a command is wrong for this repo (wrong script name, wrong package manager), fix it in `product.json`.
   - If a capability is missing entirely (no tests, no typecheck), set that command to `""`, and remove it
     from `ci` and `gates.onStop`. **Don't install new tooling without asking.**
   - Keep `gates.onStop` to fast checks only (lint and typecheck, ideally under about 60s).
   - **Get the baseline green.** If checks fail on the untouched code (common with fresh framework
     templates and legacy repos), fix them in this onboarding PR, because the stop gate and CI assume
     `main` is green. If the fixes are large or risky, list them and agree a plan with the user before
     going on.

3. **Fill in CLAUDE.md.** Replace every TODO with concrete, verified facts: stack, an architecture map
   (5-10 key directories), conventions that differ from `.factory/standards.md`, and gotchas found in the
   code or README. Keep it under about 150 lines. Don't duplicate the factory standards. The
   `@.factory/standards.md` import already brings them in.

4. **Recommend, don't apply.** List the most valuable improvements, ranked: for example a missing test
   setup, no lint in CI, no error boundary, missing `.env.example`, or an outdated framework major. Offer
   to file them as issues (`gh issue create`) and only do it if the user says yes.

5. **Ship it.** On a branch `chore/factory-onboard`, use the factory `ship` skill with the title
   `chore: onboard into software factory`.

**Unattended (fleet run, CI):** there's nobody to ask. Make the baseline fixes you're confident in, skip
anything large or risky, and don't file issues. Don't commit or push either (the runner does that). End
with a summary: checks before → after, manifest changes, baseline fixes, and the ranked recommendations
from step 4.
