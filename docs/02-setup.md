# Setup (one time, about 30 minutes)

## 0. Prerequisites

- A Claude **Pro or Max** subscription, and Claude Code installed (`claude --version`)
- Node.js **20.16+**, git, and the GitHub CLI logged in (`gh auth status`)
- Optional (recommended): a free **GitHub organization** for your products. You get org-wide Actions
  secrets, rulesets, and a single Claude GitHub App installation.

## 1. Create your factory repo

From this template on GitHub: **Use this template → Create a new repository**, or:

```bash
gh repo create my-org/software-factory --template <template-owner>/software-factory --public --clone
cd software-factory
```

If you're starting from a local copy instead: `gh repo create my-org/software-factory --public --source . --push`.

> **Public or private?** Public is simplest. The factory holds process and config, not product code
> or secrets. If you keep it private:
>
> - allow product repos to call its workflows:
>   `gh api -X PUT repos/OWNER/software-factory/actions/permissions/access -f access_level=user` (use `organization` for an org)
> - CI can't install plugins from a private marketplace, so in `templates/common/managed/.github/workflows/factory-claude.yml`
>   pass `install-plugins: false`. `@claude` still works, just without the factory skills.

## 2. Configure

```bash
node scripts/factory.mjs setup        # fills factory.config.json from the git remote
node scripts/factory.mjs doctor       # checks tools, config and access
npm test && node scripts/factory.mjs validate
```

`factory.config.json`:

| Key                          | Meaning                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `factoryRepo` / `factoryRef` | Where products fetch workflows and plugins, and at which ref (`main`, or a tag like `v1`) |
| `marketplace`                | Marketplace name. Must match `.claude-plugin/marketplace.json` → `name`                   |
| `githubOwner`                | Default owner for `factory new`                                                           |
| `productsDir`                | Where `factory new` creates products (default `..`, a sibling of the factory)             |
| `workspaceDir`               | Disposable clones used by `sync` and `run` (default `.workspace/`, gitignored)            |
| `fleetRun`                   | Default model, max turns and permission mode for `factory run`                            |

## 3. Connect Claude to GitHub

1. **Install the Claude GitHub App** on your account or org, with access to all repos (or the product
   repos): <https://github.com/apps/claude>. Running `/install-github-app` inside Claude Code in any
   repo walks you through it.
2. **Create a subscription token for CI:**
   ```bash
   claude setup-token          # prints a long-lived OAuth token tied to YOUR subscription
   ```
3. **Store it as `CLAUDE_CODE_OAUTH_TOKEN`:**
   - org (once, for every repo): `gh secret set CLAUDE_CODE_OAUTH_TOKEN --org my-org --visibility all`
   - per repo: `gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo my-org/acme-site`, or
     `export CLAUDE_CODE_OAUTH_TOKEN=…` and use `factory new … --set-secret`

See [05-subscription-and-usage.md](05-subscription-and-usage.md) for what this token can and can't do.

## 4. Install the plugins locally

They install on their own the first time you open a product (Claude Code prompts when it reads
the product's `.claude/settings.json`). To install them up front:

```text
/plugin marketplace add my-org/software-factory
/plugin install factory@software-factory
/plugin install factory-web@software-factory
/plugin install factory-mobile@software-factory
```

## 5. Pin a stable ref (recommended)

```bash
git tag v1 && git push origin v1
# factory.config.json → "factoryRef": "v1"
```

Products then call `…/ci.yml@v1`, so your work-in-progress on `main` can't break their CI. To release
factory changes, move the tag forward (or cut `v2`) and run `factory sync`.

## 6. Add products

**Existing repo** (most of your websites):

```bash
node scripts/factory.mjs adopt my-org/acme-site            # detects stack, opens a PR
# review and merge the PR, then in the product:
cd ../acme-site && git pull && claude
> /factory:onboard                                          # Claude fills in CLAUDE.md and checks the commands
```

**New product:**

```bash
node scripts/factory.mjs new acme-app --type mobile --description "Acme loyalty app" --set-secret
node scripts/factory.mjs new acme-promo --type web --public
```

`new` finishes with a **baseline check**: it runs the manifest's `ci` commands on the untouched scaffold.
Fresh framework templates aren't always green (the stock Expo template currently fails `lint` and `tsc`), so
make `/factory:onboard` your first session in a new product. It fixes the baseline in the onboarding PR.

Commit `registry/products.json` in the factory after adding products.

## 7. Protect `main` in each product (recommended)

Require a PR and a green `factory-ci` before merging. For a solo developer, require **0 approvals**
(you can't approve your own PRs), but still require the PR and the status check:

```bash
gh api -X POST repos/my-org/acme-site/rulesets --input - <<'EOF'
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": { "required_approving_review_count": 0, "dismiss_stale_reviews_on_push": false,
      "require_code_owner_review": false, "require_last_push_approval": false, "required_review_thread_resolution": false } },
    { "type": "required_status_checks", "parameters": { "strict_required_status_checks_policy": false,
      "required_status_checks": [{ "context": "checks / checks" }] } }
  ]
}
EOF
```

Check the exact status-check name in a PR's **Checks** tab after the first CI run. Rulesets on
**private** repos need a paid GitHub plan (Pro, Team), or the repo must be public.

## 8. Optional repo variables (per product)

| Variable                      | Effect                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `FACTORY_CLAUDE_MODEL`        | Model for `@claude` runs (default `sonnet`)                                           |
| `FACTORY_CLAUDE_MAX_TURNS`    | Turn cap for `@claude` runs (default `40`)                                            |
| `FACTORY_AUTO_REVIEW`         | `true` reviews every non-draft PR when it opens (default: label `claude-review` only) |
| `FACTORY_REVIEW_MODEL`        | Model for PR review (default `sonnet`)                                                |
| `FACTORY_EAS_PREVIEW`         | Mobile: `true` publishes an EAS Update per PR (needs the `EXPO_TOKEN` secret)         |
| `FACTORY_EAS_RELEASE_ON_MAIN` | Mobile: `true` runs `.eas/workflows/release.yml` on every push to `main`              |

```bash
gh variable set FACTORY_AUTO_REVIEW --body true --repo my-org/acme-site
```
