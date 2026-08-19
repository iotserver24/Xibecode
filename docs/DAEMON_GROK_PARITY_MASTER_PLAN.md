# XibeCode Daemon and Memory Parity Plan

**Status:** Active master plan  
**Primary objective:** Make `xibecode daemon` reliable for long-running, multi-session coding work.  
**Reference implementation:** `grok-build/` (local reference only)  
**Scope:** daemon/gateway first; interactive CLI and other clients must use the same core lifecycle.  
**Rule:** Every version ends with evidence. Do not mark a version complete because the code compiles or because an agent says it is complete.

---

## 1. Product promise

After a restart, crash, context compaction, reconnect, or a later task in the same workspace, XibeCode must be able to answer from stored evidence:

- What did the user ask for?
- What did the agent actually do?
- Which files changed, were added, deleted, or reverted?
- Which commands, builds, and tests actually ran, with their results?
- Which approaches failed and why?
- What decisions and project facts were discovered?
- What remains unfinished or blocked?
- Which earlier sessions are relevant?

The agent must not claim a file changed, a test passed, or a task completed unless a tool event, transcript entry, or other verifiable record supports it.

---

## 2. What we are copying from Grok Build

These are capabilities to reproduce, not code to copy blindly:

1. **Complete session logs** outside the repository, durable across restarts.
2. **Workspace isolation** using workspace-scoped storage and indexes.
3. **Separate memory lifetimes:** transcript, run handoff, project/user memory, and searchable index.
4. **Searchable session history** by task wording, filename, command, and error.
5. **Pre-compaction memory flush** so context reduction does not lose active work.
6. **Curated evergreen memory** instead of storing every transient message as a fact.
7. **Recency-aware retrieval** so recent work is preferred without hiding older relevant work.
8. **Semantic duplicate prevention** before durable memory is written.
9. **Bounded consolidation/dreaming** that merges useful facts and removes noise.
10. **Corruption healing and rebuildable indexes.**
11. **Mature harness behavior:** explicit permissions, hooks, skills/MCP, browser verification, subagents, and reliable status reporting.
12. **Operational resilience:** graceful shutdown, crash recovery, retries, timeouts, and visible degraded modes.

### Current honest position

The existing MVP has the important daemon continuity pieces: canonical session wiring, run handoffs, compact commands, lifecycle hooks, queued indexing, and FTS retrieval. It is not yet Grok-equivalent in retrieval quality, consolidation quality, integration coverage, or overall harness polish. This plan closes those gaps in controlled versions.

---

## 3. Non-negotiable engineering rules

### 3.1 One canonical lifecycle

Do not add another independent memory store. Reuse and connect:

- `packages/core/src/daemon-session.ts`
- `packages/core/src/session-manager.ts`
- `packages/core/src/session-memory.ts`
- `packages/core/src/transcript-types.ts`
- `packages/core/src/run-handoff.ts`
- `packages/core/src/compact-service.ts`
- `packages/core/src/session-index-queue.ts`
- `packages/core/src/learning-loop/session-fts.ts`
- `packages/core/src/learning-loop/session-search.ts`
- `packages/cli/src/gateway/`

The canonical session ID must be shared by daemon, agent, transcript, handoff, memory, index, and gateway events.

### 3.2 Evidence over model summaries

Observed tool events are authoritative for changed files, commands, exit codes, test results, and errors. Model-generated summaries may organize evidence but may not invent it.

### 3.3 Workspace isolation

Project memory, transcripts, indexes, and file-history data must not leak across workspaces. Global user preferences remain separate from project memory.

### 3.4 Safe writes and recovery

Writes must be append-safe or atomic. A partial final JSONL line, interrupted index write, or daemon crash must preserve the previous readable state. Indexes are caches and must be rebuildable from transcripts.

### 3.5 Every milestone has a gate

For each version:

1. inspect the current diff before editing;
2. implement only that version's scope;
3. run focused tests;
4. run the package test suite and build when applicable;
5. perform a daemon smoke test;
6. record results in the progress log or task handoff;
7. only then begin the next version.

Do not commit, publish, or deploy as part of this plan unless explicitly requested.

---

## 4. Versioned implementation roadmap

## V0 — Baseline and safety net

**Status:** done (`verified`, 2026-08-19)

**Goal:** Establish a reproducible baseline before more changes land.

### Work

- [x] Keep `docs/DAEMON_MEMORY_PLAN.md` as the original MVP design record.
- [x] Record current branch, clean/uncommitted state, package versions, and existing test failures.
- [x] Inventory all session, transcript, memory, compaction, gateway, and file-history paths.
- [x] Define a small fixture workspace for daemon tests.
- [x] Add a progress record for each version: files changed, tests run, failures, and remaining work.
- [x] Ensure test isolation supports read-only home directories using `XIBECODE_FILE_HISTORY_DIR`.

### Proof gate

Run from the repository root:

```bash
pnpm run lint
pnpm run build
```

Run core tests:

```bash
cd packages/core
pnpm test
pnpm exec vitest run src/file-history.test.ts
```

Record exact pass/fail output. If the baseline has failures, classify each as pre-existing or caused by the current work before continuing.

### Exit criteria

- A known baseline exists.
- The core suite passes, or every failure has a reproducible owner and issue.
- No version work proceeds while an unexplained regression is present.

---

## V1 — Canonical daemon session lifecycle

**Goal:** Every daemon request belongs to one durable, resumable session.

### Work

- [x] Define daemon session context with session ID, workspace, transcript path, model, channel, and task ID.
- [x] Pass it into the agent, `SessionMemory`, gateway events, and post-turn review.
- [x] Persist session start, user prompt, completion, failure, interruption, and shutdown events.
- [x] Flush active writers and agents during graceful daemon shutdown.
- [ ] Verify all daemon adapters (Telegram, Discord, Slack, gateway clients, terminal) use the same lifecycle.
- [ ] Verify synthetic daemon prompts are explicitly marked in transcripts.

### Tests

- Unit: session ID/path propagation and workspace hashing.
- Unit: graceful flush waits for active writes.
- Integration: start session, send prompt, stop daemon, restart, resume same session.
- Crash test: terminate during transcript append and confirm the prior records remain readable.
- Isolation test: run two temporary workspaces and confirm separate transcripts and memory.

### Commands

```bash
pnpm exec vitest run packages/core/src/daemon-session.test.ts packages/core/src/session-manager.test.ts
pnpm test
pnpm run build
```

### Exit criteria

A restarted daemon can identify the last session and its latest durable event without relying on process memory.

---

## V2 — Evidence-backed run handoffs

**Status:** done (`verified`, 2026-08-19)

