# XibeCode Daemon, Memory, and Compacting Plan

**Status:** Implemented (MVP phases 1–5)  
**Primary focus:** `xibecode daemon` / gateway mode  
**Reference:** Grok Build memory and session harness in `grok-build/`  
**Date:** 2026-08-18

## Goal

Make daemon mode reliable for long-running, multi-session coding work. After a restart, compaction, crash, or days of background operation, XibeCode should know:

- what the user asked for;
- what work was completed;
- which files changed;
- which commands and tests passed or failed;
- what decisions and project facts were discovered;
- what remains unfinished;
- which previous sessions are relevant to the current request.

The design should follow Grok Build's useful separation:

1. full session history;
2. short run handoffs;
3. curated project/user memory;
4. searchable retrieval;
5. consolidation that removes noise and duplicates.

Do not merge all information into one large `MEMORY.md`. Temporary execution state and durable knowledge have different lifetimes and retrieval needs.

---

## Current XibeCode foundation

Existing pieces to reuse:

- `packages/cli/src/commands/gateway.ts` — daemon/gateway command and systemd lifecycle;
- `packages/cli/src/gateway/` — daemon event and agent runner infrastructure;
- `packages/core/src/agent.ts` — agent loop, compaction hooks, evidence trail, completion gates;
- `packages/core/src/session-manager.ts` — append-only JSONL transcripts and resume;
- `packages/core/src/transcript-reader.ts` / `transcript-writer.ts` — crash-tolerant transcript persistence;
- `packages/core/src/session-memory.ts` — failures and learnings;
- `packages/core/src/learning-loop/session-fts.ts` — session search index;
- `packages/core/src/auto-memory/` — Markdown memory extraction and consolidation;
- `packages/core/src/memory.ts` — existing project-local neural-memory record format;
- `packages/core/src/hooks/` — `PreCompact`, `PostCompact`, `SessionStart`, and `SessionEnd` lifecycle hooks.

The main weakness is integration: daemon runs do not consistently connect their session ID, transcript path, run summary, and session-search document into one lifecycle.

---

## Target memory model

### 1. Session transcript: complete history

**Lifetime:** permanent until user deletes it.  
**Storage:** existing project-scoped JSONL session file.

Record user messages, assistant messages, tool calls, tool results, compaction handoffs, approvals, errors, and lifecycle events. The transcript is the source of truth for replay and resume.

Requirements:

- one canonical session ID across daemon, agent, transcript, `SessionMemory`, and gateway events;
- flush queued writes before daemon shutdown;
- tolerate a partial final JSONL line after a crash;
- retain session metadata at the tail for fast listing;
- persist daemon-originated prompts and synthetic continuation prompts with an explicit marker.

### 2. Run handoff: concise continuity summary

**Lifetime:** permanent with the session.  
**Purpose:** let a fresh agent orient without replaying the entire transcript.

Write one structured handoff at each completed, failed, interrupted, and compacted run:

```md
# Run Handoff

## Task
...

## Status
completed | failed | interrupted | blocked

## Changed files
- ...

## Validation
- command: ...
- result: passed | failed | not run

## Decisions and discoveries
- ...

## Failed approaches
- ...

## Remaining work
- ...
```

The handoff must be generated from observed tool events and test results. The model may summarize, but it must not invent validation or file changes.

### 3. Curated memory: reusable facts

**Lifetime:** long-term.  
**Storage:** existing curated `MEMORY.md` / `USER.md` system.

Store only reusable facts:

- project architecture and conventions;
- package manager and test commands;
- stable user preferences;
- decisions that affect future work;
- durable debugging lessons.

Do not store transient progress, current task status, message counts, or raw tool logs.

### 4. Search index: retrieval across old sessions

**Lifetime:** rebuildable cache.  
**Storage:** existing `session-fts` index, upgraded incrementally.

Index every completed daemon session and each run handoff automatically. Search should return:

- session ID;
- project path;
- date;
- title/task;
- matching snippet;
- changed files;
- status;
- transcript/handoff path.

Start with FTS keyword search. Add embeddings only after correctness, indexing, and lifecycle durability are working.

---

## Compact command

XibeCode needs an explicit compact command for daemon and interactive sessions.

### User-facing forms

Support both forms where the command parser already supports slash commands:

```text
/compact
compact
```

For the CLI command surface, use:

```bash
xibecode compact
xibecode compact --session <session-id>
xibecode compact --all-context   # optional later diagnostic mode
```

### Behavior

When invoked:

1. stop accepting a second compact request for the same session;
2. flush pending transcript and event writes;
3. run `PreCompact` hooks;
4. write a memory flush / run handoff containing decisions, discoveries, failures, changed files, and remaining work;
5. compact the conversation using the existing token-budget compactor;
6. preserve the latest user request, active plan, pending questions, task markers, and critical tool results;
7. insert a clearly marked handoff message into the new context;
8. run `PostCompact` hooks;
9. re-index the updated handoff;
10. emit daemon status and continue the session without losing the pending request.

### Automatic compacting

Keep automatic compaction, but make it use the same pipeline as manual `/compact`:

- trigger before the context window becomes critical;
- flush memory before discarding messages;
- compact once per threshold crossing;
- expose progress to Telegram, Discord, Slack, and terminal clients;
- never silently discard an active plan or unresolved failure.

