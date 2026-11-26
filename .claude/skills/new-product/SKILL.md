---
name: new-product
description: Create a new website or mobile app product in the factory. Gathers the details, scaffolds it, creates the GitHub repo, and registers it. Use when asked to start, create or spin up a new site, web app or mobile app.
argument-hint: "<name> [web|mobile] [description]"
disable-model-invocation: true
---

# New product

Input: $ARGUMENTS

1. **Gather the details.** Ask only for what's missing:
   - `name`: kebab-case, which becomes the repo name
   - `type`: `web` or `mobile`
   - a one-line description
   - public or private repo
   - stack: the default is Next.js for web and Expo for mobile. If the user wants another stack, edit
     `scaffold` in `templates/<type>/template.json` for this run, or pass `--no-scaffold` and scaffold by hand.
2. **Dry run:** `node scripts/factory.mjs new <name> --type <type> --description "<desc>" --dry-run`. Show the plan.
3. **After confirmation**, run it without `--dry-run`. Add `--set-secret` if `CLAUDE_CODE_OAUTH_TOKEN` is set in
   the environment, and `--public` if requested.
4. Commit `registry/products.json` in this repo: `chore: add <name> to the fleet`.
5. Relay the CLI's **Next** steps. If the baseline check reported failures, say so plainly: the first job in
   the new product is `/factory:onboard`, which gets it green.