**Goal:** A fresh agent can understand previous work without replaying the full transcript.

### Work

- [x] Add typed `RunHandoff` transcript entries.
- [x] Track observed changed files, commands, validation results, failures, decisions, and remaining work.
- [x] Redact secrets before transcript, handoff, memory, or index writes.
- [x] Write handoffs for completed, failed, interrupted, and compacted runs.
- [x] Inject the latest relevant handoff on resume.
- [x] Add explicit evidence references for every changed-file and validation claim.
- [x] Add a deterministic “unknown/not observed” state instead of guessing.

### Tests

- Unit: handoff serialization and secret redaction.
- Unit: mutating tool events produce changed-file records.
- Unit: command exit code `0`, non-zero, timeout, and not-run states remain distinct.
- Integration: make a fixture change, run a passing test and failing command, restart, and ask for status.
- Negative test: ensure a model-only claim without a tool event is not recorded as verified.

### Exit criteria

The resumed agent correctly reports actual files, commands, failures, and remaining work from stored evidence.

---

## V3 — Compact command and pre-compaction flush

**Goal:** Context can be compacted manually or automatically without losing the active task.

### Work

- [x] Support `/compact` and `compact` in daemon chat routing.
- [x] Support `xibecode compact` and `--session` in the CLI.
- [x] Use one service for manual and automatic compaction.
- [x] Add `PreCompact` and `PostCompact` hooks.
- [x] Flush transcripts and write a handoff before dropping context.
- [x] Preserve active plan, latest user intent, task markers, unresolved questions, and critical tool results.
- [x] Prevent concurrent compaction corruption.
- [ ] Verify compaction while an agent is actively running for every supported adapter.
- [ ] Make automatic threshold behavior observable and testable.

### Tests

- Unit: compact lock, idempotency, cancellation, and threshold crossing.
- Integration: compact an idle session, resume it, and verify the handoff.
- Integration: compact during a multi-step task and confirm the pending request continues.
- Recovery: kill during compaction, restart, and confirm either the previous or new valid boundary is readable.
- UX: verify clients receive start, success, failure, and degraded-status messages.

### Commands

```bash
pnpm exec vitest run packages/core/src/compact-service.test.ts packages/cli/src/gateway
pnpm exec xibecode compact --help
pnpm exec xibecode daemon --help
pnpm test
pnpm run build
```

### Exit criteria

Manual `/compact`, `compact`, and `xibecode compact` preserve continuity and never silently discard an active task.

---

## V4 — Durable indexing and basic session search

**Goal:** Every session is discoverable by useful evidence.

### Work

- [x] Index completed sessions and handoffs automatically.
- [x] Queue index writes asynchronously with retries and timeouts.
- [x] Index task text, handoff text, changed paths, commands, errors, status, workspace, and dates.
- [x] Add rebuild and corruption recovery behavior.
- [x] Retrieve handoffs before full transcript excerpts.
- [ ] Persist queue state across daemon restarts, not only in-process.
- [ ] Add a user-visible index health/rebuild command or diagnostic.

### Tests

- Unit: indexing metadata and retry policy.
- Unit: timeout falls back visibly without blocking the daemon.
- Corruption test: damage the FTS cache and rebuild it from transcripts.
- Restart test: leave queued indexing work, restart daemon, and confirm it is retried.
- Search acceptance: find prior work by task wording, changed filename, command, and error text.

### Exit criteria

A prior session can be found reliably, and a broken index can be regenerated without losing source history.

---

## V5 — Curated memory and bounded consolidation

**Goal:** Store reusable project knowledge without filling memory with transient noise.

### Work

- [ ] Define explicit memory classes: global user, project, session, run handoff, and ephemeral execution state.
- [ ] Store only reusable facts in curated memory: architecture, conventions, preferences, stable commands, decisions, and durable lessons.
- [ ] Keep current task progress in handoffs, not evergreen memory.
- [x] Run dream-style consolidation on a bounded schedule rather than every turn.
- [ ] Add a consolidation report showing promoted, merged, rejected, and expired items.
- [ ] Add semantic duplicate checks before durable writes.
- [ ] Add conflict handling: newer verified project facts supersede stale facts with provenance.
- [ ] Make consolidation crash-safe and repeatable.

### Tests

- Unit: memory classification and promotion rules.
- Unit: duplicate facts merge without deleting provenance.
- Unit: conflicting facts do not silently overwrite one another.
- Integration: repeated sessions produce one curated fact rather than repeated copies.
- Isolation: global and project memories remain separate across two workspaces.
- Crash test: interrupt consolidation and rerun it safely.

### Exit criteria

Memory becomes smaller and more useful over time, with provenance and no cross-workspace leakage.

---

## V6 — Retrieval quality: recency, relevance, and hybrid search

**Goal:** Match Grok’s useful retrieval behavior while keeping deterministic FTS fallback.

### Work

- [ ] Add recency weighting to session/handoff ranking.
- [ ] Keep curated project memory evergreen while applying decay only to transient session records.
- [ ] Establish a retrieval benchmark fixture with known relevant and irrelevant sessions.
- [ ] Measure precision@k, recall@k, stale-result rate, and latency.
- [ ] Add optional embeddings/vector search behind a feature flag.
- [ ] Combine FTS and vector results with deterministic ranking and explainable scores.
- [ ] Fall back to FTS or no-memory mode on embedding/model/index failure.
- [ ] Never block daemon response indefinitely on retrieval.

### Tests

- Ranking tests for exact path, error, command, and task matches.
- Recency tests proving recent relevant work outranks old irrelevant work.
- Hybrid tests proving FTS-only fallback works when vectors are unavailable.
- Workspace isolation tests for both FTS and vector stores.
- Latency test with a bounded retrieval timeout.
- Benchmark report committed as test output or a progress artifact, not as an unverified claim.

### Exit criteria

Relevant prior work appears in the first few results, fallback is visible, and retrieval latency stays within the daemon budget.

---

## V7 — Restart, crash, and queue resilience

**Goal:** Long-running daemon operation remains safe over days and process failures.

### Work

- [ ] Persist pending index/consolidation jobs durably.
- [ ] Add startup recovery scan for incomplete sessions and unfinished jobs.
- [ ] Add bounded retry with backoff and dead-letter diagnostics.
- [ ] Make shutdown signals drain or checkpoint active work.
- [ ] Add stale-lock detection and safe lock recovery.
- [ ] Detect and repair partial transcript/index artifacts.
- [ ] Expose daemon health: active session, last flush, last handoff, queue depth, index status, and degraded mode.

### Tests

