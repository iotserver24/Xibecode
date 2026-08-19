# Daemon / Grok parity progress

Do not mark a version `verified` without the gate commands and their pass/fail output.

## Completed

| Version | Status | Date |
|---|---|---|
| V0 baseline | done (`verified`) | 2026-08-19 |
| V2 evidence IDs + unknown/not_observed | done (`verified`) | 2026-08-19 |
| H6-lite stale-evidence-after-edit | done (`verified`) | 2026-08-19 |
| H6 full evidence ledger | done (`verified`) | 2026-08-19 |

## Inventory (canonical paths)

| Store | Path / resolver |
|---|---|
| Transcript JSONL | `~/.xibecode/projects/<sanitizeCwdKey(cwd)>/<sessionId>.jsonl` via `session-paths.ts` |
| Run handoff | `run-handoff` entries in that JSONL |
| Session index queue | `~/.xibecode/session-index/queue.jsonl` |
| FTS / search | `learning-loop/session-fts.ts`, `session-search.ts` (also scans `~/.xibecode/sessions`) |
| Curated memory | `~/.xibecode/memories/MEMORY.md` and `USER.md` |
| File history | `~/.xibecode/file-history` or `XIBECODE_FILE_HISTORY_DIR` |
| Gateway lane records | `packages/cli/src/gateway/session-store.ts` |
| Fixture workspace | `packages/core/test-fixtures/daemon-parity/` |

---

## V0 — Baseline and safety net

- Date: 2026-08-19
- Status: done (`verified`)
- Branch: `main` @ `e2f9cba` (clean except untracked plan/progress/fixtures)
- Versions: core `1.17.19`, CLI `1.17.19`, root `1.17.14`

### Files inspected

- `docs/DAEMON_GROK_PARITY_MASTER_PLAN.md`
- `packages/core/src/{daemon-session,session-manager,session-memory,run-handoff,compact-service,transcript-*,session-index-queue,session-paths,file-history,agent,tools,task-status}.ts`
- `packages/core/src/learning-loop/{session-fts,session-search,curated-memory}.ts`
- `packages/cli/src/gateway/` (via inventory + help smoke)
- Grok Build: `crates/codegen/xai-grok-agent/templates/prompt.md`, `apply_patch_prompt.md`, `prompt/browser_verification.rs`, `xai-grok-tools` apply_patch / hashline edit / task reminders

### Files changed

- `docs/DAEMON_GROK_PARITY_PROGRESS.md` (this file)
- `packages/core/test-fixtures/daemon-parity/**`

### Commands

```text
pnpm test                          # pass: 9 turbo tasks; core 139/139; CLI 51/51
pnpm run lint                      # pass: 7 turbo tasks
pnpm run build                     # pass: 6 turbo tasks (FULL TURBO cache)
pnpm exec vitest run src/file-history.test.ts
                                   # pass: 60 tests (core + workspace copies)
pnpm exec xibecode --help          # pass
pnpm exec xibecode compact --help  # pass
pnpm exec xibecode daemon --help   # pass
```

### Known gaps after V0

- Full live-daemon acceptance scenario (LLM + adapters) not run; help + existing session tests used as smoke.
- V2 remaining was still open at V0 close; it is now done.
- V5–V8 and H1–H9 still open (H6-lite follows).

---

## V2 remaining — Evidence references and unknown/not_observed

- Date: 2026-08-19
- Status: done (`verified`)
- Goal: never treat a missing exit code as a pass; every file/validation claim has an evidence id.

### Design chosen

Extend `run-handoff.ts` only. Keep `changedFiles: string[]` as observed successful paths. Add `fileEvidence`, `evidenceId`, `unknown`/`timeout` results, command kind/scope, and source event ids. Do not add a second memory store.

### Files changed

- `packages/core/src/run-handoff.ts`
- `packages/core/src/run-handoff.test.ts`
- `packages/core/src/transcript-types.ts`
- `packages/core/src/index.ts`
- `packages/core/src/agent.ts`
- `packages/core/src/compact-service.test.ts`
- `packages/cli/src/commands/compact.ts`

### Commands

