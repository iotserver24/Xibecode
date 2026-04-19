## 2024-06-25 - Bounded Concurrency for History Loading
**Learning:** The file-per-session storage architecture creates a significant I/O bottleneck when loading list views (`listSessions`, `list`, `listRecent`), as reading thousands of files sequentially takes O(n) time.
**Action:** When parallelizing file I/O operations over an arbitrary or potentially large number of files, always use bounded concurrency (e.g., chunking promises into batches) rather than unbounded `Promise.all` to prevent OS-level 'EMFILE' (too many open files) errors, achieving ~3-4x speedups without instability.


## 2025-02-12 - Bounded Concurrency for Tool Executions (Files and Directories)
**Learning:** Tools that execute `Promise.all` and `Promise.allSettled` over arbitrary lengths of user-provided paths (`readMultipleFiles`) or unknown directory lengths (`listDirectory`) risk overwhelming OS-level file handles (EMFILE limits) leading to crash.
**Action:** Consistently replace unbounded concurrency arrays for file system calls in application tools with explicit chunking logic (e.g. `CONCURRENCY_LIMIT` of 20-50).
## 2026-04-19 - Prompt engineering and loop break instructions
**Learning:** LLMs often get stuck repeatedly calling the same invalid tools in Agent Mode if the `LoopDetector` warning simply returns a generic error.
**Action:** Use aggressive instructions in error returns ("STOP and RE-EVALUATE", "DO NOT GUESS") to break the model out of cyclical tool usages. Add explicit instructions not to hallucinate file paths in the `getSystemPrompt` method to prevent failure before it happens.
