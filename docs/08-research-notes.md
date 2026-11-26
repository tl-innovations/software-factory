# Research notes

These notes record why the factory looks the way it does: what other people built, what the official
docs say, and where this implementation agrees or differs. Compiled November 2026 against Claude Code
2.1.332.

## What others have built

| Project / article                                                                                                                    | Shape                                                                                         | What we took                                                                                     | What we did differently                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| [alexop.dev: The Software Factory](https://alexop.dev/posts/the-software-factory/)                                                   | Essay: spec → parallel agents → tests/lint "backpressure" → human PR review                   | Backpressure from deterministic checks; capped retries before handing back to a human            | Concrete, multi-repo implementation                                                                           |
| [Agents meta-repo pattern](https://blog.rubbad.uk/2026/03/05/blog-agents-meta-repo-pattern.html)                                     | Central context repo beside product repos (`AGENTS.md`, `repos.yaml`, cross-repo workflows)   | A central control repo + registry; per-repo files hold local facts; scripts beat clever tooling  | Distribution through plugins, reusable workflows and sync PRs, instead of a shared context folder agents read |
| [freeCodeCamp: software factory with Claude Code](https://www.freecodecamp.org/news/how-to-build-software-factory-with-claude-code/) | Per-repo agents (researcher, spec-writer, builders, verifier), skills, hooks, human approvals | Read-only vs write agents, approval gates, hooks as enforcement, "AI review isn't approval"      | Fewer agents (planner, reviewer, test-writer); the stages live in skills, not seven agents                    |
| [disler/super-simple-software-factory](https://github.com/disler/super-simple-software-factory)                                      | Code owns the loop; agents are bounded phases with enforced write scopes                      | "Code owns sequencing and gates" → fleet runner, sync, verify and stop gate are scripts          | Leaner: no per-phase diff enforcement; relies on hooks, PRs and human review                                  |
| [greynewell/claude-software-factory](https://github.com/greynewell/claude-software-factory)                                          | GitHub Actions-only: issue → PR → review → auto-merge shepherd                                | Issue forms, `@claude` workflows, PR template                                                    | **No auto-merge** by default; reusable workflows instead of copies in each repo                               |
| [Claude Code Ultimate Guide: agentic software factories](https://github.com/FlorianBruniaux/claude-code-ultimate-guide)              | Map of options from a single session up to commercial platforms                               | Use the native stack for small teams; ask whether a deterministic gate or an LLM grades the code | —                                                                                                             |

**Consensus across sources:** a root facts file per repo; separate read-only and write roles; spec/plan
written down before code; deterministic checks decide "done"; bounded retries, then escalate to a human;
a human owns merge accountability; hooks enforce what prompts can only request; start small and grow
from observed failures.

**Where sources disagree:** auto-merge (greynewell: yes; most others: no). This factory makes autonomy a
dial and never merges. Whether an LLM reviews LLM output: we use the reviewer as _advisory_, with
deterministic gates as the authority.

## Claude Code features this factory relies on (verified in the docs)

| Feature                                                                                                                           | Used for                                          | Docs                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plugin marketplaces (`.claude-plugin/marketplace.json`, relative `source`)                                                        | Distributing skills, agents and hooks             | [plugins/marketplace-reference](https://code.claude.com/docs/en/plugins/marketplace-reference.md)                                                        |
| `extraKnownMarketplaces` + `enabledPlugins` in project settings                                                                   | Products prompting install of the factory plugins | [plugins/install](https://code.claude.com/docs/en/plugins/install.md)                                                                                    |
| Skills (`SKILL.md` frontmatter, `$ARGUMENTS`, `${CLAUDE_PLUGIN_ROOT}`)                                                            | Pipeline stages                                   | [skills](https://code.claude.com/docs/en/skills.md)                                                                                                      |
| Subagents (`agents/*.md`: `tools`, `model`)                                                                                       | planner, reviewer, test-writer                    | [sub-agents](https://code.claude.com/docs/en/sub-agents.md)                                                                                              |
| Hooks: `PreToolUse` (JSON `permissionDecision` deny/ask), `Stop` (exit 2 blocks), `CLAUDE_PLUGIN_DATA`                            | Guards, stop gate                                 | [hooks](https://code.claude.com/docs/en/hooks.md)                                                                                                        |
| CLAUDE.md `@path` imports, `.claude/rules/` with `paths:`                                                                         | Standards import; area rules                      | [memory](https://code.claude.com/docs/en/memory.md)                                                                                                      |
| Headless `claude -p` (prompt on stdin, `--output-format json`, `--permission-mode`, `--max-turns`, `--append-system-prompt`)      | Fleet runs                                        | [headless](https://code.claude.com/docs/en/headless.md)                                                                                                  |
| `claude -w` worktrees                                                                                                             | Parallel sessions                                 | [cli-reference](https://code.claude.com/docs/en/cli-reference.md)                                                                                        |
| `anthropics/claude-code-action@v1` (`claude_code_oauth_token`, `plugin_marketplaces`, `plugins`, `track_progress`, `claude_args`) | `@claude` and PR review in CI                     | [github-actions](https://code.claude.com/docs/en/github-actions.md), [action.yml](https://github.com/anthropics/claude-code-action/blob/main/action.yml) |
| `claude setup-token`                                                                                                              | Subscription auth for CI                          | [github-actions](https://code.claude.com/docs/en/github-actions.md)                                                                                      |
| Scheduled cloud tasks (`/schedule`), Claude Code on the web, `claude --cloud`                                                     | Background and recurring work                     | [routines](https://code.claude.com/docs/en/routines.md), [web](https://code.claude.com/docs/en/claude-code-on-the-web.md)                                |
| `claude plugin validate`, `claude plugin eval`, `--plugin-dir`                                                                    | Factory CI, plugin testing                        | `claude plugin --help`                                                                                                                                   |

Caveats found during research:

- `--bare` mode skips hooks, skills, plugins and CLAUDE.md, and never reads subscription credentials.
  Don't use it here.
- Auto-update is off by default for third-party marketplaces. Bump plugin versions and update explicitly.
- Usage limits are shared across claude.ai, Claude Code and CI runs using your OAuth token
  ([support article](https://support.claude.com/en/articles/11145838-claude-code-usage-and-permissions)).
- Scheduled cloud tasks are a research preview, and run at most hourly.

## Mobile (Expo / EAS)

- Expo's recommended 2026 split: GitHub Actions for lint, types and tests; **EAS Workflows** for native
  builds, signing, store submission and OTA updates ([EAS Workflows](https://docs.expo.dev/eas/workflows/get-started/),
  [building on CI](https://docs.expo.dev/build/building-on-ci/)).
- `.eas/workflows/*.yml` jobs: `build`, `submit`, `update`, `fingerprint`, `get-build`, … with
  `needs` and `${{ needs.<job>.outputs.build_id }}`. Run with `eas workflow:run <file>`.
- `eas update --branch/--channel … --environment … --non-interactive`. `--environment` is required on
  newer SDKs.

## GitHub

- Reusable workflows (`on: workflow_call`). The `github` context is the caller's. Callers grant
  permissions. Secrets are passed explicitly. Private repos need an access policy
  ([docs](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)).
- Rulesets on private repos need a paid plan.

## Validation performed on this template

- `npm test`: 21 tests covering template rendering and idempotent sync, stack detection, the Bash and
  file policies, fleet-run session arguments, and end-to-end runs of every hook script and `verify.mjs`.
- `node scripts/factory.mjs validate`, including `claude plugin validate` on the marketplace and all
  three plugins. It also passes with an empty `CLAUDE_CONFIG_DIR`, as on a fresh CI runner.
- `actionlint` 1.7.12 on all reusable workflows, this repo's self-check, and rendered web and mobile
  product workflows.
- `js-yaml` parse of the issue forms and the EAS workflow.
- **End-to-end `factory new`** (without GitHub) for both types:
  - Web: `create-next-app` → manifest detected (next, npm, lint/typecheck/build), and the
    baseline check is **green**.
  - Mobile: `create-expo-app` (SDK 58) → `postScaffold` runs `expo lint` once to generate the ESLint
    config. `expo-doctor` and `expo export` pass. The stock template fails `lint` (a React
    `set-state-in-effect` rule) and `tsc` (three type errors). That's upstream code. The CLI reports it,
    and `/factory:onboard` fixes it in the first PR.
- **Live headless Claude** sessions (Haiku) in an untrusted, scaffolded product:
  - `git push origin main` is denied by the plugin hook, and the call shows up in `permission_denials`.
  - With the fleet runner's arguments, `npm run lint` is allowed and `cat .env` is denied.

## Live end-to-end test on GitHub (November 2026)

The factory was published to a GitHub org and run against three real product repos: a new Next.js
site (public), a new Expo app (private), and an existing Vite site that had never seen the factory
(private, adopted). Every lifecycle step ran for real: `new`, `adopt`, CI, `sync`, `run` (onboard and
feature), `status`, `doctor`, marketplace install from GitHub, branch rulesets, and merges.

Bugs it found (all fixed, with regression tests where possible):

| Symptom | Cause | Fix |
|---|---|---|
| Product CI never ran after `new` | Scaffolders run their own `git init`, which follows `init.defaultBranch` (often `master`). CI callers only triggered on `main` | `new` renames to `main`. CI callers render `{{DEFAULT_BRANCH}}` from each product's real default branch (adopt, sync, doctor) |
| Next.js `typecheck` green locally, red in CI | Next 15.5+ declares `LayoutProps`/`PageProps` in gitignored `.next/types` | Typecheck for Next is `next typegen && tsc --noEmit`. The `new` baseline now runs on a clean clone with a fresh install, like CI |
| Vite `typecheck` always green, even with type errors | Solution-style `tsconfig.json` (`files: []` + `references`) makes `tsc --noEmit` check nothing | Detection uses `tsc -b --noEmit` when `references` are present |
| First fleet-run onboarding did nothing useful | Fresh clones have no `node_modules`. The stop gate failed on missing binaries, and `npm ci` wasn't allowed | The runner installs `commands.install` before Claude starts. Lockfile installs are allowed in product settings |
| Fleet-run PR full of formatting churn | The operator's personal `~/.claude` PostToolUse formatter ran inside the product | Fleet runs use `--setting-sources project,local` |
| Headless Claude ignored the product's `permissions.allow` | Workspace clones are never "trusted" folders | The runner passes `--allowedTools`/`--disallowedTools` and `--plugin-dir` explicitly |
| Factory self-check would have failed on its first run | The official actionlint image includes shellcheck (SC2129) | Grouped `$GITHUB_OUTPUT` redirects |

Things that worked first time: the reusable `ci.yml` on all three stacks (npm, Next, Expo, Vite +
oxlint); skipping the opt-in review and the EAS jobs; `sync` idempotency and PR reuse; the JSON settings
merge; marketplace install from GitHub; the documented ruleset (a direct push to `main` was rejected with
GH013, and merging a red PR was refused); and headless onboarding that took a stock Expo template from
2 failing checks to 4 green ones (19 turns).
