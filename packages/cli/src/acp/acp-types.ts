/**
 * ACP (Agent Client Protocol) TypeScript types.
 *
 * Implements JSON-RPC 2.0 line-delimited stdio messages for Zed.
 *
 * @module acp-types
 */

// ─── JSON-RPC 2.0 Base ─────────────────────────────────────

export interface ACPRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

export interface ACPResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: ACPError;
}

export interface ACPNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface ACPError {
  code: number;
  message: string;
  data?: unknown;
}

// ─── Initialize ────────────────────────────────────────────

export interface ACPInitializeParams {
  protocolVersion: number;
  clientCapabilities?: unknown;
  clientInfo?: { name: string; title?: string; version: string };
}

export interface ACPInitializeResult {
  protocolVersion: number;
  agentCapabilities: ACPAgentCapabilities;
  agentInfo: { name: string; title?: string; version: string };
  authMethods: unknown[];
}

export interface ACPAgentCapabilities {
  loadSession?: boolean;
  promptCapabilities?: {
    image?: boolean;
    audio?: boolean;
    embeddedContext?: boolean;
  };
  mcpCapabilities?: {
    http?: boolean;
    sse?: boolean;
  };
  fsCapabilities?: {
    readTextFile?: boolean;
    readDirectory?: boolean;
    writeFile?: boolean;
    createFile?: boolean;
  };
  sessionCapabilities?: {
    close?: Record<string, never>;
    closeSession?: Record<string, never>;
  };
}

// ─── Sessions ──────────────────────────────────────────────

export interface ACPSessionNewParams {
  cwd: string;
  mcpServers?: unknown[];
}

export interface ACPSessionNewResult {
  sessionId: string;
  configOptions: ACPSessionConfigOption[];
  modes: ACPSessionModeState;
}

export interface ACPSessionConfigOption {
  id: string;
  name: string;
  description?: string;
  category?: "mode" | "model" | "thought_level" | string;
  type: "select";
  currentValue: string;
  options: Array<{ value: string; name: string; description?: string }>;
}

export interface ACPSessionModeState {
  currentModeId: string;
  availableModes: Array<{ id: string; name: string; description?: string }>;
}

export interface ACPSetConfigOptionParams {
  sessionId: string;
  configId: string;
  value: string;
}

export interface ACPSetModeParams {
  sessionId: string;
  modeId: string;
}

export interface ACPSessionPromptParams {
  sessionId: string;
  prompt: ACPContentBlock[];
}

export type ACPContentBlock =
  | { type: "text"; text: string }
  | { type: "resource_link"; uri: string; name?: string; mimeType?: string }
  | {
      type: "resource";
      resource: { uri: string; mimeType?: string; text?: string };
    }
  | Record<string, unknown>;

export interface ACPSessionPromptResult {
  stopReason:
    | "end_turn"
    | "max_tokens"
    | "max_turn_requests"
    | "refusal"
    | "cancelled";
}

export interface ACPSessionUpdateParams {
  sessionId: string;
  update: unknown;
}

// ─── Legacy Chat / Completion Compatibility ────────────────

export interface ACPChatParams {
  message: string;
  workspaceRoot?: string;
  messages?: ACPChatMessage[];
  visibleFiles?: string[];
  conversationId?: string;
}

export interface ACPChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ACPChatResult {
  content: string;
  conversationId?: string;
}

export interface ACPChatDeltaParams {
  content: string;
  done?: boolean;
  conversationId?: string;
}

// ─── ACP Error Codes ───────────────────────────────────────

export const ACP_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  AGENT_NOT_READY: -32000,
  AGENT_ERROR: -32001,
  CANCELLED: -32002,
} as const;

// ─── Method Names ──────────────────────────────────────────

export const ACP_METHODS = {
  INITIALIZE: "initialize",
  SESSION_NEW: "session/new",
  SESSION_PROMPT: "session/prompt",
  SESSION_CANCEL: "session/cancel",
  SESSION_CLOSE: "session/close",
  SESSION_UPDATE: "session/update",
  SESSION_SET_CONFIG_OPTION: "session/set_config_option",
  SESSION_SET_MODE: "session/set_mode",
  CHAT: "agent/chat",
  CHAT_DELTA: "agent/chatDelta",
  SHUTDOWN: "shutdown",
  CANCEL: "agent/cancel",
} as const;
