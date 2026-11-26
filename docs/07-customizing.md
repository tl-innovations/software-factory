# Customizing the factory

## Change the default stack for a product type

Edit `templates/<type>/template.json`:

```jsonc
{
  "scaffold": "npm create astro@latest {{PRODUCT_DIR}} -- --template minimal --install --git --yes",
  "product": {
    "framework": "astro",
    "commands": { "build": "npm run build", "typecheck": "npx astro check" },
  },
}
```

`scaffold` runs in the parent folder and must create `{{PRODUCT_DIR}}`. `product` gives the default
manifest when there's no `package.json` to detect from. When there is one (after scaffolding, or for
adopted repos), detected scripts win.

## Add a product type

For example `templates/static/` for plain HTML sites, or `templates/api/`:

1. `templates/<type>/template.json` with `type`, `description`, `scaffold`, `plugins` and `product`.
2. Optional `seed/`, `managed/` and `merge/` folders. `managed/.github/workflows/factory-ci.yml` should
   call `ci.yml` (or a new reusable workflow).
3. If the type needs its own Claude skills, add `plugins/factory-<type>/` and register it in
   `.claude-plugin/marketplace.json`. `claude-agent.yml` installs `factory-<type>@<marketplace>`
   automatically.
4. Add `"<type>"` to the `type` enum in `registry/products.schema.json`.
5. `npm test && node scripts/factory.mjs validate`.

## Add or change a skill or agent

- Skills: `plugins/<plugin>/skills/<name>/SKILL.md` with frontmatter (`description` is what Claude uses
  to decide when to load it; `disable-model-invocation: true` makes it user-invoked only;
  `argument-hint`; `allowed-tools`). Use `${CLAUDE_PLUGIN_ROOT}` to reference bundled scripts.
- Agents: `plugins/<plugin>/agents/<name>.md` with `name`, `description`, `tools` and `model`. Plugin
  agents ignore `permissionMode`, `hooks` and `mcpServers`.
- **Bump the plugin `version`** every time, or installed copies won't update.
- Check it with `claude plugin validate plugins/<plugin>`, and test locally with `claude --plugin-dir plugins/<plugin>`
  in a product repo.
- To measure whether a skill helps, `claude plugin eval` runs eval cases against a plugin (see the
  Claude Code docs).

## Add an MCP server for all products of a type

Put a `.mcp.json` in the plugin root. For example, Playwright MCP for web products, so Claude can drive
a browser during `/factory-web:audit`:

```json
{
  "mcpServers": {
    "playwright": { "command": "npx", "args": ["@playwright/mcp@latest"] }
  }
}
```

## Add a managed file

Drop it in `templates/<layer>/managed/<path>`. It's rendered with `{{FACTORY_REPO}}`, `{{FACTORY_REF}}`,
`{{MARKETPLACE}}`, `{{PRODUCT_NAME}}`, `{{PRODUCT_DIR}}`, `{{PRODUCT_TYPE}}`, `{{PRODUCT_REPO}}`, `{{DESCRIPTION}}` and `{{DEFAULT_BRANCH}}` (the product's real default branch).
Only those exact keys are replaced, so GitHub's `${{ … }}` expressions pass through. Then `sync`.

Placeholders use `{{KEY}}`, not `__KEY__`, because Markdown formatters turn `__KEY__` into bold. The
repo's `.prettierignore` also excludes `templates/`.

## Per-product overrides

| Want                          | Where                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Different checks              | `.factory/product.json` → `commands`, `ci`, `gates.onStop`                                                       |
| More or less autonomy         | `.factory/product.json` → `autonomy`                                                                             |
| Extra protected branches      | `.factory/product.json` → `guard.protectedBranches`                                                              |
| Extra Claude permissions      | `.claude/settings.json` (your additions survive sync, because arrays are unioned)                                |
| Product-specific instructions | `CLAUDE.md` (seed, never overwritten), or `.claude/rules/*.md` with `paths:` frontmatter for area-specific rules |
| Product-only skills           | `.claude/skills/<name>/SKILL.md` in the product                                                                  |
| CI model or turns             | Repo variables `FACTORY_CLAUDE_MODEL`, `FACTORY_CLAUDE_MAX_TURNS`, `FACTORY_REVIEW_MODEL`                        |

## Versioning and rollout

- **Products pin `factoryRef`** (`main` or a tag). Workflow callers reference `…@<factoryRef>`.
- Recommended: products on `v1`. You develop on `main`, test by setting one product's caller to
  `@main` (or `sync --only canary-site` with `factoryRef` temporarily `main`), then move `v1`.
- Breaking changes (renamed workflow inputs, manifest schema changes): cut `v2`, migrate products
  with `sync`, and keep `v1` working until every product has moved.
- Plugins version independently (`plugin.json` → `version`).

## Making this repo a GitHub template

```bash
gh repo edit OWNER/software-factory --template
```

Others can then **Use this template**. They run `setup`, and everything points at their copy.