- Kill process during transcript, handoff, compact, index, and consolidation writes.
- Restart with each interrupted operation and verify recovery.
- Fill the queue and confirm bounded memory usage.
- Simulate unavailable index/vector service and verify daemon continues with diagnostics.
- Run a long-lived soak test with repeated prompts, compaction, reconnects, and restarts.

### Exit criteria

No single process crash loses the last valid handoff or blocks future daemon work indefinitely.

---

## V8 — Harness parity and operational polish

**Goal:** Bring the surrounding coding harness closer to Grok Build, after daemon correctness is proven.

### Work

- [ ] Audit permission enforcement and approval persistence across reconnects.
- [ ] Audit lifecycle hooks and ensure failures are visible and non-destructive.
- [ ] Make skills/MCP tools discoverable and session-aware.
- [ ] Improve browser verification guidance and evidence capture where supported.
- [ ] Improve subagent/task delegation handoffs and failure reporting.
- [ ] Standardize status events across terminal, Telegram, Discord, Slack, and gateway clients.
- [ ] Add user commands for session listing, search, status, compact, resume, and rebuild diagnostics.
- [ ] Improve prompts only after the evidence/memory system is reliable; prompts must instruct the model to inspect handoffs and verify claims.

### Tests

- Permission tests for allowed, denied, and approval-required operations.
- Hook tests for pre/post compact and session lifecycle failures.
- MCP/skill discovery smoke tests.
- Adapter contract tests: the same daemon event produces equivalent user-visible status everywhere.
- End-to-end coding task with file changes, test failure, correction, compact, reconnect, and final verification.

### Exit criteria

The harness is not merely feature-rich; it is predictable, evidence-backed, and consistent across clients.

---

## 5. Canonical storage model

Keep these stores separate and explicitly linked by workspace ID and session ID:

| Store | Lifetime | Contents | Source of truth? |
|---|---|---|---|
| Transcript JSONL | Permanent until deleted | Full messages, tool calls/results, lifecycle events | Yes for replay |
| Run handoff | Permanent with session | Structured status and evidence summary | Yes for quick resume |
| Session index | Rebuildable cache | Search fields and snippets | No |
| Project memory | Long-term | Verified reusable project facts | No; provenance points to evidence |
| User memory | Long-term | Stable user preferences | No; user-editable |
| Ephemeral state | Process/task lifetime | Locks, active jobs, progress | No |
| File history | Recovery lifetime | File checkpoints | No; separate recovery system |

Every durable memory item should include provenance: workspace, session, transcript/handoff reference, timestamp, confidence/verification source, and supersession state.

---

## 6. Daemon end-to-end acceptance scenario

Use a temporary fixture workspace and a disposable session. The scenario must be runnable without production credentials.

1. Start daemon/gateway with an isolated home and file-history directory.
2. Submit a task that changes at least two files.
3. Run one passing validation and one intentionally failing command.
4. Confirm status reports show the actual commands and results.
5. Send `/compact` while the task is active or immediately after a tool turn.
6. Confirm the compact response reports preserved files, validations, and unresolved work.
7. Stop the daemon gracefully.
8. Restart it and resume the same session.
9. Ask: “What did you change, what passed, what failed, and what remains?”
10. Verify every answer against the transcript and handoff.
11. Search by task text, changed filename, command, and error.
12. Interrupt a write or compaction, restart, and repeat the status query.
13. Repeat the run in a second workspace and verify no memory or index result crosses the boundary.
14. Run the same scenario through each available adapter before declaring adapter parity.

The scenario passes only when all evidence is present and no claim depends on model guessing.

---

## 7. Required regression suite by release

Every version must run the tests for all earlier versions. At minimum:

```bash
# From /home/r3ap3reditz/codes/xibecode
pnpm run lint
pnpm run build

# From /home/r3ap3reditz/codes/xibecode/packages/core
pnpm test
pnpm exec vitest run src/file-history.test.ts
```

For CLI/gateway changes also run:

```bash
# From /home/r3ap3reditz/codes/xibecode
pnpm exec xibecode --help
pnpm exec xibecode compact --help
pnpm exec xibecode daemon --help
```

If a test is intentionally unavailable, record the exact reason and replace it with the closest deterministic smoke test. Never silently skip a gate.

---

## 8. Progress and rollback protocol

### Before each version

- Read the current files and current diff.
- Confirm the active branch and workspace.
- Write down the version scope and expected files.
- Preserve unrelated work from other agents.

### After each version

- Run focused tests first, then the full required regression suite.
- Run the daemon acceptance scenario when the version affects lifecycle, memory, compacting, or gateway behavior.
- Record: date, version, files, commands, pass/fail, duration if available, failures, and follow-ups.
- Inspect `git diff` and diagnostics.
- Do not advance on unexplained failures.

### If a version fails

1. Stop the next version.
2. Reproduce the failure with the smallest focused test.
3. Fix only the root cause in the current scope.
4. Rerun the focused test and the full regression suite.
5. If the failure cannot be fixed safely, preserve the working previous version and document the blocker; do not weaken tests or delete meaningful functionality.

### Progress states

Use only these states:

- `planned` — not started;
- `in_progress` — actively changing;
- `implemented_unverified` — code exists but gates are incomplete;
- `verified` — all gates passed;
- `blocked` — a reproducible blocker is documented;
- `regressed` — a previously verified gate no longer passes.

“Done” means `verified`, not merely `implemented`.

---

## 9. Definition of done for daemon parity

XibeCode can claim daemon/memory parity only when:

- a daemon restart, reconnect, compaction, or crash preserves the last valid handoff;
- the agent knows previous files, commands, results, failures, and remaining work from evidence;
- sessions and memory are isolated by workspace;
- search works by task, filename, command, and error;
- curated memory contains reusable facts with provenance and deduplication;
- retrieval uses recency/relevance and has a bounded FTS fallback;
- indexes and queues recover after corruption or restart;
- all clients receive consistent compact, recovery, failure, and completion status;
- the complete end-to-end acceptance scenario passes repeatedly;
- the full regression suite and build pass after the final change.

Until then, describe the project as “daemon continuity MVP” or “partially verified parity,” whichever is accurate.

---

## 10. Immediate next sequence

1. Finish V0 baseline and record current evidence.
2. Re-run the full core suite after the file-history isolation fix.
3. Run the monorepo build and inspect exports/build artifacts.
4. Verify V1–V4 against the end-to-end acceptance scenario rather than assuming existing checkboxes are sufficient.
5. Implement V5 curated memory/consolidation.
6. Implement V6 retrieval ranking and optional hybrid search.
7. Implement V7 crash/queue resilience and soak tests.
8. Implement V8 harness and adapter parity.

