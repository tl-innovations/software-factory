---
name: ship
description: Commit, push and open a pull request for the current branch using factory conventions (Conventional Commits, PR template with spec and verification evidence). Use when work is verified and ready for human review. Never merges.
argument-hint: "[issue-number]"
---

# Ship: open a PR for human review

## Preconditions (check every one, and stop if any fails)

- You're on a feature branch (`feat/…`, `fix/…`, `chore/…`), not `main`/`master`.
- The factory `verify` skill passed **after** the last code change. If you're not sure, run it again.
- `git status` shows only files that belong to this change. No stray debug files or lockfile churn
  unless dependencies changed on purpose.
- The diff contains no secrets (API keys, tokens, private keys, `.env` values).

## Steps

1. Stage the specific paths (`git add <paths>`, not a blind `git add -A`) and commit with a
   Conventional Commit message: `feat(scope): …`, `fix(scope): …`, `chore: …`.
2. `git push -u origin HEAD`
3. Write the PR body to `.git/FACTORY_PR_BODY.md`. It's inside `.git`, so it never gets committed. Follow
   `.github/pull_request_template.md`:
   - **Summary**: what and why, in 1-3 sentences.
   - **Links**: `Closes #<issue>` if there is one, and the spec path.
   - **Spec / Plan**: in non-interactive runs, paste the acceptance criteria and a plan summary.
   - **Verification**: the verify result table, the tests added, and screenshots or recordings for UI changes.
   - **Risk & rollback**. For mobile products, state **OTA-safe** or **needs a new native build**.
   - **Follow-ups**: deferred review findings, if any.
4. `gh pr create --base <default-branch> --title "<conventional title>" --body-file .git/FACTORY_PR_BODY.md`
5. Report the PR URL.

**Never** merge, enable auto-merge, approve your own PR, or push to the default branch.
