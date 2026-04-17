## 2026-04-17 - React Memoization Opportunity
**Learning:** The ChatPanel component contains a `MessageItem` child component that renders each chat message. Since the chat message array updates frequently (especially during streaming), `MessageItem` re-renders constantly if not memoized, causing unnecessary React rendering overhead.
**Action:** Wrap the `MessageItem` component in `React.memo` to prevent unnecessary re-renders when the parent component updates, improving frontend performance.