Do not optimize prompts or add speculative memory abstractions before V1–V4 are repeatedly proven in a real daemon workflow. The priority is durable continuity first, retrieval quality second, and harness polish third.

---

## 11. Implementation context: how Grok-style continuity works

This section is the working mental model for implementation. It explains why the pieces are separate and how a daemon should use them.

### 11.1 The Grok-style model

The important pattern in the Grok Build reference is not one magical memory prompt. It is a pipeline with different stores for different jobs:

```text
user request
    -> durable session transcript
    -> observed execution events
    -> compact run handoff
    -> searchable session index
    -> curated memory/consolidation
    -> ranked context injected into the next run
```

Each layer has a different job:

- **Transcript:** exact history and replay source. It should not be summarized away.
- **Execution observation:** facts extracted from tool calls, file edits, commands, tests, and failures.
- **Run handoff:** small, current-state checkpoint for restart and compaction.
- **Session index:** fast, rebuildable search cache across old work.
- **Curated memory:** stable facts worth carrying into future tasks.
- **Retrieval:** selects only relevant context for the next prompt.
- **Consolidation:** periodically merges duplicates, resolves stale facts, and promotes verified knowledge.

The common failure mode is treating all of these as one `MEMORY.md` or one giant prompt. That causes stale progress, noisy context, poor ranking, and eventually token pressure. XibeCode must preserve the separation.

### 11.2 What is currently implemented in XibeCode

#### Session creation and path identity

`packages/core/src/daemon-session.ts` creates `DaemonSessionContext` with:

- `sessionId`;
- `cwd`;
- `transcriptPath`;
- model, channel, task ID, and prompt origin.

`packages/core/src/session-paths.ts` and `packages/core/src/session-manager.ts` resolve project-scoped JSONL paths beneath the XibeCode data directory. This is the identity boundary: the same session ID and workspace must be passed everywhere instead of constructing anonymous memory objects.

#### Transcript persistence

`packages/core/src/session-manager.ts`, `transcript-writer.ts`, and `transcript-reader.ts` use append-oriented JSONL entries. The transcript can contain session metadata, messages, attempts, learnings, lifecycle events, handoffs, and compact boundaries. This is the source of truth for recovery; indexes and summaries must be rebuildable from it.

The writer is asynchronous, so shutdown and compaction must flush it before reporting success. Readers must tolerate a partial final line after a crash and return all valid earlier entries.

#### Per-run observations and handoffs

`packages/core/src/run-handoff.ts` contains `RunObservation` and `RunHandoff`.

- `observeToolEvent()` records successful mutating tool paths.
- Command tools become validation records with result and exit code.
- Failed tools become failed approaches.
- `buildRunHandoff()` converts observed state into a redacted structured checkpoint.
- `formatRunHandoffMarkdown()` makes that checkpoint understandable to a fresh model.

This is better than asking a new model to infer state from a long transcript, but the observation layer still needs broader tool coverage, evidence IDs, explicit unknown states, and adapter-level integration tests.

#### Existing SessionMemory

`packages/core/src/session-memory.ts` records attempts and learnings. With a transcript path it writes `attempt` and `learning` entries to JSONL; without one it uses the legacy `.xibecode/sessions/` JSON fallback.

This is useful short-term failure memory, but it is not yet the complete Grok-style memory system. It currently has limited loading, no strong relevance ranking, no provenance model for durable facts, and no semantic deduplication. V5 must extend the lifecycle rather than create a third or fourth unrelated memory database.

#### Compaction

`packages/core/src/compact-service.ts` is the shared manual/automatic pipeline. It:

1. flushes the transcript writer;
2. runs `PreCompact`;
3. invokes the context compactor;
4. preserves protected tail messages and markers;
5. builds a compacted run handoff;
6. writes the handoff, boundary, lifecycle event, and index entry;
7. runs `PostCompact`;
8. reports a user-facing status.

A per-session in-flight lock rejects a second compact request. The remaining work is to prove active-task behavior through real daemon adapters, make automatic threshold behavior observable, and make interrupted compaction recoverable across process restarts.

#### Indexing and retrieval

`packages/core/src/session-index-queue.ts`, `learning-loop/session-fts.ts`, and `learning-loop/session-search.ts` provide asynchronous FTS indexing and search. `compact-service.ts` indexes the handoff after compaction.

Current strengths are deterministic keyword search, workspace metadata, retries, timeout fallback, and rebuildability. Current gap versus Grok is ranking quality: recency, semantic similarity, duplicate handling, and durable queue state are still incomplete.

#### File-history isolation

`packages/core/src/file-history.ts` stores recovery snapshots under `~/.xibecode/file-history` by default. `XIBECODE_FILE_HISTORY_DIR` overrides this for isolated tests and CI. This is separate from memory: file history answers “how do I restore a file?” while a handoff answers “what work happened and what remains?” Never use one as a substitute for the other.

### 11.3 Current XibeCode data flow

#### New daemon run

```text
CLI/gateway adapter
  -> agent-runner creates DaemonSessionContext
  -> context selects canonical sessionId + transcriptPath
  -> EnhancedAgent receives context and SessionMemory
  -> user prompt + lifecycle event are appended to JSONL
  -> tool calls update RunObservation
  -> transcript writer records messages/tool results/attempts
  -> completion/failure writes RunHandoff
  -> handoff enters session-index queue
  -> daemon reports status to the adapter
```

#### Resume after restart

```text
sessionId + cwd
  -> sessionTranscriptPath()
  -> loadTranscriptFile()
  -> find latest RunHandoff
  -> find latest compact boundary
  -> load recent messages after that boundary
  -> inject handoff if it is not already present
  -> start a new agent turn with the same durable session identity
```

#### Manual or automatic compact

```text
compact request / token threshold
  -> per-session lock
  -> flush pending writes
  -> PreCompact hook
  -> deterministic observation snapshot + RunHandoff
  -> context-compactor removes old context
  -> preserve plan/task/questions/critical tail
  -> append handoff + compact boundary
  -> flush
  -> queue index update
  -> PostCompact hook
  -> status message
```

### 11.4 Where state can still be lost today

These are the specific risks the version plan must eliminate:

1. A daemon adapter may construct a new session or `SessionMemory` instead of forwarding the canonical context.
2. `SessionMemory` writes are best-effort in some paths; a failed write may not be visible to the user or handoff.
3. Mutating-tool detection only records paths exposed by known input shapes and known tool names; tools with different schemas can be missed.
4. Command observations currently infer pass/fail from tool success and exit code; commands that return no exit code need an explicit observed-result policy.
5. A handoff can state remaining work from markers, but there is not yet a durable task ledger with completed/open state.
6. The index queue is asynchronous; process death can lose queued work unless the queue itself is persisted.
7. FTS finds words but does not yet rank meaning, recency, or verified facts like a mature hybrid retriever.
8. Curated memory and session memory still have different conventions and need one promotion/consolidation policy.
9. Real Telegram/Discord/Slack active-task compact and reconnect flows are not yet proven end to end.
10. Build/export validation is still required before calling the daemon surface complete.

