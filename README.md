# Software Factory

A GitHub template for running **many independent products** (websites and mobile apps, one repo
each) as a single factory, with **Claude Code on a Pro/Max subscription** as the workforce and you
as reviewer and decision-maker.

- **One control repo (this one)** holds the shared process: a Claude Code **plugin marketplace**
  (pipeline skills, specialist agents, guardrail hooks), **reusable GitHub workflows** (CI, `@claude`,
  PR review, EAS), **templates**, a **product registry** and a zero-dependency **fleet CLI**.
- **Every product repo** keeps its own code and stack, and gets a thin, synced layer: a manifest
  (`.factory/product.json`), shared standards, CI and Claude workflows, issue and PR templates, and
  plugin settings.
- **The same pipeline everywhere:** spec → plan → build → verify → review → PR → **human merge**.

> New here? Read **[docs/README.md](docs/README.md)**, the blueprint. It's the generalized outline,
> and the rest of this repo implements it.

## Quick start

```bash
# 1. Create your factory from this template, then:
node scripts/factory.mjs setup                  # point config at your GitHub repo
node scripts/factory.mjs doctor                 # check tools and access

# 2. Connect Claude to GitHub (once)
#    - install https://github.com/apps/claude on your account/org
#    - claude setup-token  → save as the CLAUDE_CODE_OAUTH_TOKEN Actions secret (org-wide if you can)

# 3. Bring in products
node scripts/factory.mjs adopt my-org/existing-site            # opens a PR with the factory layer
node scripts/factory.mjs new acme-app --type mobile --set-secret
node scripts/factory.mjs new acme-promo --type web

# 4. Work in a product
cd ../acme-promo && claude
> /factory:onboard
> /factory:feature add a pricing page with three plans
```

Run the fleet from here: `status`, `doctor`, `sync`, `run "<prompt>" --type web`. Or just open
`claude` in this repo and ask, for example: _"what's failing across the fleet?"_ or _"sync the web products"_.

## What's inside

| Path                                               | What                                                                                                                                                                                    |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`docs/`](docs/README.md)                          | Blueprint, architecture, setup, pipeline, fleet ops, subscription usage, guardrails, customizing, research                                                                              |
| [`plugins/factory`](plugins/factory)               | Core plugin: `/factory:feature`, `spec`, `plan`, `verify`, `review`, `ship`, `bugfix`, `onboard`. Agents `planner`, `reviewer`, `test-writer`. Hooks: Bash guard, file guard, stop gate |
| [`plugins/factory-web`](plugins/factory-web)       | `/factory-web:audit` (Lighthouse, a11y, SEO, headers) and `/factory-web:e2e` (Playwright)                                                                                               |
| [`plugins/factory-mobile`](plugins/factory-mobile) | `/factory-mobile:release` (EAS store release) and `/factory-mobile:ota` (safe OTA updates)                                                                                              |
| [`.github/workflows/`](.github/workflows)          | Reusable `ci.yml`, `claude-agent.yml`, `claude-review.yml`, `mobile-eas.yml`, plus this repo's own CI                                                                                   |
| [`templates/`](templates)                          | `common`, `web` and `mobile` layers. `seed` files are created once, `managed` files are overwritten by sync, `merge` files are JSON-merged                                              |
| [`registry/products.json`](registry/products.json) | The fleet                                                                                                                                                                               |
| [`scripts/factory.mjs`](scripts/factory.mjs)       | CLI: `setup · list · new · adopt · sync · status · doctor · run · validate`                                                                                                             |
| [`.claude/skills/`](.claude/skills)                | Operator skills for running the fleet from a Claude session in this repo                                                                                                                |

## Requirements

Claude Pro or Max, Claude Code, Node.js 20.16+, git, and the GitHub CLI (`gh auth login`). Expo / EAS
is needed only for mobile products.

## Develop the factory itself

```bash
npm test                                 # unit + hook end-to-end tests
node scripts/factory.mjs validate        # manifests, templates, skills, `claude plugin validate`
claude --plugin-dir plugins/factory      # try plugin changes in a product before publishing
```

After changing a plugin, bump its `version` in `.claude-plugin/plugin.json`.