### Compact response

The user should receive a short status such as:

```text
Compacted context. Preserved the active task, 3 changed files, 2 validation results, and 1 unresolved blocker.
```

---

## Daemon architecture changes

### Phase 1 — Canonical session lifecycle

- [x] Define a daemon session context containing `sessionId`, `cwd`, transcript path, model, channel, and task ID.
- [x] Pass this context into `EnhancedAgent`, `SessionMemory`, post-turn review, and gateway event persistence.
- [x] Remove anonymous `SessionMemory` construction where a canonical session already exists.
- [x] Ensure `SessionMemory.setTranscriptPath()` is called for every daemon session.
- [x] Persist session start, prompt, completion, failure, interruption, and shutdown events.
- [x] Add a graceful daemon flush that waits for active agents and transcript writers before exit.

### Phase 2 — Run handoffs

- [x] Add a typed `RunHandoff` entry to transcript types.
- [x] Collect changed files from mutating tools.
- [x] Collect command/test results from tool results and exit codes.
- [x] Record evidence IDs or event references rather than relying only on free-form text.
- [x] Write handoffs for completed, failed, interrupted, and compacted runs.
- [x] Inject the latest relevant handoff at session start.
- [x] Add tests proving a new agent can identify previous files, validation, failures, and remaining work.

### Phase 3 — Compact command and memory flush

- [x] Add the `/compact` slash command to interactive chat.
- [x] Add `compact` to the daemon message command router.
- [x] Add `xibecode compact` for explicit local session compaction.
- [x] Factor manual and automatic compaction through one service.
- [x] Add a pre-compaction flush prompt or deterministic handoff builder.
- [x] Preserve plans, task markers, unresolved questions, and latest user intent.
- [x] Add concurrent-request protection and cancellation handling.

### Phase 4 — Automatic session indexing

- [x] Index every session at completion, regardless of whether optional LLM memory review is enabled.
- [x] Index handoffs immediately after writing them.
- [x] Index changed paths, commands, errors, and project identifiers as searchable metadata.
- [x] Make daemon indexing asynchronous but durable through a retry queue.
- [x] Add index status and rebuild diagnostics.
- [x] Add corruption recovery and rebuild tests for the index cache.

### Phase 5 — Retrieval and consolidation

- [x] Add an agent-visible `search_sessions` tool for relevant prior work.
- [x] Retrieve previous handoffs before full transcripts.
- [x] Retrieve full transcript excerpts only when the handoff is insufficient.
- [ ] Add recency weighting for session logs while keeping curated project memory evergreen.
- [ ] Upgrade retrieval from keyword-only to hybrid FTS/vector search after baseline metrics exist.
- [ ] Add semantic duplicate checks before writing durable memories.
- [x] Run dream-style consolidation on a bounded schedule, not on every turn.

---

## Daemon reliability requirements

- [x] A daemon restart does not lose the last completed handoff.
- [x] A crash during a write leaves the previous session readable.
- [x] A compact request is idempotent.
- [x] Two compact requests cannot corrupt the same session.
- [x] A failed tool is visible in the next run and is not silently treated as success.
- [x] A completed test is recorded with its command and result.
- [x] A session can be found by task wording, changed filename, error text, or command.
- [x] Memory retrieval never blocks the daemon indefinitely; degrade to FTS or no-memory mode with a visible diagnostic.
- [x] Project memory cannot leak between workspaces.
- [x] Global user memory and project memory remain separate.
- [x] Sensitive values are redacted before indexing or writing memory.

---

## Validation plan

### Unit tests

- `RunHandoff` serialization and redaction;
- transcript path/session ID propagation;
- handoff generation from tool events;
- compact threshold and idempotency;
- preservation of active plans and unresolved questions;
- FTS indexing and search ranking;
- corrupted-index rebuild;
- memory separation by workspace.

### Integration tests

1. Start a daemon session and modify files.
2. Complete tests and shut down gracefully.
3. Start a fresh daemon process.
4. Ask what was changed and what remains.
5. Verify the answer comes from the handoff/transcript, not guesswork.
6. Run `/compact` during a multi-step task.
7. Resume after compacting and verify the task continues.
8. Kill the daemon during a write and resume.
9. Search for a prior error and changed filename.
10. Run two independent workspaces and verify memory isolation.

### Acceptance criteria

- Fresh daemon runs can reliably recover the last relevant work without replaying the entire transcript.
- `/compact` works manually and automatically.
- No completed file change or validation result disappears after compaction or restart.
- Session search finds prior work by task, path, command, and error.
- Durable memory contains reusable facts rather than noisy progress logs.
- All daemon channels receive compacting, recovery, failure, and completion status.

---

## Recommended implementation order

1. Canonical daemon session context and transcript wiring.
2. Run handoff records and automatic persistence.
3. Explicit `/compact` and `xibecode compact`.
4. Shared manual/automatic compaction service with pre-compaction flush.
5. Automatic indexing of every daemon session and handoff.
6. Agent-visible session search.
7. Retrieval quality improvements and dream consolidation.

The first five steps should be treated as the daemon-mode MVP. Vector memory and advanced consolidation should follow only after the lifecycle is durable and tested.
