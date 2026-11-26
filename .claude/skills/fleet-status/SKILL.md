---
name: fleet-status
description: Report the health of every product in the software factory, covering CI on the default branch, open Claude and factory PRs, managed-file drift and missing secrets, and recommend what to do next. Use when asked how the fleet or the products are doing, what's failing, or what needs attention.
argument-hint: "[--only a,b | --type web|mobile]"
---

# Fleet status

1. `node scripts/factory.mjs status --json $ARGUMENTS`
2. `node scripts/factory.mjs doctor $ARGUMENTS` (compliance: manifest, drift, plugins, secrets)
3. For any product whose default-branch CI is failing, look at the latest run:
   `gh run list --repo <repo> --branch <default> --limit 1` and `gh run view <id> --repo <repo> --log-failed`.
   Summarize the failure in one line.

Report as a short table: product · CI · open PRs (Claude / factory) · problems. Then a prioritized
**Next actions** list, for example "merge the factory/sync PR in acme-site", "CI red in acme-app: lint error
in src/x.ts, run `/factory:bugfix` there", "acme-promo is missing the CLAUDE_CODE_OAUTH_TOKEN secret".
Don't change anything. This skill is read-only.
