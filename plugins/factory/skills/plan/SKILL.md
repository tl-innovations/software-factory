---
name: plan
description: Produce a file-level implementation plan for an approved spec by delegating codebase exploration to the planner subagent, then save it next to the spec. Use after a spec is approved and before writing code.
argument-hint: "[path to spec, default: newest in docs/specs/]"
---

# Plan from a spec

Spec: $ARGUMENTS (if empty, use the newest `docs/specs/NNNN-*.md` that isn't a `.plan.md`).

1. Delegate to the **`planner`** subagent. Give it the spec path and tell it to follow its output format.
   Keep its exploration out of the main context and bring back only the plan.
2. Sanity-check the plan before saving it:
   - Every acceptance criterion maps to at least one test in the test plan.
   - The steps are small and ordered so the app keeps working after each one.
   - It reuses existing code (it cites `path:line`) instead of adding new dependencies.
   - Mobile: it states whether the change is OTA-safe or needs a native build.
3. Save it as `docs/specs/NNNN-<slug>.plan.md`, next to the spec.
4. Summarize the plan for the user in 5-10 lines: steps, test plan, risks and open questions.
