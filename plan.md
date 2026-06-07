1. **Optimize `handleAgentEvents` in `packages/desktop/src/renderer/App.tsx`**
   - In `packages/desktop/src/renderer/App.tsx`, the `handleAgentEvents` function contains an `O(N*M)` performance bottleneck because it performs an `O(N)` search (`findLastAssistantStreaming` and `findLastToolCall`) for every event in a batch of size `M`.
   - I will modify this to do a single `O(N)` scan upfront to cache `streamingAssistantIdx` and populate a stack `pendingToolIndices`. As events are processed in the batch, these cached values will be dynamically updated, bringing the time complexity down to `O(N + M)`.
2. **Run lint and tests to verify the optimization**
   - Run `pnpm lint` and `pnpm test` from the root directory to verify there are no syntax errors or regressions caused by the optimization.
3. **Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.**
   - Run the required tool to fetch and complete the checks prior to creating the pull request.
4. **Submit PR**
   - Create a pull request using the title format `⚡ Bolt: [performance improvement]`.
   - Describe the change in detail (What, Why, Impact, Measurement).
