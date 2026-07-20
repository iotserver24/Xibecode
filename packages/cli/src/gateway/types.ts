/**
 * Shared messaging types for the coding-focused 24/7 gateway.
 */

import type { DangerousApprovalChoice, DangerousApprovalRequest } from 'xibecode-core';

export type PlatformName = 'telegram' | 'discord' | 'slack';

export interface InboundMessage {
  platform: PlatformName;
  chatId: string;
  userId: string;
  text: string;
  messageId?: string;
  username?: string;
  /** Channel/thread metadata for threaded platforms. */
  threadId?: string;
  /** True when synthesized from an inline-button tap. */
  fromCallback?: boolean;
}

export interface SendMessageOptions {
  threadId?: string;
  /** Telegram inline keyboard (and compatible platforms if supported). */
  replyMarkup?: Record<string, unknown>;
}

export interface MessagingAdapter {
  readonly name: PlatformName;
  /** Optional home channel for cron delivery. */
  homeChannel?: string;
  stop(): void;
  sendMessage(
    chatId: string,
    text: string,
    opts?: SendMessageOptions,
  ): Promise<void>;
  /** Optional typing indicator. */
  sendTyping?(chatId: string, opts?: { threadId?: string }): Promise<void>;
  /** Optional: edit a progress message in place. Returns message id. */
  sendOrEditProgress?(
    chatId: string,
    text: string,
    previousMessageId?: string,
    opts?: { threadId?: string },
  ): Promise<string | undefined>;
  /** Optional: approval prompt with platform-native buttons when available. */
  sendApprovalPrompt?(
    chatId: string,
    text: string,
    approvalId: string,
    opts?: { threadId?: string },
  ): Promise<void>;
  /** Hermes-style ask_user / clarify with numbered buttons. */
  sendAskPrompt?(
    chatId: string,
    question: string,
    choices: string[] | undefined,
    askId: string,
    opts?: { threadId?: string },
  ): Promise<void>;
  /** Hermes-style model picker (inline keyboard). */
  sendModelPicker?(
    chatId: string,
    opts: {
      models: string[];
      current: string;
      profileDefault: string;
      chatOverride?: string;
      providerSlug?: string;
      providers?: Array<{
        slug: string;
        name: string;
        models: string[];
        total_models?: number;
        is_current?: boolean;
      }>;
      onModelSelected?: (
        chatId: string,
        modelId: string,
        providerSlug: string,
      ) => Promise<string>;
    },
  ): Promise<void>;
  /** Flat choice buttons (e.g. /level). */
  sendChoicePicker?(
    chatId: string,
    title: string,
    choices: Array<{ value: string; label: string; current?: boolean }>,
    prefix?: string,
  ): Promise<void>;
  /** Start receiving messages until stop(). */
  runLoop(onMessage: (msg: InboundMessage) => Promise<void>): Promise<void>;
}

export interface PendingApproval {
  id: string;
  request: DangerousApprovalRequest;
  resolve: (choice: DangerousApprovalChoice) => void;
  createdAt: number;
}

export interface PendingAsk {
  id: string;
  question: string;
  choices?: string[];
  resolve: (answer: string) => void;
  reject: (err: Error) => void;
  createdAt: number;
}

export interface ActiveRun {
  abort: AbortController;
  startedAt: number;
  prompt: string;
  pendingApproval?: PendingApproval;
  pendingAsk?: PendingAsk;
  /** Last tool line for /status while busy. */
  lastToolLine?: string;
  toolCount?: number;
  criticalWarnings?: number;
  /** Optional: kill foreground shells when /stop (set by runner). */
  interruptCommands?: () => number;
}
