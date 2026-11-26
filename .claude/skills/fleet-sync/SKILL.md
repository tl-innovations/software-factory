---
name: fleet-sync
description: Roll factory template, standards or workflow changes out to product repos as sync PRs, after a dry run and the user's confirmation. Use when asked to sync, roll out or propagate factory changes to the products.
argument-hint: "[--only a,b | --type web|mobile]"
disable-model-invocation: true
---

# Sync the fleet

1. **Preflight:** `git status` must show templates, plugins and workflows committed and pushed (sync
   refuses otherwise). Run `npm test && node scripts/factory.mjs validate`.
2. **Breaking-change check:** `git log --oneline <factoryRef>..HEAD -- templates .github/workflows`. If a
   reusable workflow's inputs changed or a managed file was removed, tell the user, and suggest moving or
   cutting the `factoryRef` tag first (docs/07-customizing.md).
3. **Dry run:** `node scripts/factory.mjs sync --dry-run $ARGUMENTS`. Show which products and files would change.
4. **Ask for confirmation**, then run `node scripts/factory.mjs sync $ARGUMENTS`.
5. Report the PR links. Suggest merging one product's PR first and watching its CI before merging the rest.
