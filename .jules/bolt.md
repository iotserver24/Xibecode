## 2024-06-25 - Bounded Concurrency for History Loading
**Learning:** The file-per-session storage architecture creates a significant I/O bottleneck when loading list views (`listSessions`, `list`, `listRecent`), as reading thousands of files sequentially takes O(n) time.
**Action:** When parallelizing file I/O operations over an arbitrary or potentially large number of files, always use bounded concurrency (e.g., chunking promises into batches) rather than unbounded `Promise.all` to prevent OS-level 'EMFILE' (too many open files) errors, achieving ~3-4x speedups without instability.


## 2025-02-12 - Bounded Concurrency for Tool Executions (Files and Directories)
**Learning:** Tools that execute `Promise.all` and `Promise.allSettled` over arbitrary lengths of user-provided paths (`readMultipleFiles`) or unknown directory lengths (`listDirectory`) risk overwhelming OS-level file handles (EMFILE limits) leading to crash.
**Action:** Consistently replace unbounded concurrency arrays for file system calls in application tools with explicit chunking logic (e.g. `CONCURRENCY_LIMIT` of 20-50).
## 2026-04-19 - Prompt engineering and loop break instructions
**Learning:** LLMs often get stuck repeatedly calling the same invalid tools in Agent Mode if the `LoopDetector` warning simply returns a generic error.
**Action:** Use aggressive instructions in error returns ("STOP and RE-EVALUATE", "DO NOT GUESS") to break the model out of cyclical tool usages. Add explicit instructions not to hallucinate file paths in the `getSystemPrompt` method to prevent failure before it happens.
## 2026-04-23 - Asynchronous File Reading for Logs and Memory\n**Learning:** Reading potentially large files (like activity logs or memory markdown files) synchronously using `fs.readFileSync` blocks the Node.js event loop and the Electron main thread. This causes UI stuttering and unresponsiveness, which is particularly problematic as files grow over time.\n**Action:** Always prefer asynchronous file reading (`fs.promises.readFile`) in IPC handlers and core async pathways to prevent thread blocking and preserve application responsiveness.
## 2026-04-25 - [Bounded Concurrency for fs.stat]
**Learning:** Even lightweight I/O operations like `fs.stat` require bounded concurrency (e.g., chunking promises into batches) when operating on an arbitrary or potentially large number of files. Unbounded `Promise.all` can still trigger OS-level 'EMFILE' (too many open files) errors because Node.js attempts to open all file descriptors simultaneously.
**Action:** Always apply bounded concurrency (like `CONCURRENCY_LIMIT = 20`) for any `fs` operations that iterate over directories or unknown list sizes, not just for reading file contents.
## 2024-04-28 - O(N) cascade re-renders in FileExplorer with Zustand\n**Learning:** Prop-drilling large state objects from Zustand to recursive UI components (like tree nodes) creates O(N) re-renders because every single component evaluates top-down when one state changes. React.memo requires complicated state logic to resolve if parents receive all state.\n**Action:** Extract large state reads into fine-grained Zustand selectors directly at the target child component. Zustand manages subscriptions per-component, achieving O(1) targeted updates.


## 2026-04-29 - O(N) cascade re-renders in ChatPanel with Zustand
**Learning:** When using React components like ChatPanel to display a list of messages, if the messages list updates frequently (e.g. streaming tokens), it will trigger O(N) re-renders for every message because the parent component renders on every token. Zustand maintains object references for unchanged items, but the parent re-renders them all.
**Action:** Always wrap list item components with `React.memo()` when rendering lists driven by frequent updates (like token streaming) to prevent O(N) cascade re-renders.

## 2025-05-18 - [O(N) Cascade re-renders in ChatPanel with React]
**Learning:** Prop-drilling large state objects from Zustand to UI components mapping arrays (like `MessageItem`s array mapping) creates O(N) re-renders because every single component evaluates when the array maps changes.
**Action:** Extract large state reads, such as mappings onto lists, and wrap mapping target component with `React.memo` to achieve O(1) targeted updates.

## 2024-05-18 - [O(N) cascade re-renders in ChatPanel with React]
**Learning:** Prop-drilling state and rendering lists (like ChatPanel rendering MessageBubble and ToolCallCard arrays) when state updates are extremely frequent (e.g., token streaming via Zustand or props) causes all list items to re-render constantly. This creates an O(N) re-render cascade for the entire message list, significantly degrading performance during streaming.
**Action:** Always wrap list item components (e.g. `MessageBubble`, `ToolCallCard`) with `React.memo()` when rendering lists that undergo frequent partial updates (like streaming tokens appended to the last message). This prevents O(N) cascade re-renders, limiting updates to only the items that actually changed.

## 2026-05-03 - [O(N) Cascade re-renders in Lists with State-Driven Hover]
**Learning:** Prop-drilling or managing local interactive state (like `hoveredId` on `mouseenter`/`mouseleave`) within a list component mapping an array of items (like `ChatHistory` mapping `SessionItem`s) creates O(N) re-renders when interacting with any single item.
**Action:** Always favor native CSS pseudo-classes like `:hover` or Tailwind's `group-hover` over interactive React state for visually toggling elements inside rendered lists, and wrap the parent list component with `React.memo` if it sits alongside frequently updating sibling states (like a timer or streaming tokens).

## 2024-05-04 - Unnecessary Timer Re-renders
**Learning:** App.tsx has a 250ms setInterval updating state (runElapsed) while the agent is running, which forces the entire app tree (including large lists in FileExplorer and ChatPanel) to re-render 4 times a second.
**Action:** Always wrap large list components and recursive tree components (like FileExplorer's Row) in React.memo() when they are descendants of a component with high-frequency state updates. Also use useMemo for mapping large lists (like chat messages) to prevent unnecessary VDOM recreation.

## 2024-05-18 - [O(N) VDOM Recreation in ChatPanel with React]
**Learning:** Even if list item components (like `MessageBubble` and `ToolCallCard`) are memoized using `React.memo()`, mapping over a large array of messages inside the render cycle of a component that receives high-frequency prop updates (like `runElapsed` from a 250ms `setInterval`) still creates O(N) evaluations and recreates VDOM elements. This adds significant garbage collection overhead and reduces responsiveness.
**Action:** Always wrap the array mapping logic (`messages.map(...)`) itself with `useMemo` in parent components to completely prevent the O(N) iteration and VDOM element recreation on unrelated state changes.

## 2026-05-18 - [Top-Level Timer State Anti-Pattern]
**Learning:** Storing high-frequency update state like `runElapsed` (e.g. from a 250ms `setInterval`) in top-level components (like `App.tsx`) causes massive O(N) cascade re-renders across the entire application tree, negatively affecting performance during runtime.
**Action:** Extract high-frequency timer states into custom hooks (like `useRunElapsed`) and use them in small, dedicated leaf components wrapped with `React.memo()`. This confines re-renders specifically to the elements that display the changing value, protecting the rest of the application tree.
## 2025-05-07 - Array Copying and Scanning in High-Frequency Streams
**Learning:** Using `[...array].reverse().findIndex()` inside a high-frequency stream handler (like `handleAgentEvents` processing `tool_result`) creates an O(N) array allocation overhead per event, leading to garbage collection spikes. Similarly, using `findIndex` to search for the *last* element (which is usually at the end) results in unnecessary O(N) traversal.
**Action:** Always implement and use a reverse `for` loop (`findLastIndex`) instead of array copies or forward searches when looking for the most recent active element in an append-only list updated by high-frequency events.
