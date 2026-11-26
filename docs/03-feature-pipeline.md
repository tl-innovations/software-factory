# Day-to-day: building in a product

## Three ways to start work

| Where             | How                                                                                                              | Best for                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Your terminal** | `cd acme-site && claude`, then `/factory:feature 42` or `/factory:feature add a pricing page`                    | Most work. You see everything, and approvals are instant         |
| **GitHub**        | Open an issue from the **Feature** or **Bug** form, add the `claude` label (or comment `@claude implement this`) | Small, well-specified work, or from your phone                   |
| **Fleet**         | `node scripts/factory.mjs run "…" --only acme-site,acme-promo` from the factory                                  | The same change in many repos (see [04](04-fleet-operations.md)) |

## The skills

| Skill                                | What it does                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| `/factory:feature [issue \| text]`   | Full pipeline: spec → plan → build → verify → review → ship                                  |
| `/factory:bugfix [issue \| text]`    | Reproduce → failing test → root cause → minimal fix → verify → ship                          |
| `/factory:spec`                      | Write `docs/specs/NNNN-slug.md` with testable acceptance criteria                            |
| `/factory:plan`                      | `planner` subagent → `NNNN-slug.plan.md` (files, steps, AC → tests)                          |
| `/factory:verify [--only lint,test]` | Run everything in `ci`, fix failures (max 3 rounds), report                                  |
| `/factory:review`                    | `reviewer` subagent checks the diff against the spec and standards, then fixes BLOCKER/MAJOR |
| `/factory:ship`                      | Conventional commit, push, PR with evidence. **Never merges**                                |
| `/factory:onboard`                   | After adopt/new: check the commands work, fill in CLAUDE.md                                  |
| `/factory-web:audit [url]`           | Lighthouse, accessibility, SEO and security headers → prioritized report                     |
| `/factory-web:e2e`                   | Playwright tests mapped to acceptance criteria                                               |
| `/factory-mobile:ota`                | OTA-safety check → preview update → production update (human go)                             |
| `/factory-mobile:release`            | Preflight → store build or OTA → version → notes → build and submit (human go)               |

Claude also picks the core skills up by itself. "Fix the broken signup form" usually leads to
`bugfix`. The release, OTA and onboard skills only run when you invoke them.

## Autonomy: how often Claude stops to ask

Set it in `.factory/product.json`:

| `autonomy`             | Stops for approval after     | Use for                                                         |
| ---------------------- | ---------------------------- | --------------------------------------------------------------- |
| `supervised` (default) | the spec **and** the plan    | New products, risky areas, anything with payments, auth or data |
| `standard`             | the spec                     | Products whose patterns are well established                    |
| `autonomous`           | nothing (still ends at a PR) | Content sites, internal tools, low-risk repos with good tests   |

In CI and fleet runs there's nobody to ask, so Claude puts the spec and plan into the PR and you approve
them during review.

## Backpressure: the stop gate

While Claude works, the core plugin's **Stop hook** runs `gates.onStop` (by default `lint` and
`typecheck`) whenever Claude tries to finish with changed files. If they fail, Claude is told what failed
and keeps going. It gives up after two blocks in a row, so it can't loop forever, and it skips trees it
has already passed. Keep these gates fast (under about 60 seconds). Turn it off for a session with
`FACTORY_STOP_GATE=off claude`.

## Working on several features at once

Run parallel sessions in separate git worktrees, so they never touch each other's files:

```bash
claude -w pricing-page       # session 1 in its own worktree + branch
claude -w fix-nav            # session 2
```

Two or three parallel sessions is the practical limit for one person reviewing the output, and for
subscription usage.

## Web specifics

- **Previews:** connect each site to your host's Git integration (Vercel, Netlify or Cloudflare Pages).
  Every PR gets a preview URL. Review the PR there and run `/factory-web:audit <preview-url>` on it.
- **Accessibility, performance and SEO** are in the standards, and Claude PR review checks them.
  `/factory-web:audit` measures them.

## Mobile specifics

- **OTA-safe vs native.** Every mobile PR says which it is (the PR template asks). JS and asset changes can
  ship over the air with `/factory-mobile:ota`. Native changes (new native modules, SDK upgrades,
  permissions, app config) need `/factory-mobile:release`.
- **Previews:** set `FACTORY_EAS_PREVIEW=true` plus the `EXPO_TOKEN` secret, and every PR publishes an
  EAS Update to branch `pr-<number>` that testers open in a preview build.
- **Store releases are human-approved.** The guard hook asks before `eas submit`, production
  `eas update`, production `eas build` and `eas workflow:run`.

## Habits that make the factory work

- **Write the acceptance criteria yourself** for anything important. They're the contract Claude is
  reviewed against.
- **Review the PR, not the chat.** The PR has the spec, plan, evidence and diff.
- **Teach the system, not the session.** When Claude gets something wrong twice, add a line to the
  product's CLAUDE.md (product-specific) or to the factory standards (fleet-wide).
- **Keep PRs small.** If a feature needs more than about 400 changed lines, split the spec.
