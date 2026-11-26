---
name: feature
description: Deliver a feature end-to-end through the factory pipeline (spec, plan, build, verify, review, ship), ending in a pull request for human review. Use when asked to build, add or implement a feature, or when given a GitHub issue number to implement.
argument-hint: "[issue-number | feature description]"
---

# Factory feature pipeline

Request: $ARGUMENTS

First read `CLAUDE.md` and `.factory/product.json` (`autonomy`, `commands`, `ci`). Then go through every
stage in order. Scale each stage to the change: a small change can have a five-line spec and a
three-step plan, but no stage is skipped.

## 0. Prepare

- If the request is an issue number, read it: `gh issue view <n> --comments`.
- Run `git status`. If there are unrelated uncommitted changes, stop and ask.
- Start from the up-to-date default branch: `git fetch origin`, then `git switch -c feat/<NNNN>-<slug> origin/HEAD`
  (use `origin/main` if `origin/HEAD` isn't set). `NNNN` is the spec number from step 1.

## 1. Spec

Use the factory `spec` skill (`/factory:spec`) to write `docs/specs/NNNN-<slug>.md`.

**Gate:** if `autonomy` is `supervised` or `standard` and this is an interactive session, show the user the
acceptance criteria and wait for approval or edits.

## 2. Plan

Use the factory `plan` skill (`/factory:plan`). It delegates exploration to the `planner` subagent and
writes `docs/specs/NNNN-<slug>.plan.md`.

**Gate:** if `autonomy` is `supervised` and this is an interactive session, show the plan and wait.

## 3. Build

For each plan step:

1. Write or extend tests for that step's acceptance criteria first. For a larger suite, use the
   `test-writer` subagent.
2. Implement the smallest change that makes them pass, following the patterns the plan cites.
3. Run the fast checks: `node "${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs" --only lint,typecheck`, plus the relevant tests.
4. Commit the step: `feat(<scope>): <what changed>`.

If the plan turns out to be wrong, update the plan file and say what changed and why. Don't silently diverge.

## 4. Verify

Use the factory `verify` skill. Every check in `ci` must pass before you continue.

## 5. Review

Use the factory `review` skill (the `reviewer` subagent). Fix every BLOCKER and MAJOR finding, then re-verify.

## 6. Ship

Use the factory `ship` skill: push, then open the PR with the spec, plan summary and verification evidence.
**Stop when the PR is open. Never merge.**

## Non-interactive runs (CI, `claude -p`, fleet runs)

Never wait at a gate, but **never skip a stage either**. Review (the `reviewer` subagent) runs in every
mode. Unattended work has no human watching, so it matters even more there. Put the acceptance criteria and a plan summary in the PR body under **Spec** and
**Plan**, so the human approves them at review time.

In a **fleet run** the runner commits, pushes and opens the PR from your final summary. Skip `ship` (only `ship`),
keep the spec and plan files in the diff, and start your final summary with **Spec** (acceptance
criteria), **Plan** and **Review** (the reviewer's verdict and what you fixed) sections.

## Final report

PR link · the acceptance criteria (met or not) · the checks you ran and their results · anything you
couldn't do or verify.