### 11.5 How to improve each boundary

| Boundary | Current XibeCode behavior | Better implementation |
|---|---|---|
| Adapter -> agent | Gateway runner passes session context in the main path | Add adapter contract tests; reject missing session identity in daemon mode |
| Tool result -> observation | Known mutating and command tools are recognized | Centralize tool metadata/schema extraction; record `observed`, `not_observed`, or `failed` explicitly |
| Observation -> handoff | Structured fields are generated and redacted | Add evidence references, task IDs, open/closed task markers, and provenance |
| Handoff -> resume | Latest handoff plus recent tail is injected | Select by session/task relevance and verify the handoff belongs to the current workspace |
| Transcript -> index | Async FTS queue with retry/fallback | Persist queue jobs, add health status, rebuild from JSONL, then add ranking/vector search |
| Session memory -> durable memory | Attempts/learnings are persisted | Add typed memory classes, provenance, duplicate detection, conflict/supersession, and bounded promotion |
| Compact -> next turn | Handoff and compact boundary are written | Make boundary atomic/recoverable and test interruption at every write step |
| Daemon -> user | Status is emitted by runner/gateway | Standardize status events and messages across all adapters |

### 11.6 Prompt/harness changes come after evidence

Grok-like prompts should tell the model to:

- read the latest handoff before acting;
- inspect relevant session search results when the task references prior work;
- distinguish observed facts from assumptions;
- never claim tests passed without a recorded command result;
- update remaining work after each meaningful turn;
- avoid redoing completed work;
- ask for clarification when the handoff is blocked or ambiguous.

These instructions are valuable, but they cannot repair missing persistence or poor retrieval. Add them after V1–V4 are verified and test them with the same acceptance scenario.

---

## 12. Context checklist for every future agent

Before modifying daemon or memory code, the implementing agent must read:

1. this master plan;
2. `docs/DAEMON_MEMORY_PLAN.md` for the original MVP rationale;
3. `packages/core/src/daemon-session.ts`;
4. `packages/core/src/session-manager.ts`;
5. `packages/core/src/session-memory.ts`;
6. `packages/core/src/run-handoff.ts`;
7. `packages/core/src/compact-service.ts`;
8. `packages/core/src/transcript-types.ts`;
9. `packages/core/src/transcript-reader.ts` and `transcript-writer.ts`;
10. `packages/core/src/session-index-queue.ts`;
11. `packages/core/src/learning-loop/session-fts.ts` and `session-search.ts`;
12. `packages/cli/src/gateway/agent-runner.ts`;
13. `packages/cli/src/gateway/chat-controller.ts`;
14. the relevant tests before editing production code.

Then answer these questions in the implementation handoff:

- Which canonical session ID is being used?
- Which transcript path is being used?
- Which observed events prove each changed file and validation result?
- What is the recovery behavior if the next write or index operation fails?
- Which tests prove no regression in resume, compact, and workspace isolation?
- What remains unverified?

If these questions cannot be answered, the version is `implemented_unverified`, not `verified`.

---

## 13. Hermes Agent comparison and features worth adopting

`/home/r3ap3reditz/codes/hermes-agent` is another relevant reference because it is designed as an always-on gateway agent, not only as a one-shot coding CLI. Its strongest lessons are operational: how to keep conversation lanes stable, how to recover after process death, how to avoid duplicate outbound replies, and how to run scheduled work safely.

### 13.1 Hermes patterns observed

The following reference areas are especially relevant:

| Hermes area | Reference files | Useful behavior |
|---|---|---|
| Session lifecycle | `docs/session-lifecycle.md`, `gateway/session.py`, `gateway/run.py` | Deterministic session key per platform/chat/thread/user; persisted metadata; explicit reset, suspend, and resume-pending states |
| Crash recovery | `gateway/session.py`, `gateway/restart.py`, `gateway/restart_loop_guard.py` | Recently active sessions are marked resume-pending after an unclean restart; repeated restart loops stop auto-resume and return control to the user |
| Delivery durability | `gateway/delivery_ledger.py` | Final replies are recorded before sending; undelivered replies are recovered after process death with honest duplicate markers and capped retries |
| Scheduling | `cron/scheduler.py`, `cron/jobs.py`, `cron/lifecycle_guard.py` | Persistent jobs, cross-process locks, one-shot claims, heartbeats, success timestamps, bounded execution, output retention, and safe tool restrictions |
| Verification evidence | `agent/verification_evidence.py`, `agent/verification_stop.py`, `agent/verify_hooks.py` | Commands are classified by kind and scope; evidence is stored separately from prose; targeted checks are not falsely promoted to full-repository success |
| Compression | `agent/context_compressor.py`, `agent/conversation_compression.py` | Strong reference-only framing, protected active task, historical headings, summary failure fallback, output pruning, bounded summary size, and metadata markers |
| Memory integration | `agent/memory_manager.py`, `agent/memory_provider.py` | One memory integration point, provider timeouts, bounded shutdown drain, context fencing, streaming scrubbing, and no-provider degradation |
| Skills and learning | `agent/skill_bundles.py`, `agent/skill_commands.py`, `agent/learning_graph.py` | Skills are discoverable, usage-aware, related, and visualized alongside memory; profile and base skills remain distinct |
| Gateway safety | `gateway/readiness.py`, `gateway/dead_targets.py`, `gateway/drain_control.py`, `gateway/memory_monitor.py` | Readiness versus liveness, draining, dead target detection, memory pressure handling, and graceful operational state transitions |
| ACP integration | `acp_adapter/session.py`, `events.py`, `permissions.py`, `provenance.py` | Session-scoped events, approval flow, tool provenance, and structured editor/client integration |

These observations are based on the checked-in source and `docs/session-lifecycle.md`; they are patterns to adapt, not a requirement to reproduce Hermes’ exact storage or runtime.

### 13.2 What XibeCode already has versus Hermes

