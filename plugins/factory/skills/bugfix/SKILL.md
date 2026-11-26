---
name: bugfix
description: Fix a bug the factory way. Reproduce it, write a failing test, find the root cause, apply a minimal fix, verify, review, and open a PR. Use when asked to fix a bug, error or regression, or when given a bug issue number.
argument-hint: "[issue-number | bug description]"
---

# Factory bugfix

Bug: $ARGUMENTS

1. **Understand it.** If it's an issue: `gh issue view <n> --comments`. Collect the steps to reproduce,
   the expected and actual behaviour, and the environment.
2. **Branch.** `git fetch origin && git switch -c fix/<issue#>-<slug> origin/HEAD`
3. **Reproduce it with a failing test** at the lowest level that shows the bug (unit before e2e). Use the
   `test-writer` subagent if it helps. Confirm the test fails for the reported reason. If you can't reproduce
   it, stop and report what you tried. Don't guess-fix.
4. **Find the root cause.** Explain in 2-3 sentences why it happens, citing `path:line`. Check for the same
   pattern elsewhere (`git grep`), and mention other occurrences even if you don't fix them here.
5. **Apply the smallest fix** that makes the test pass, with no unrelated refactors.
6. **Verify** with the factory `verify` skill. Everything in `ci` must pass.
7. **Review.** For non-trivial fixes, use the factory `review` skill. For a one-liner, a self-review of the diff is enough.
8. **Ship** with the factory `ship` skill, using a `fix(scope): …` commit and `Closes #<issue>`. The PR body should
   include the root-cause explanation, and for mobile products, whether the fix is OTA-safe.
