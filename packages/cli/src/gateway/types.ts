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

export type LocalMediaKind = 'photo' | 'video' | 'audio' | 'voice' | 'document';

export interface SendLocalFileOptions {
  caption?: string;
  /** Force kind; otherwise inferred from extension. */
  kind?: LocalMediaKind;
  threadId?: string;
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
  /**
   * Upload a local file to the user (Telegram: sendPhoto/Video/Document/Voice).
   * Optional — platforms without file upload skip MEDIA: delivery.
   */
  sendLocalFile?(
    chatId: string,
    filePath: string,
    opts?: SendLocalFileOptions,
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
  /**
   * Optional: edit an interactive prompt (approval / ask) to final text and
   * remove inline buttons (Hermes: edit_message_text + reply_markup=None).
   */
  editInteractiveMessage?(
    chatId: string,
    messageId: string,
    text: string,
  ): Promise<void>;
  /**
   * Optional: approval prompt with platform-native buttons when available.
   * Returns the platform message id so callers can clear buttons after resolve.
   */
  sendApprovalPrompt?(
    chatId: string,
    text: string,
    approvalId: string,
    opts?: { threadId?: string },
  ): Promise<string | undefined | void>;
  /**
   * Hermes-style ask_user / clarify with numbered buttons.
   * Returns message id for post-resolve button cleanup.
   */
  sendAskPrompt?(
    chatId: string,
    question: string,
    choices: string[] | undefined,
    askId: string,
    opts?: { threadId?: string },
  ): Promise<string | undefined | void>;
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
  /** Platform message id of the prompt (for clearing inline buttons). */
  messageId?: string;
}

export interface PendingAsk {
  id: string;
  question: string;
  choices?: string[];
  resolve: (answer: string) => void;
  reject: (err: Error) => void;
  createdAt: number;
  /** Platform message id of the prompt (for clearing inline buttons). */
  messageId?: string;
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
  /**
   * Set by /stop when the busy slot was force-cleared so a hung LLM call
   * cannot keep the chat busy forever. The orphaned run should not re-claim
   * the slot or drain the queue in finally.
   */
  forceStopped?: boolean;
}
