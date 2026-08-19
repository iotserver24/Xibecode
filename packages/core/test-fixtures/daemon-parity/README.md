# Daemon parity fixture workspace

Small disposable project for daemon/handoff acceptance tests. No network and no extra dependencies.

Scripts:

- `node --test src/alpha.test.mjs` — passing check
- `node src/fail.mjs` — intentional non-zero exit
- `node src/alpha.mjs` — prints the exported greeting

Use an isolated `XIBECODE_HOME` / `XIBECODE_FILE_HISTORY_DIR` when driving the daemon against this tree.