```text
pnpm test                          # pass: core 145/145; CLI 51/51
pnpm run lint                      # pass
pnpm run build                     # pass
cd packages/core && pnpm exec vitest run src/file-history.test.ts
                                   # pass: 15/15
node --test packages/core/test-fixtures/daemon-parity/src/alpha.test.mjs
                                   # pass: 1/1
node packages/core/test-fixtures/daemon-parity/src/fail.mjs
                                   # fail_exit:1 (intentional)
pnpm exec xibecode compact --help  # pass
pnpm exec xibecode daemon --help   # pass
```

### Known gaps

- Live multi-adapter daemon scenario with an LLM is still not run.
- Full H6 ledger (canonical command, output summaries) is not implemented; H6-lite is done.
- Recency ranking, curated consolidation, and delivery ledger remain later versions.

---

## H6-lite — Stale evidence after a later edit

- Date: 2026-08-19
- Status: done (`verified`)
- Goal: a later observed file edit must invalidate earlier test/build proof.

### Design chosen

Stay on `run-handoff.ts`. Do not add a second ledger. After an observed or pathless successful mutation, mark matching validations `stale` instead of deleting them. Full/unknown checks stale on any edit; targeted checks stale only if they name the file or a sibling test/spec. Failed edits do not stale. Re-running the same command clears stale. Compact restore uses `skipStale` so loading history does not invent a new edit.

### Files changed

- `packages/core/src/run-handoff.ts`
- `packages/core/src/run-handoff.test.ts`
- `packages/core/src/transcript-types.ts`
- `packages/core/src/index.ts`
- `packages/core/src/agent.ts`
- `packages/cli/src/commands/compact.ts`
- `docs/DAEMON_GROK_PARITY_MASTER_PLAN.md`
- `docs/DAEMON_GROK_PARITY_PROGRESS.md`

### Commands

```text
pnpm test                          # pass: core 150/150; CLI 51/51
pnpm run lint                      # pass
pnpm run build                     # pass
cd packages/core && pnpm exec vitest run src/file-history.test.ts
                                   # pass: 15/15
pnpm exec xibecode compact --help  # pass
pnpm exec xibecode daemon --help   # pass
```

### Known gaps

- Full H6 still missing canonical command forms, output summaries, and timestamps — now done below.
- Live LLM daemon scenario still not run.

---

## H6 — Full verification evidence ledger

- Date: 2026-08-19
- Status: done (`verified`)
- Goal: persist a complete evidence row and keep stale/freshness across restart.

### Design chosen

Stay on `run-handoff` / transcript JSONL. No new database.

- Canonicalize equivalent commands (`pnpm run test` / `npm test` / `pnpm exec vitest run`) onto one match key.
- Chained `&&` / `||` / `;` stay one result with one exit code; do not invent per-segment pass/fail.
- Store a redacted output summary capped at 400 characters.
- Stamp `observedAt` on file and validation evidence.
- `restoreObservationFromHandoff()` reloads the ledger on agent resume, CLI compact, and daemon `/compact`.
- `applyPersistedFreshness()` marks validations stale when a persisted edit timestamp is newer.

### Files changed

- `packages/core/src/run-handoff.ts`
- `packages/core/src/run-handoff.test.ts`
- `packages/core/src/transcript-types.ts`
- `packages/core/src/index.ts`
- `packages/core/src/agent.ts`
- `packages/cli/src/commands/compact.ts`
- `packages/cli/src/gateway/chat-controller.ts`
- `docs/DAEMON_GROK_PARITY_MASTER_PLAN.md`
- `docs/DAEMON_GROK_PARITY_PROGRESS.md`

### Commands

```text
pnpm test                          # pass: core 154/154; CLI 51/51
pnpm run lint                      # pass
pnpm run build                     # pass
cd packages/core && pnpm exec vitest run src/file-history.test.ts
                                   # pass: 15/15
pnpm exec xibecode compact --help  # pass
pnpm exec xibecode daemon --help   # pass
```

### Known gaps

- Live LLM multi-adapter daemon scenario still not run.
- Vector/recency ranking, curated consolidation, and delivery ledger remain later versions.