| Capability | XibeCode today | Hermes-level improvement needed |
|---|---|---|
| Agent session identity | Canonical `DaemonSessionContext` and workspace-scoped transcript | Add a separate deterministic conversation-lane key for platform/chat/thread/user and map it to the current session ID |
| Restart resume | Latest handoff and transcript tail can be resumed | Persist `resume_pending`, reason, timestamps, and clean/unclean shutdown state; distinguish soft resume from hard reset |
| Explicit reset | Local resume/compact surfaces exist | Add `/new`, `/reset`, `/stop`, suspend, and safe session switching consistently across daemon adapters |
| Active work safety | Compact lock and graceful flush exist | Track active agents/processes per lane; do not expire or reset a lane with live work or an E2B sandbox attached |
| Outbound delivery | Gateway emits responses | Add a durable delivery obligation before send, delivery ACK after send, capped redelivery, and visible recovered-reply marker |
| Restart-loop protection | Not yet proven as a daemon feature | Persist restart-interrupted boot counts and skip automatic resume when a loop threshold is reached |
| Scheduling | Daemon/gateway exists; scheduled coding workflow is not yet a verified core feature | Add persistent cron/jobs only after session recovery and permission boundaries are stable |
| Verification | Run handoff records commands/results | Add a dedicated evidence ledger with command canonicalization, targeted/full scope, kind, exit code, output summary, and freshness |
| Compression | Shared compact service, handoff, hooks, protected markers | Add reference-only summary framing, stale-task suppression, bounded fallback summaries, metadata markers, and summarizer failure recovery |
| Memory provider | Session memory and local memory systems exist | Use one manager with provider timeout, fencing, redaction, bounded prefetch, and no-memory fallback |
| Skills | XibeCode has hooks/skills infrastructure | Add skill usage/provenance and make selected skills part of the session handoff when they affect the task |
| Health/readiness | Basic gateway lifecycle exists | Add liveness, readiness, draining, queue depth, last heartbeat, last successful tick, and target health diagnostics |
| ACP/client integration | ACP support exists in the repository | Make session identity, approvals, provenance, and resumable events use the same daemon session context |

### 13.3 Hermes features to adopt first for XibeCode

These are the highest-value additions for a 24/7 coding daemon. They should be implemented in this order because each depends on the previous safety boundary.

#### H1 — Conversation lane identity

Add a deterministic `ConversationLaneKey` separate from the generated session ID:

```text
xibecode:main:{platform}:{chatType}:{chatId}:{threadId}:{participantScope}
```

Rules:

- DMs isolate by platform and chat/user ID.
- Groups/channels isolate by platform, chat, and optionally user according to configuration.
- Threads/topics get their own lane when configured.
- E2B sandbox identity is never used as the conversation key; a lane may attach to a host or sandbox execution context.
- Secrets and raw platform tokens must never be placed in the key.

Persist a lane record containing current session ID, last activity, display metadata, reset policy, attached sandbox ID, active-job count, and recovery state. This solves a different problem from the current workspace-scoped transcript path: workspace identity answers “which codebase?”, while lane identity answers “which remote conversation?”.

**Tests:** deterministic key fixtures for every adapter; DM/group/thread isolation; same lane after restart; no cross-user leakage; E2B attachment does not merge unrelated lanes.

#### H2 — Soft resume, hard reset, and lifecycle state machine

Implement explicit states rather than a single boolean:

```text
active -> draining -> stopped
active -> resume_pending -> active
active -> suspended -> fresh session
active -> expired -> fresh session
```

- `resume_pending` preserves the session after crash, timeout, or interrupted shutdown.
- `suspended` intentionally prevents auto-resume after `/stop` or a dangerous loop.
- `expired` starts a new session according to configured idle/daily policy.
- A successful resumed turn clears `resume_pending`.
- A running local process or E2B sandbox prevents expiry until it is safely detached or stopped.

**Tests:** restart during a turn; `/stop` versus reconnect; idle expiry; active E2B process; successful resume clears the flag; dangerous restart loop skips auto-resume.

#### H3 — Durable outbound delivery ledger

Before a daemon sends a final response to Telegram, Discord, Slack, gateway, or another adapter:

1. record a `pending` delivery obligation with stable ID, lane, target, thread, and content;
2. mark `attempting` immediately before the adapter call;
3. mark `delivered` only after an explicit successful adapter result;
4. mark `failed` on definitive rejection;
5. on startup, recover obligations owned by dead processes;
6. redeliver only within an attempts/time limit;
7. add a visible recovered-reply marker when the previous send may have succeeded.

Use an adapter-neutral core interface. The initial implementation may use a small SQLite state database or atomic JSONL outbox, but it must be workspace/profile scoped, idempotent, and bounded. Do not couple delivery state to transcript replay: transcript records what the agent generated; the delivery ledger records whether the user likely received it.

**Tests:** crash before send, during send, after send before ACK, adapter rejection, duplicate request, stale obligation, attempt cap, and recovered marker.

#### H4 — Restart-loop breaker and health model

Persist a tiny restart-loop record outside process memory. When the daemon repeatedly boots with interrupted work in a short window:

- stop auto-resuming the dangerous session;
- continue serving new inbound messages if safe;
- leave the session `resume_pending`;
- expose the reason and recovery action in diagnostics.

Add health states:

- `starting`;
- `ready`;
- `degraded`;
- `draining`;
- `blocked`;
- `stopped`.

Expose heartbeat time, last successful queue tick, active agent count, active sandbox count, pending deliveries, pending index jobs, and last recovery error.

**Tests:** three simulated restart-interrupted boots trip the breaker; clean restart clears it; a healthy daemon does not trip; health changes are visible; degraded indexing does not make the daemon report dead.

#### H5 — Persistent scheduling for 24/7 tasks

Only after H1–H4 are verified, add scheduled jobs for safe recurring work:

- persistent job definitions scoped to profile/workspace/lane;
- cron or interval schedules;
- atomic claim before execution;
- one active run per job unless explicitly allowed;
- heartbeat and last-success files/records;
- bounded inactivity timeout and stale-claim recovery;
- output stored separately from chat delivery;
- delivery target resolved through an allowlisted adapter name;
- cron jobs cannot schedule more cron jobs, wait for clarification, or use unrestricted messaging tools;
- E2B job runs must declare sandbox lifecycle and cleanup policy.

A scheduled job should create a normal daemon session/run handoff so scheduled work is searchable and resumable, but it must have an explicit `origin: scheduled` marker and never silently impersonate a user message.

**Tests:** due-job selection, duplicate tick prevention, crash after claim, stale claim recovery, timeout, output retention, disabled toolsets, prompt-injection scan, E2B cleanup, and delivery failure.

#### H6 — Verification evidence ledger

- [x] H6-lite: mark prior validation evidence stale after a later observed file edit.
- [x] Full ledger: canonical commands, output summaries, timestamps, and stale-after-edit across sessions.

Extend the current run observations with a durable evidence record:

