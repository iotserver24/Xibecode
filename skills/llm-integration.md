---
description: Prompting, tool use, and safe LLM features in applications
tags: llm, ai, prompts, openai
---

# LLM Integration in Apps

## Safety

- Treat model output as untrusted for code execution; validate and sandbox when generating code or commands.

## Cost & latency

- Cache where appropriate; bound context size; stream responses when UX allows.

## Evaluation

- Add regression prompts or evals when changing prompts or models in critical flows.
