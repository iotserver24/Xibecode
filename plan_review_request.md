I plan to optimize `packages/desktop/src/renderer/components/ChatHistory.tsx` to improve performance for long lists of chat sessions.

1. **Memoize the grouping of sessions into an O(N) single pass.** Currently, it runs `sessions.filter` four times, resulting in an O(4N) operation that also instantiates `new Date(s.updated)` four times per item. I will replace this with a single pass using `useMemo` that evaluates each session's date once and pushes it to the correct group, preventing expensive recalculations on every render.
2. **Extract `ChatHistoryItem` as a `React.memo` component.** Currently, when `activeSessionId` changes, the entire list of `button` components re-renders because they are defined inline inside the mapping. By extracting the item to a `React.memo` component, only the previously active item and the newly active item will re-render, preventing O(N) cascading VDOM re-renders for unchanged chat history items.

This optimization addresses "Missing memoization for expensive computations", "Inefficient algorithms (O(n²) that could be O(n))", and "Unnecessary re-renders in React components".