```text
sessionId, workspace, command, canonicalCommand,
kind, scope, status, exitCode, cwd, timestamp,
outputSummary, changedPaths, sourceEventId
```

Classify checks as `test`, `lint`, `typecheck`, `build`, `format`, or `check`, and distinguish `targeted` from `full`. A targeted test must never be presented as proof that the whole repository is green. Store only bounded output summaries and redact secrets.

The run handoff should reference evidence IDs instead of duplicating large output. A future agent can then answer “what passed?” precisely and know whether it was run before or after the latest edit.

**Tests:** command canonicalization (`pnpm test` versus equivalent forms), scope detection, stale evidence after a new edit, non-zero exit, timeout, chained commands, redaction, and targeted/full reporting.

#### H7 — Stronger compression safety

Improve `compact-service.ts` using the Hermes lessons:

- mark compacted messages structurally instead of relying only on text prefixes;
- label old material as reference-only and historical;
- explicitly state that the newest user message is the only active request;
- prevent stale “remaining work” from becoming a new instruction unless the user asks to continue;
- preserve active plan, changed-file evidence, open tasks, approvals, and latest user intent;
- prune oversized tool output before summarization;
- cap summary size;
- use deterministic fallback when the summarizer fails;
- scrub memory/context fences across streaming boundaries;
- make summary failure visible but non-fatal.

**Tests:** stale-task contradiction, topic change after compact, multiple compactions, summary model failure, oversized tool result, split streaming fence, metadata stripping, and resume after interrupted compact.

#### H8 — Memory provider manager and context fencing

Unify existing memory paths behind one bounded manager. Providers may prefetch or sync asynchronously, but:

- provider failure never blocks the daemon indefinitely;
- prefetch and shutdown have hard timeouts;
- recalled memory is fenced as untrusted/reference context;
- memory cannot inject fake user/system instructions;
- streaming output strips leaked memory fence tags;
- one provider policy prevents conflicting memory backends;
- FTS/local memory remains available when optional providers fail.

This should wrap XibeCode’s existing project memory, user memory, session memory, and session search rather than replace them with an unrelated external database.

**Tests:** provider timeout, provider failure, malformed context, streaming split tags, secret redaction, fallback retrieval, and workspace isolation.

#### H9 — Skills, provenance, and ACP continuity

When a skill, MCP server, ACP client, approval, or delegated subagent materially affects a run, record its identifier and provenance in the transcript/handoff. On resume, restore only the relevant capabilities, not every previous tool blindly.

Add usage counters and optional related-skill links later; do not build a graph before the basic provenance is durable. For ACP, ensure events, approvals, tool calls, and resumptions use the canonical daemon session ID.

**Tests:** capability restoration after restart, denied approval persistence, tool provenance, subagent failure handoff, and ACP reconnect.

### 13.4 What not to copy from Hermes blindly

- Do not copy Python modules or Hermes’ SQLite schema into XibeCode.
- Do not make platform chat IDs part of project memory paths.
- Do not auto-resume dangerous work forever; use a restart-loop breaker.
- Do not silently redeliver ambiguous messages; label possible duplicates.
- Do not allow scheduled jobs unrestricted interactive tools.
- Do not treat a targeted verification command as a full-suite result.
- Do not let an optional memory provider become a daemon availability dependency.
- Do not add cron, vectors, graphs, or new databases before the core lifecycle has tests and rebuild paths.

---

## 14. `/new` semantics: fresh context, preserved history

### 14.1 Desired behavior

`/new` must mean **start a fresh active conversation without deleting the previous conversation**.

It must:

- keep the same platform chat/channel/thread lane;
- keep the same workspace and workdir unless the user changes it;
- create a new internal XibeCode session incarnation with a new `sessionId`;
- clear the active agent message context for the new incarnation;
- clear run-local/session-local attempts and learnings from the active context;
- preserve the old transcript, handoff, file history, validation evidence, and searchable history;
- show the old session in history immediately;
- show the new empty session as active immediately;
- allow `/resume <old-session>` or an app history click to restore the old conversation;
- never delete project/user durable memory merely because `/new` was used.

This does **not** create a new Telegram/Discord/Slack thread or channel thread. “New thread” here means a new internal conversation incarnation under the same external chat lane. The external user should remain in the same chat.

### 14.2 Distinguish the concepts

```text
External conversation lane
  telegram:chat-123 / discord:channel-456:thread-789
        │ remains stable across /new
        ▼
Active internal session ID
  session-A  -- /new -->  session-B
        │                    │
        │ archived history   │ fresh active context
        ▼                    ▼
old transcript           new transcript
old handoff              new session-start
old search result        empty message context
```

- **Lane:** where the user is talking. Stable.
- **Session incarnation:** one continuous context in that lane. Rotates on `/new`, explicit reset, or policy expiry.
- **Transcript:** permanent record of an incarnation. Never delete on `/new`.
- **Active context:** messages supplied to the model for the current incarnation. Cleared on `/new`.
- **Project/user memory:** durable reusable knowledge. Unchanged on `/new` unless explicitly edited or forgotten.

### 14.3 Current behavior and required changes

#### Gateway

Current code:

- `packages/cli/src/gateway/session-store.ts` stores one `platform:chatId` JSON record with inline messages.
- `resetSession()` unlinks that record and recreates a minimal record, which removes the gateway’s direct history pointer.
- `chat-controller.ts` handles `/new`, `/reset`, and `/clear` with the same delete behavior.

Required design:

1. Replace destructive reset with `rotateSession()`.
2. Before rotation, flush the active agent/transcript writer and write a `reset`/`session-end` lifecycle event plus final handoff.
3. Add the old session to a lane-scoped history/index record with title, timestamps, status, transcript ID, workdir, changed files, and last handoff summary.
4. Create a new internal `transcriptSessionId` while preserving platform, chat ID, workdir, model, rigor, and progress preferences.
5. Save the new active pointer atomically: old session becomes `archived`, new session becomes `active`.
6. Return both IDs and a short history label so the adapter can say: `Started a new conversation. Previous chat saved as “...”. Use /resume ...`.
7. Keep `/clear` as an alias only if it follows the same non-destructive rotation. Add an explicit destructive command later, with confirmation, if deletion is truly needed.
8. Ensure queued messages and active runs are handled safely: `/new` must either reject while busy, drain/interrupt explicitly, or create the new session only after the active run writes its handoff. Never attach an old run’s output to the new session.

#### Core

Required core API shape:

