---
name: review
description: Get an independent review of the current branch from the reviewer subagent (diff vs spec and factory standards), then fix what matters. Use after implementation and before shipping, or when asked to review the current changes.
argument-hint: "[path to spec]"
---

# Review the current branch

1. Find the spec. Use $ARGUMENTS, or the spec whose number matches the branch name (`feat/NNNN-…`), or
   ask the user.
2. Delegate to the **`reviewer`** subagent. Give it the spec path (and plan path, if one exists) and the
   base branch. It reviews independently. Don't pass it your own opinion of the code.
3. Triage the findings it returns:
   - **BLOCKER / MAJOR**: fix them now, re-run the factory `verify` skill, and say what you changed.
   - **MINOR**: fix the cheap ones. List the rest under "Follow-ups" in the PR body.
   - If you disagree with a finding, say why, with evidence. Don't ignore it silently.
4. If you made substantial fixes, run the reviewer once more. At most 2 review rounds.
5. Report: the verdict, what you fixed, and what was deferred.
