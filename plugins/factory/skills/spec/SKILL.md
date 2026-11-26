---
name: spec
description: Write a short, testable spec in docs/specs/ for a feature, bug or change before any planning or code. Use when starting new work, or when asked to write up, scope or clarify requirements.
argument-hint: "[issue-number | description]"
---

# Write a factory spec

Input: $ARGUMENTS

1. Gather context. If the input is an issue number: `gh issue view <n> --comments`. Read `CLAUDE.md`,
   and skim the code areas involved so the spec matches reality.
2. Number it: find the highest `NNNN-` prefix in `docs/specs/` and add 1 (start at `0001`). The slug is
   3-5 kebab-case words.
3. If this is interactive and an ambiguity would materially change the result, ask up to 5 sharp
   questions first. Otherwise record your assumptions under **Open questions**.
4. Write `docs/specs/NNNN-<slug>.md` using the template below. Keep it to about one screen.
5. Acceptance criteria must be **observable and testable**: "Given / when / then", or a measurable
   threshold. "Works well" is not a criterion.

```markdown
# NNNN: <Title>

- **Status:** draft
- **Issue:** #<n> (or n/a)
- **Type:** feature | bug | chore

## Problem

Who has the problem, what it is, and why it matters now.

## Acceptance criteria

- [ ] **AC1:** Given …, when …, then …
- [ ] **AC2:** …

## Out of scope

- …

## UX notes

Screens or routes affected. Loading, empty and error states. Copy. Accessibility notes.

## Technical notes

Data, APIs, env vars, migrations, analytics events. Mobile: OTA-safe, or needs a native build?

## Open questions

- …
```

When it's approved (or in non-interactive runs, once the PR is opened) set **Status** to `approved`.
