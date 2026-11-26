# Running the factory on a Claude subscription

Everything in this factory runs on a **Claude Pro or Max** subscription. There's no API key and no
pay-per-token billing. The trade-off is that **all usage draws from one shared allowance**: your
claude.ai chats, interactive Claude Code sessions, GitHub Actions runs with your OAuth token, cloud
sessions and scheduled tasks all count against the same limits.

> Facts below come from the official docs as of late 2026 (see [08-research-notes.md](08-research-notes.md)).
> Plan limits change, so check `/usage` in Claude Code and the plan page for current numbers.

## Where usage goes

| Activity                         | Relative cost                    | Control knob                                                                           |
| -------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------- |
| Interactive `/factory:feature`   | High (long sessions, subagents)  | Choose the model per session (`/model`). Keep specs tight                              |
| Parallel worktree sessions       | Multiplies the above             | 2-3 at a time is plenty                                                                |
| `@claude` in GitHub Actions      | Medium per run                   | Triggered only by mention or label. `FACTORY_CLAUDE_MODEL`, `FACTORY_CLAUDE_MAX_TURNS` |
| Claude PR review                 | Low to medium per PR             | Opt-in label by default. `FACTORY_AUTO_REVIEW` per repo                                |
| `factory run` across N products  | N × a session                    | `--only`, `--type`, `--dry-run`, sequential execution, `fleetRun.model`                |
| Cloud sessions / scheduled tasks | Like a session                   | Frequency (hourly at most), scope                                                      |
| Stop gate, verify, sync, status  | **None** (deterministic scripts) | n/a                                                                                    |

## Defaults in this factory that protect your allowance

- Nothing triggers Claude on `push`. GitHub runs happen only on `@claude`, the `claude` label, or the
  `claude-review` label.
- CI defaults to **Sonnet** with turn caps. Use Opus interactively, where you can watch it work.
- Fleet runs are sequential and ask for confirmation when they target more than one product.
- The checks (lint, test, build) are plain scripts, so they cost no usage, and the stop gate caches
  trees that already passed.
- Review concurrency cancels superseded runs, and agent runs are serialized per issue or PR.

## The CI token

```bash
claude setup-token
```

- It prints a long-lived (about one-year) OAuth token. Store it as the `CLAUDE_CODE_OAUTH_TOKEN` secret.
  The workflows pass it to `anthropics/claude-code-action` as `claude_code_oauth_token`.
- **It's tied to the subscription of the person who ran it.** Every CI run anywhere it's installed uses
  _your_ allowance.
- Rotate it by running the command again and updating the secret (one command if you use an org secret).
- If CI fails with authentication errors right after you change plans, generate a new token.
- GitHub Actions **minutes** are billed by GitHub separately. Public repos get them free, and private
  repos have a monthly quota.

## Things that need an API key, not a subscription

- `claude --bare` (minimal headless mode) doesn't read OAuth or subscription credentials. The fleet
  runner deliberately uses plain `claude -p`, which works with your login.
- `--max-budget-usd` is a cost cap. On a subscription, use `--max-turns` instead (the factory does).

## When to move beyond a personal subscription

A personal subscription is for **you**. Consider a Team or Enterprise plan, or Claude Console API keys
for CI (the action's `anthropic_api_key` input), when:

- other people trigger `@claude` or fleet runs on repos that use your token,
- CI usage regularly crowds out your interactive work, or
- you need per-repo cost attribution.

Switching is a one-line change in `.github/workflows/claude-agent.yml` and `claude-review.yml`:
replace `claude_code_oauth_token` with `anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}`.
