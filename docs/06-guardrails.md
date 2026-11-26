# Guardrails

Several independent layers, so that one mistake isn't enough to cause damage. None of them is a
security sandbox. Together they make common mistakes (Claude's or yours) hard to make.

| Layer              | Where                                            | Stops                                                                         |
| ------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| 1. Permissions     | product `.claude/settings.json` (merge template) | Reading `.env*`, keys and keystores. Only pre-approves safe, routine commands |
| 2. Bash guard hook | `plugins/factory/scripts/guard-bash.mjs`         | See the table below                                                           |
| 3. File guard hook | `plugins/factory/scripts/protect-files.mjs`      | Writing secrets files, editing factory-managed files                          |
| 4. Stop gate       | `plugins/factory/scripts/stop-gate.mjs`          | Claude finishing with failing lint or typecheck                               |
| 5. Pipeline        | skills + `reviewer` subagent                     | Unspecified, unplanned, unverified or unreviewed changes                      |
| 6. CI              | reusable `ci.yml`                                | Merging red code (with a required status check)                               |
| 7. Branch rules    | GitHub ruleset on `main`                         | Direct pushes, force pushes, merges without a PR                              |
| 8. You             | PR review                                        | Everything else                                                               |

## The Bash guard

| Decision | Commands                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **deny** | `git push` to a protected branch (explicit, `HEAD:main`, or implicitly while on `main`); force push (`-f`, `--force`, `+ref`); `--all`/`--mirror`; `--no-verify`/`commit -n`; deleting a protected remote branch; `gh pr merge`; `gh repo delete`; `rm -r` on `/`, `~`, `.`, `*`; piping `curl`/`wget` into a shell or interpreter; `cat`/`head`/… of `.env*`, `*.pem`, `*.key`, keystores                      |
| **ask**  | `git reset --hard`, `git clean -f`, `git branch -D`, `--force-with-lease`, deleting a remote branch, `npm`/`pnpm`/`yarn`/`bun publish`, `eas submit`, `eas update` to production, `eas build --profile production`, `eas workflow:run`, `vercel --prod`, `netlify deploy --prod`, `firebase deploy`, `wrangler deploy`, `gh release create`, `DROP`/`TRUNCATE` SQL, `prisma migrate reset`, `supabase db reset` |

"Ask" means a human must confirm in an interactive session. In headless runs (CI, fleet runs) nobody
can confirm, so the action doesn't happen. Releases and production deploys therefore never happen
unattended.

Per product, `.factory/product.json` → `guard.protectedBranches` (default `["main", "master"]`) sets
which branches are protected. Add `release/*`-style branches there if you use them.

## The file guard

- **Secrets:** `.env`, `.env.*` (except `.example`, `.sample`, `.template`, `.defaults`), `*.pem`, `*.key`,
  `*.p8`, `*.p12`, `*.pfx`, `*.jks`, `*.keystore`, `*.mobileprovision`.
- **Managed files:** everything in `.factory/managed.json`, plus that file itself. Claude is told to
  change the template in the factory instead.

## Hooks are scoped to factory products

Every hook exits immediately unless the repo has `.factory/product.json`. So installing the plugin at
user scope doesn't affect your other repos.

## Who can trigger Claude on GitHub

`anthropics/claude-code-action` only responds to users with **write access** by default
(`allowed_non_write_users` is empty), skips fork PRs (`allow_fork_prs: false`), and restricts untrusted
PRs. The review workflow also skips PRs from forks. Keep those defaults. Issue and PR text is
**untrusted input** that can contain prompt injection, so never widen who can trigger the agent on
public repos.

## Secrets

- App secrets live in the host (Vercel, Netlify, …), EAS environment variables, or GitHub secrets.
  They're never committed, and never in client bundles unless they're explicitly public (`NEXT_PUBLIC_*`,
  `EXPO_PUBLIC_*`).
- Keep `.env.example` current. That's how Claude learns which variables exist.
- CI secrets: `CLAUDE_CODE_OAUTH_TOKEN` (Claude) and `EXPO_TOKEN` (mobile EAS jobs, optional).

## Escape hatches (use sparingly)

| Need                                      | How                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| Disable the stop gate for one session     | `FACTORY_STOP_GATE=off claude`                                                              |
| Run the stop gate in CI too               | Set `FACTORY_GATES_IN_CI=1` in the workflow env                                             |
| Let Claude push directly to a branch      | Remove it from `guard.protectedBranches` in that product's manifest                         |
| Change a managed file in one product only | Don't. Make the template configurable, or move the file to `seed/`                          |
| Bypass all plugin hooks                   | `/plugin` → disable `factory` for the session (you're now outside the factory's guarantees) |
