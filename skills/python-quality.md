---
description: Python packaging, typing, and project layout
tags: python, pip, uv, typing
---

# Python Quality

## Layout

- Prefer `src/` layouts when the repo already uses them; match `pyproject.toml` or `setup.cfg` style.
- Use virtual environments; never commit `.venv` or `__pycache__`.

## Typing

- Prefer type hints on public functions; use `from __future__ import annotations` when the project does.
- Match strictness to existing `mypy` / `pyright` config.

## Tools

- Prefer `uv` or `pip` to match lockfiles (`uv.lock`, `requirements.txt`).
- Format and lint with whatever the project uses (`ruff`, `black`, `isort`).
