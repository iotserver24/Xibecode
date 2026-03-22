---
description: Pull-request quality — scope, rationale, and reviewability
tags: pr, review, git
---

# Code Review & Pull Requests

## Scope

- One PR should solve one coherent problem; avoid mixing refactors with unrelated features.

## Description

- Summarize intent, approach, and risk. List notable files or areas touched.
- Mention how you verified changes (tests run, manual checks).

## Commits

- Use conventional commit style when the project does (`feat:`, `fix:`, `chore:`).
- Squash or organize commits so history is readable if the team cares.

## Reviewer experience

- Small diffs review faster; extract pure moves/renames into separate commits when possible.
- Call out breaking changes and migration steps explicitly.
