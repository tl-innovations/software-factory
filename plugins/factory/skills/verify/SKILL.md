---
name: verify
description: Run this product's quality checks (whatever .factory/product.json lists under "ci", typically lint, typecheck, tests and build), then fix failures with a bounded number of attempts. Use before committing, before opening a PR, or whenever asked to check that the code works.
argument-hint: "[--only lint,test | --skip build | --install]"
allowed-tools: Bash(node *scripts/verify.mjs*)
---

# Verify

1. Run the checks:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs" $ARGUMENTS
   ```

   Useful flags: `--only lint,typecheck` for a quick pass, `--install` if dependencies are missing,
   `--json` for structured output.

2. If it prints `RESULT: PASS`, report the summary table and stop.

3. If something fails, read the failure output and fix the **root cause**, then re-run just the failed
   checks with `--only`. Never:
   - weaken, skip or delete tests, or loosen assertions, to get to green
   - add `eslint-disable`, `@ts-ignore`, `@ts-expect-error` or `any` unless there's a written justification
   - change the commands in `.factory/product.json` to dodge a failure

4. Make at most **3 fix rounds**. If it's still failing, stop and report what fails, what you tried, and
   your best hypothesis.

5. If a failure looks unrelated to the current change, check whether it also fails on the base branch
   (for example in `git worktree add ../verify-base origin/HEAD`). If it does, report it as
   **pre-existing** instead of fixing it in this PR.
