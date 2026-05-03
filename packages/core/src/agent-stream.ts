/**
 * AgentStream — ergonomic wrapper around the EnhancedAgent streaming API.
 *
 * Provides convenience methods for consuming agent events:
 * - `text()` — collect only the text output as a single string
 * - `collect()` — collect all events into an array
 * - `onEvent(callback)` — callback-driven consumption
 * - `pipe(writable)` — pipe text deltas to a Node.js Writable stream
 * - `forEach(callback)` — iterate events with a callback
 *
 * @module agent-stream
 */

import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import type { StreamEvent, StreamOptions } from './types/index.js';
import type { EnhancedAgent } from './agent.js';

/**
 * Ergonomic wrapper around the `EnhancedAgent.stream()` async generator.
 *
 * ```ts
 * const stream = new AgentStream(agent, prompt, tools, executor);
 *
 * // Option 1: just get the final text
 * const text = await stream.text();
 *
 * // Option 2: iterate with callbacks
 * await stream.onEvent((event) => {
 *   if (event.type === 'text_delta') process.stdout.write(event.text);
 * });
 *
 * // Option 3: collect everything
 * const events = await stream.collect();
 * ```
 */
export class AgentStream {
  private generator: AsyncGenerator<StreamEvent, void, undefined>;
  private consumed = false;

  constructor(
    private readonly agent: EnhancedAgent,
    private readonly prompt: string,
    private readonly tools: Tool[],
    private readonly toolExecutor: any,
    private readonly opts?: StreamOptions,
  ) {
    this.generator = agent.stream(prompt, tools, toolExecutor, opts);
  }

  /** Whether the stream has been fully consumed. */
  get isConsumed(): boolean {
    return this.consumed;
  }

  /**
   * Iterate over all stream events using `for await`.
   * This is the primary consumption method.
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<StreamEvent, void, undefined> {
    try {
      for await (const event of this.generator) {
        yield event;
      }
    } finally {
      this.consumed = true;
    }
  }

  /**
   * Collect all text deltas and return the complete text output.
   * Convenience method when you only need the final string.
   */
  async text(): Promise<string> {
    let result = '';
    for await (const event of this) {
      if (event.type === 'text_delta') {
        result += event.text;
      }
    }
    return result;
  }

  /**
   * Collect all stream events into an array.
   */
  async collect(): Promise<StreamEvent[]> {
    const events: StreamEvent[] = [];
    for await (const event of this) {
      events.push(event);
    }
    return events;
  }

  /**
   * Iterate events with a callback. Resolves when the stream ends.
   * Return `false` from the callback to abort early.
   */
  async onEvent(callback: (event: StreamEvent) => boolean | void): Promise<void> {
    for await (const event of this) {
      const result = callback(event);
      if (result === false) break;
    }
  }

  /**
   * Iterate events with an async callback. Resolves when the stream ends.
   * Return `false` from the callback to abort early.
   */
  async onEventAsync(callback: (event: StreamEvent) => Promise<boolean | void>): Promise<void> {
    for await (const event of this) {
      const result = await callback(event);
      if (result === false) break;
    }
  }

  /**
   * Pipe text deltas to a Node.js Writable stream (e.g. process.stdout).
   * Other events are silently skipped.
   */
  async pipeText(writable: { write: (chunk: string) => void }): Promise<void> {
    for await (const event of this) {
      if (event.type === 'text_delta') {
        writable.write(event.text);
      }
    }
    writable.write('\n');
  }

  /**
   * Get only events of a specific type.
   */
  async *filter<K extends StreamEvent['type']>(
    eventType: K,
  ): AsyncGenerator<Extract<StreamEvent, { type: K }>, void, undefined> {
    for await (const event of this) {
      if (event.type === eventType) {
        yield event as Extract<StreamEvent, { type: K }>;
      }
    }
  }
}
