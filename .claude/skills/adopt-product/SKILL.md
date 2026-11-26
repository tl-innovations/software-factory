---
name: adopt-product
description: Bring one or more existing GitHub repos (websites or apps) into the factory. Detects each stack, opens an adoption PR, and registers it. Use when asked to adopt, onboard, import or add existing repos to the factory.
argument-hint: "<owner/repo> [owner/repo ...]"
disable-model-invocation: true
---

# Adopt existing products

Repos: $ARGUMENTS (if none are given, list candidates with `gh repo list <owner> --limit 100 --json name,primaryLanguage,pushedAt`
and ask which ones).

For each repo:

1. **Dry run:** `node scripts/factory.mjs adopt <owner/repo> --dry-run`. Check the detected type, framework,
   package manager and commands. If the type is wrong (a React Native app detected as web, for example),
   re-run with `--type`.
2. **Show the user** the detected manifest for every repo, and confirm in one go.
3. Run `node scripts/factory.mjs adopt <owner/repo>` for each one, and collect the PR links.
4. Commit `registry/products.json`: `chore: adopt <names> into the fleet`.
5. Tell the user the per-repo follow-ups: review and merge the adoption PR, make sure the
   `CLAUDE_CODE_OAUTH_TOKEN` secret and the Claude GitHub App cover the repo, then open it in Claude Code
   and run `/factory:onboard`.
