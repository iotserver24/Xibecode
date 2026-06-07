## 2024-11-20 - Cache Event Targets Before Batch Processing

**Learning:** Processing incoming high-frequency streams (like `stream_text` via `handleAgentEvents`) typically comes in batches. A naive approach of searching `[...prev].findIndex` to find the target item to update results in O(N) operations per batch event. Thus, a batch of size M results in an O(N*M) bottleneck, degrading performance heavily as the conversation (`prev` array) gets larger.

**Action:** Cache the target items or indices (like `streamingAssistantIdx`) before entering the batch loop. Update these cached values as elements get pushed/popped during the loop. This reduces the time complexity from O(N*M) to O(N + M). Use stacks (`pop()`) for events that might have multiple missing counterparts (e.g. `tool_result` corresponding to unresolved `tool_call` items) to properly mimic previous LIFO reverse search behavior.
