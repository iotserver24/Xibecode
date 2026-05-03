/**
 * Streaming types for the XibeCode agent engine.
 *
 * Provides a typed, ergonomic streaming interface for consuming
 * agent events including text deltas, tool calls, and lifecycle signals.
 *
 * @module types/stream
 */

import type { ImageAttachment } from './attachments.js';

// ─── Stream Event Types ─────────────────────────────────────

/** Discriminator for stream event kinds. */
export type StreamEventType =
  | 'thinking'
  | 'text_delta'
  | 'tool_call_start'
  | 'tool_call_end'
  | 'tool_result'
  | 'mode_changed'
  | 'warning'
  | 'error'
  | 'complete'
  | 'cancelled';

/** Agent is thinking / between turns. */
export interface ThinkingEvent {
  type: 'thinking';
  message: string;
}

/** Streaming text delta from the model. */
export interface TextDeltaEvent {
  type: 'text_delta';
  text: string;
  /** Persona metadata for coloring / labeling the output. */
  persona?: { name: string; color: string };
}

/** A tool call has started (name + input known). */
export interface ToolCallStartEvent {
  type: 'tool_call_start';
  name: string;
  input: unknown;
  index: number;
}

/** A tool call has finished. */
export interface ToolCallEndEvent {
  type: 'tool_call_end';
  name: string;
  result: unknown;
  success: boolean;
  index: number;
}

/** Agent mode has changed. */
export interface ModeChangedEvent {
  type: 'mode_changed';
  from: string;
  to: string;
  reason: string;
  auto: boolean;
}

/** Warning emitted during agent execution (non-fatal). */
export interface WarningEvent {
  type: 'warning';
  message: string;
}

/** Error during agent execution. */
export interface ErrorEvent {
  type: 'error';
  message: string;
  error?: string;
}

/** Agent run has completed successfully. */
export interface CompleteEvent {
  type: 'complete';
  iterations: number;
  toolCalls: number;
  filesChanged: number;
  costLabel?: string;
  inputTokens: number;
  outputTokens: number;
}

/** Agent run was cancelled by the user. */
export interface CancelledEvent {
  type: 'cancelled';
  iterations: number;
  toolCalls: number;
}

/** Discriminated union of all stream events. */
export type StreamEvent =
  | ThinkingEvent
  | TextDeltaEvent
  | ToolCallStartEvent
  | ToolCallEndEvent
  | ModeChangedEvent
  | WarningEvent
  | ErrorEvent
  | CompleteEvent
  | CancelledEvent;

// ─── Stream Options ─────────────────────────────────────────

/** Options for starting an agent stream. */
export interface StreamOptions {
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
  /** Image attachments to include with the prompt. */
  images?: ImageAttachment[];
}
