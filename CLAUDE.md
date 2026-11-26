# Software factory (control repo)

This repo manages a fleet of product repos (websites and mobile apps). It contains **no product code**.
You operate the fleet from here; product work happens in each product's own repo.

## Map

- `scripts/factory.mjs`: the fleet CLI (zero dependencies). Commands: `setup`, `list`, `new`, `adopt`,
  `sync`, `status`, `doctor`, `run`, `validate`. `node scripts/factory.mjs <cmd> --help` for options.
- `registry/products.json`: the fleet. `factory.config.json`: factory repo, ref, marketplace, dirs.
- `plugins/{factory,factory-web,factory-mobile}`: Claude Code plugins products install from this marketplace
  (`.claude-plugin/marketplace.json`).
- `.github/workflows/*.yml`: reusable workflows products call (`ci`, `claude-agent`, `claude-review`, `mobile-eas`).
  `factory-self-check.yml` is this repo's own CI.
- `templates/{common,web,mobile}/{seed,managed,merge}`: files rendered into products. Placeholders are
  `{{KEY}}` (see `TEMPLATE_VARS` in `scripts/lib/templates.mjs`).
- `.workspace/`: disposable clones used by `sync`/`run` (gitignored). Never edit them by hand.
- `docs/`: start at `docs/README.md`.

## Rules for working in this repo

- **Fleet-changing commands need explicit user confirmation:** `new`, `adopt`, `sync` (without
  `--dry-run`), and `run`. They create repos, push branches or open PRs. Always do a dry run first and
  show the user the plan. `status`, `doctor`, `list` and `validate` are read-only.
- `run` spends the user's Claude subscription once per product. Suggest `--only` on one product first.
- After changing anything in `plugins/`, `templates/`, `.github/workflows/` or `scripts/`:
  `npm test && node scripts/factory.mjs validate`.
- When you change a plugin, bump `version` in its `.claude-plugin/plugin.json`.
- Product repos reference reusable workflows at `factoryRef`, so a changed workflow input or a removed
  managed file is a **breaking change**. Call it out, and see `docs/07-customizing.md#versioning-and-rollout`.
- Templates must stay byte-exact. `.prettierignore` excludes `templates/`. Don't introduce `__KEY__`
  placeholders (Markdown formatters turn them into bold).
- Product-specific knowledge belongs in that product's CLAUDE.md, not here. Fleet-wide engineering
  standards live in `templates/common/managed/.factory/standards.md`.
