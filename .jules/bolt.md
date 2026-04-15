## 2024-05-15 - [Optimize File I/O for Sessions]
**Learning:** Sequential file reading in `list` functions (like in `SessionManager`, `HistoryManager`, and `PlanSession`) when dealing with many files (e.g. 1000+ files) can be quite slow because of single-threaded waiting for disk I/O.
**Action:** Use chunked `Promise.all` with a batch size of 100 to read files in parallel. This significantly decreases the loading time without causing OS-level `EMFILE` errors by bounding the concurrency.
