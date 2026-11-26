---
name: fleet-run
description: Apply one change across many product repos with headless Claude Code (one PR per product), with a canary-first rollout. Use when asked to make the same change, upgrade or fix in several or all products.
argument-hint: "<what to change> [--only a,b | --type web|mobile]"
disable-model-invocation: true
---

# Fleet run

Request: $ARGUMENTS

1. **Write the prompt** to `.workspace/prompts/<slug>.md`. A good fleet prompt states:
   - the outcome and how to check it ("…and `ci` passes")
   - constraints (keep it within current major versions, don't touch X)
   - what to do when it doesn't apply ("If this repo has no contact form, change nothing and say so.")
2. **Select products:** `node scripts/factory.mjs list`, then pick `--only` or `--type`.
3. **Dry run:** `node scripts/factory.mjs run --prompt-file .workspace/prompts/<slug>.md <selection> --dry-run`.
   Tell the user: N products means N headless Claude sessions on their subscription.
4. **Canary:** after the user confirms, run on **one** product (`--only <one>`). Open the PR and review the
   diff with the user.
5. **Roll out** to the rest, only after the user approves the canary result (add `--yes` once confirmed).
6. Report a table of PR links and "no changes" products, with Claude's one-line reason for each skip.
   The full logs are in `.workspace/runs/`.
