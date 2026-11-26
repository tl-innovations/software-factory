# Fleet operations

Run every command from the factory repo: `node scripts/factory.mjs <command>`, or `npm run factory -- <command>`.
Selection flags work on all fleet commands: `--only a,b`, `--type web|mobile`, and `--all` (include `paused`/`archived`).

| Command               | What it does                                                                       | Touches GitHub |
| --------------------- | ---------------------------------------------------------------------------------- | -------------- |
| `list`                | Shows the registry                                                                 | no             |
| `status`              | Last push, open PRs (Claude / factory), default-branch CI per product              | read           |
| `doctor`              | Tools, config, manifest validity, managed-file drift, plugin enablement, CI secret | read           |
| `new <name> --type …` | Scaffold → templates → commit → `gh repo create` → register                        | write          |
| `adopt <owner/repo>`  | Detect stack → templates on `chore/factory-adopt` → PR → register                  | write (PR)     |
| `sync`                | Re-apply templates → one PR per product on `factory/sync`                          | write (PRs)    |
| `run "<prompt>"`      | Headless Claude in each product → one PR per product                               | write (PRs)    |
| `validate`            | Lint the factory itself (used by its own CI)                                       | no             |

Or ask Claude: open `claude` in the factory repo and say "what's failing across the fleet?" or
"sync the web products". The operator skills (`/fleet-status`, `/fleet-sync`, `/fleet-run`,
`/new-product`, `/adopt-product`) wrap these commands with the right checks.

## Rolling out a standards change

1. Edit the template (for example `templates/common/managed/.factory/standards.md`) or a reusable workflow.
2. Open a PR **in the factory**. CI runs `npm test` and `validate`. Merge it.
3. If you pin a tag, move it: `git tag -f v1 && git push -f origin v1`. Or cut `v2` and update
   `factoryRef`.
4. `node scripts/factory.mjs sync --dry-run` to see which products change, then `sync`.
5. Review and merge the `chore(factory): sync factory standards` PRs. Re-running sync updates the same
   PR instead of opening a new one.

`sync` refuses to run while templates, plugins or workflows have uncommitted changes, because products
reference what's on GitHub.

## Plugin changes

Plugins aren't synced into repos. They're installed from the marketplace. After changing a skill,
agent or hook:

1. Bump `version` in that plugin's `.claude-plugin/plugin.json`, then commit and push.
2. Locally: `claude plugin marketplace update software-factory`, then `/reload-plugins` (or restart).
3. CI picks it up on the next run (the action installs plugins fresh).

## Fleet runs: one change, many repos

```bash
node scripts/factory.mjs run "Upgrade to the latest Next.js minor version, fix any breaking changes, and make sure ci passes" --type web
node scripts/factory.mjs run --prompt-file prompts/add-privacy-page.md --only acme-site,acme-promo
node scripts/factory.mjs run "Add a GitHub link to the footer" --only acme-site --dry-run
```

For each product, the runner:

1. Clones or fetches into `.workspace/<name>` and creates `factory/run-<slug>` from the default branch.
2. Runs `claude -p` with the prompt on stdin: `--permission-mode acceptEdits`, the configured model and
   max-turns, plus an appended system prompt (unattended, run the `ci` checks, don't commit).
   Workspace clones are never "trusted" folders, so headless Claude would ignore the product's
   `permissions.allow`. The runner passes it explicitly instead (`--allowedTools`/`--disallowedTools`
   from the product's `.claude/settings.json`), and loads the factory plugins from this checkout with
   `--plugin-dir`, so the guard hooks and stop gate always apply. Your personal `~/.claude` settings (hooks, formatters, plugins) are excluded
   (`--setting-sources project,local`), so a run behaves the same on any machine. Dependencies are
   installed (`commands.install`) before Claude starts.
3. Commits whatever changed, pushes (force-with-lease, since it's a factory-owned branch) and opens
   or updates a PR that includes Claude's summary.
4. Saves the full JSON output to `.workspace/runs/<date>-<slug>/<product>.json`.

Products run **one at a time**. That's deliberate: it keeps the load on your subscription smooth and
lets you stop (Ctrl+C) after the first one or two if the results are off. Start with `--only` on one
product, check the PR, then widen.

**Good fleet-run prompts** are specific about the outcome and the "done" check, and say what to do
when the change doesn't apply. For example: _"If this repo has no contact form, change nothing and say so."_

## Recurring maintenance

Options, from simplest to most hands-off:

- **Calendar + fleet run:** a monthly `run "Update dependencies within their current major versions…"`.
- **Cloud scheduled tasks** (`/schedule` in Claude Code, or claude.ai/code): a prompt plus one or more
  repos on a cron schedule, running in Anthropic's cloud on your subscription. Research preview.
  Good for weekly audits ("run /factory-web:audit and file issues for anything new").
- **GitHub cron in a product:** a workflow with `on: schedule` that calls `anthropics/claude-code-action`
  with a `prompt`. It runs per repo and uses your token.

Keep scheduled work report-only (it files issues) until you trust it. Work that opens PRs comes next.

## The registry

`registry/products.json` is the source of truth for fleet commands. `new` and `adopt` write it, and
you can edit it by hand. Fields: `name`, `repo`, `type`, `status` (`active` | `maintenance` | `paused` |
`archived`), `description`, `framework`, `deploy`, `localPath`, `tags`, `addedAt`. The schema is at
`registry/products.schema.json`.

## Workspace hygiene

`.workspace/` clones are disposable. Never work in them by hand. If one is dirty, the CLI refuses
to touch it. Delete the folder and the next command re-clones it.