```ts
interface SessionRotationResult {
  laneKey: string;
  previousSessionId: string | null;
  newSessionId: string;
  previousTitle?: string;
  previousHandoff?: RunHandoff | null;
}

rotateSession(options: {
  laneKey?: string;
  cwd: string;
  currentSessionId?: string | null;
  reason: 'new' | 'reset' | 'expired';
}): Promise<SessionRotationResult>
```

The core rotation must:

- flush transcript and index writes;
- finalize the previous run with an observed handoff when possible;
- append a lifecycle boundary that explains why it ended;
- preserve the old JSONL transcript;
- generate a new session ID/path;
- initialize the new transcript with metadata and `session-start`;
- reset only active-context state;
- retain workspace-scoped durable memory and file-history records;
- be idempotent when the same request is retried.

#### Desktop app

Current code:

- `packages/desktop/src/renderer/App.tsx` `handleNewChat()` clears `messages`, clears `activeSessionId`, and sets initialization false.
- It does not create/persist a new session immediately.
- `ChatHistory.tsx` refreshes the session list but does not receive a rotation result or active-session metadata.
- `ipc-handlers.ts` exposes list/create/load/save/delete but no session rotation endpoint.

Required UI behavior:

1. Clicking **New Chat** calls `session:rotate` rather than only clearing React state.
2. The old session remains in the left history list.
3. The returned new session ID becomes active immediately.
4. The UI clears the message panel and shows a non-model system notice: `New conversation started. Previous conversation is saved in History.`
5. Refresh history after rotation and sort the new active session at the top while keeping the old session selectable.
6. If rotation fails, do not clear the visible conversation; show the error and leave the old session active.
7. If the user switches to an old history item, load its transcript/handoff and mark it active without deleting the new session.
8. Add a session status label such as `Active`, `Archived`, or `Resumed`; do not confuse archived history with deleted data.
9. Confirm deletion separately. The trash action must remain destructive and must not be reused for `/new`.
10. Update the app’s local state from the same rotation response, not from a delayed list refresh only, so the UI cannot briefly point at a nonexistent session.

#### Extension and ACP clients

The extension currently uses `clearHistory()` to empty in-memory messages and reset `currentSessionId`. It should instead call a shared rotation operation, preserve the previous session in `/resume`, and post a history update after rotation. ACP `session/new` should create a new internal session while the client can still list/resume previous sessions when the protocol supports it.

### 14.4 Memory rules for `/new`

`/new` must not be described as “wiping all memory.” It clears the active conversation context only.

| Data | `/new` behavior |
|---|---|
| Current model message list | Clear |
| Current `SessionMemory` attempts/learnings | Stop using for new session; preserve in old transcript |
| Active `RunObservation` | Finalize into old handoff, then create empty observation |
| Old transcript | Preserve |
| Old run handoff | Preserve and index |
| File-history checkpoints | Preserve for recovery/revert policy |
| Project `MEMORY.md` / neural memory | Preserve |
| User preferences | Preserve |
| Search index | Add/archive old session; add new session metadata |
| External chat/channel/thread | Preserve |
| Workdir/model/rigor preferences | Preserve unless explicitly changed |

If the user truly wants memory deletion, that should be a separate explicit command with confirmation and a clear scope, for example project memory, session transcript, or all history. `/new` must never perform that destructive action implicitly.

### 14.5 User-facing command contract

```text
/new
  Start a fresh internal conversation in this same chat.
  Previous conversation is saved and can be resumed.

/resume <session-id>
  Restore a preserved conversation into the active lane.

/history
  List preserved conversations for this lane/workspace.

/delete <session-id>
  Explicitly delete a preserved conversation after confirmation.

/clear
  Alias for /new only; never destructive.
```

For the desktop app, the equivalent actions are:

- **New Chat:** rotate, preserve old history;
- **History item:** resume/select old session;
- **Delete:** explicit destructive action;
- **Refresh:** reload active/archived session metadata.

### 14.6 Tests for this behavior

#### Core unit tests

- rotation creates a new session ID and does not delete the old JSONL;
- old handoff remains loadable and searchable;
- new session starts with no old model messages;
- workdir/model/preferences survive rotation;
- project/user memory remains available but old session-local memory is not injected;
- rotation is idempotent under retry;
- rotation flushes pending transcript/index writes;
- old and new session IDs cannot receive each other’s tool results;
- destructive delete remains separate from rotation.

#### Gateway integration tests

1. Send two turns in `telegram:chat-1`.
2. Capture the old transcript/session ID.
3. Send `/new`.
4. Verify the same external chat lane remains active.
5. Verify a new internal session ID exists.
6. Verify the old session appears in `/history`.
7. Send a new prompt and confirm it cannot see old conversation messages unless explicitly resumed.
8. Run `/resume <old-id>` and verify the old messages/handoff return.
9. Restart the daemon and verify both old history and the new active pointer survive.
10. Run `/new` during an active task and verify the configured busy policy prevents cross-session output.

#### Desktop UI tests

- click New Chat and verify old item remains in `ChatHistory`;
- verify new active item is selected and message panel is empty;
- verify a system banner appears;
- select old history item and verify its messages load;
- rotate again without sending a message and verify the new empty session is persisted;
- simulate IPC rotation failure and verify the old chat remains visible;
- delete only after explicit confirmation.

#### Extension/ACP tests

- `/clear`/`/exit` use rotation semantics rather than only clearing arrays;
- `/resume` still lists the archived session;
- ACP session creation does not make prior sessions unreachable;
- history update events arrive after rotation.

### 14.7 Implementation order

1. Add core `rotateSession()` and tests.
2. Change gateway `resetSession()` to non-destructive rotation.
3. Add lane history/list/resume support.
4. Add desktop `session:rotate` IPC and update `App.tsx`/`ChatHistory.tsx`.
5. Update extension and ACP behavior.
6. Add explicit destructive deletion confirmation separately.
7. Run the full daemon and UI acceptance scenarios before changing memory retrieval or scheduling.

The success condition is simple: after `/new`, the model sees a clean conversation, the user stays in the same external chat, and the old conversation remains visible and resumable in history.

## 15. Hermes-focused implementation order

After V0–V4 are verified, implement:

1. **H1:** conversation lane identity;
2. **H2:** soft resume/hard reset state machine;
3. **H3:** outbound delivery ledger;
4. **H4:** restart-loop breaker and health model;
5. **H6:** verification evidence ledger;
6. **H7:** compression safety upgrades;
7. **H8:** memory provider manager/fencing;
8. **H5:** persistent scheduling and safe 24/7 jobs;
9. **H9:** skills, ACP, and provenance polish.

Scheduling is intentionally after recovery and delivery. A scheduler that can launch work but cannot recover sessions or deliver final results is not a reliable 24/7 feature.
