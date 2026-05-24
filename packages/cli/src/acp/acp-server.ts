/**
 * ACP (Agent Client Protocol) Server.
 *
 * When launched with `--acp`, xibecode runs as a headless JSON-RPC 2.0 server
 * over stdio, ready for direct integration with the Zed editor.
 *
 * All protocol logging goes to stderr so stdout stays clean for JSON messages.
 *
 * @module acp-server
 */

import * as readline from "node:readline";
import { createRequire } from "module";
import {
  EnhancedAgent,
  AgentStream,
  CodingToolExecutor,
  MCPClientManager,
  NeuralMemory,
  SkillManager,
  SessionMemory,
  type ProviderType,
} from "xibecode-core";
import { ConfigManager } from "../utils/config.js";
import { builtInSkillsDir } from "../utils/built-in-skills-dir.js";
import {
  type ACPRequest,
  type ACPResponse,
  type ACPNotification,
  type ACPInitializeParams,
  type ACPInitializeResult,
  type ACPSessionNewParams,
  type ACPSessionPromptParams,
  type ACPSessionPromptResult,
  type ACPChatParams,
  type ACPChatResult,
  type ACPChatDeltaParams,
  type ACPChatMessage,
  ACP_ERROR_CODES,
  ACP_METHODS,
} from "./acp-types.js";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version?: string };
const VERSION = pkg.version ?? "0.0.0";
const NAME = "xibecode";

// ─── Helpers ───────────────────────────────────────────────

function sendResponse(
  id: number | string | null,
  result?: unknown,
  error?: { code: number; message: string; data?: unknown },
) {
  const msg: ACPResponse = { jsonrpc: "2.0", id };
  if (error) {
    msg.error = error;
  } else {
    msg.result = result;
  }
  writeJson(msg);
}

function sendNotification(method: string, params: unknown) {
  const msg: ACPNotification = { jsonrpc: "2.0", method, params };
  writeJson(msg);
}

function writeJson(obj: unknown) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

// ─── Server State ──────────────────────────────────────────

interface ActiveChat {
  abortController: AbortController;
  conversationId: string;
}

let initialized = false;
let activeChat: ActiveChat | null = null;
let conversationCounter = 0;
const sessions = new Map<string, { cwd: string }>();

// ─── Request Handler ───────────────────────────────────────

async function handleRequest(req: ACPRequest, config: ConfigManager) {
  const { id, method, params } = req;

  try {
    switch (method) {
      case ACP_METHODS.INITIALIZE:
        return handleInitialize(id, params as ACPInitializeParams);

      case ACP_METHODS.SESSION_NEW:
        return handleSessionNew(id, params as ACPSessionNewParams);

      case ACP_METHODS.SESSION_PROMPT:
        return handleSessionPrompt(
          id,
          params as ACPSessionPromptParams,
          config,
        );

      case ACP_METHODS.SESSION_CLOSE:
        return handleSessionClose(id, params as { sessionId?: string });

      case ACP_METHODS.CHAT:
        return handleChat(id, params as ACPChatParams, config);

      case ACP_METHODS.CANCEL:
        return handleCancel(id);

      case ACP_METHODS.SHUTDOWN:
        return handleShutdown(id);

      default:
        sendResponse(id, undefined, {
          code: ACP_ERROR_CODES.METHOD_NOT_FOUND,
          message: `Unknown method: ${method}`,
        });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[acp] Error handling request:", method, message);
    sendResponse(id, undefined, {
      code: ACP_ERROR_CODES.INTERNAL_ERROR,
      message,
    });
  }
}

// ─── Initialize ────────────────────────────────────────────

function handleInitialize(id: number | string, params: ACPInitializeParams) {
  initialized = true;
  const requestedVersion =
    typeof params?.protocolVersion === "number" ? params.protocolVersion : 1;
  const result: ACPInitializeResult = {
    protocolVersion: requestedVersion === 1 ? 1 : 1,
    agentCapabilities: {
      loadSession: false,
      promptCapabilities: {
        embeddedContext: true,
      },
      mcpCapabilities: {},
      sessionCapabilities: {
        close: {},
      },
    },
    agentInfo: { name: NAME, title: "XibeCode", version: VERSION },
    authMethods: [],
  };
  sendResponse(id, result);
  console.error("[acp] Initialized — ready for requests");
}

// ─── Session Handlers ──────────────────────────────────────

function handleSessionNew(id: number | string, params: ACPSessionNewParams) {
  if (!initialized) {
    sendResponse(id, undefined, {
      code: ACP_ERROR_CODES.AGENT_NOT_READY,
      message: "Server not initialized. Send initialize first.",
    });
    return;
  }

  const cwd = params?.cwd;
  if (!cwd || typeof cwd !== "string" || !cwd.startsWith("/")) {
    sendResponse(id, undefined, {
      code: ACP_ERROR_CODES.INVALID_PARAMS,
      message: "session/new requires an absolute cwd.",
    });
    return;
  }

  const sessionId = `sess_${Date.now()}_${++conversationCounter}`;
  sessions.set(sessionId, { cwd });
  sendResponse(id, { sessionId });
}

async function handleSessionPrompt(
  id: number | string,
  params: ACPSessionPromptParams,
  config: ConfigManager,
) {
  if (!initialized) {
    sendResponse(id, undefined, {
      code: ACP_ERROR_CODES.AGENT_NOT_READY,
      message: "Server not initialized. Send initialize first.",
    });
    return;
  }

  const sessionId = params?.sessionId;
  const session = sessionId ? sessions.get(sessionId) : undefined;
  if (!sessionId || !session) {
    sendResponse(id, undefined, {
      code: ACP_ERROR_CODES.INVALID_PARAMS,
      message: "Unknown or missing sessionId.",
    });
    return;
  }

  const prompt = extractPromptText(params.prompt);
  if (!prompt.trim()) {
    sendResponse(id, undefined, {
      code: ACP_ERROR_CODES.INVALID_PARAMS,
      message: "session/prompt requires at least one text prompt block.",
    });
    return;
  }

  try {
    await runAgentTurn({
      prompt,
      workspaceRoot: session.cwd,
      conversationId: sessionId,
      config,
      onText: (text) =>
        sendNotification(ACP_METHODS.SESSION_UPDATE, {
          sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text },
          },
        }),
      onThinking: (message) =>
        sendNotification(ACP_METHODS.SESSION_UPDATE, {
          sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: `*${message}*\n` },
          },
        }),
    });
    const result: ACPSessionPromptResult = { stopReason: "end_turn" };
    sendResponse(id, result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes("abort")) {
      const result: ACPSessionPromptResult = { stopReason: "cancelled" };
      sendResponse(id, result);
      return;
    }
    sendResponse(id, undefined, {
      code: ACP_ERROR_CODES.AGENT_ERROR,
      message,
    });
  }
}

function handleSessionClose(
  id: number | string,
  params: { sessionId?: string },
) {
  if (params?.sessionId) {
    sessions.delete(params.sessionId);
    if (activeChat?.conversationId === params.sessionId) {
      activeChat.abortController.abort();
      activeChat = null;
    }
  }
  sendResponse(id, {});
}

function extractPromptText(prompt: ACPSessionPromptParams["prompt"]): string {
  if (!Array.isArray(prompt)) return "";
  return prompt
    .map((block) => {
      if (block && block.type === "text" && typeof block.text === "string")
        return block.text;
      if (block && block.type === "resource") {
        const resource = (block as { resource?: { text?: unknown } }).resource;
        if (typeof resource?.text === "string") return `\n\n${resource.text}`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

async function runAgentTurn(args: {
  prompt: string;
  workspaceRoot: string;
  conversationId: string;
  config: ConfigManager;
  onText: (text: string) => void;
  onThinking?: (message: string) => void;
}): Promise<string> {
  if (activeChat) {
    activeChat.abortController.abort();
    activeChat = null;
  }

  const abortController = new AbortController();
  activeChat = { abortController, conversationId: args.conversationId };

  try {
    const apiKey = args.config.getApiKey();
    if (!apiKey) {
      throw new Error(
        "No API key configured. Run xibecode config --set-key YOUR_KEY.",
      );
    }

    const model = args.config.getModel(false);
    const baseUrl = args.config.getBaseUrl();
    const provider = args.config.get("provider") as ProviderType | undefined;

    const skillManager = new SkillManager(
      args.workspaceRoot,
      apiKey,
      baseUrl,
      model,
      provider,
      builtInSkillsDir,
    );
    await skillManager.loadSkills().catch(() => {});

    const mcpClientManager = new MCPClientManager();
    const memory = new NeuralMemory(args.workspaceRoot);
    await memory.init().catch(() => {});

    const toolExecutor = new CodingToolExecutor(args.workspaceRoot, {
      mcpClientManager,
      skillManager,
      memory,
    });

    const sessionMemory = new SessionMemory(args.workspaceRoot);
    await sessionMemory.loadPreviousLearnings().catch(() => {});

    let defaultSkillsPrompt = "";
    try {
      defaultSkillsPrompt = await skillManager.buildDefaultSkillsPromptForTask(
        args.prompt,
        args.workspaceRoot,
      );
    } catch {
      // non-critical
    }

    const agent = new EnhancedAgent(
      {
        apiKey,
        baseUrl,
        model,
        maxIterations: 150,
        verbose: false,
        provider,
        requestFormat: "auto",
        defaultSkillsPrompt,
        sessionMemory,
      },
      provider,
    );

    const stream = new AgentStream(
      agent,
      args.prompt,
      toolExecutor.getTools(),
      toolExecutor,
      {
        signal: abortController.signal,
      },
    );

    let fullContent = "";
    await stream.onEvent((event) => {
      switch (event.type) {
        case "text_delta":
          fullContent += event.text;
          args.onText(event.text);
          break;
        case "thinking":
          args.onThinking?.(event.message);
          break;
        case "error":
          console.error("[acp] Agent error:", event.message);
          break;
        case "warning":
          console.error("[acp] Agent warning:", event.message);
          break;
        default:
          break;
      }
      return undefined;
    });

    await sessionMemory.persist().catch(() => {});
    return fullContent;
  } finally {
    if (activeChat?.conversationId === args.conversationId) {
      activeChat = null;
    }
  }
}

// ─── Chat Handler ──────────────────────────────────────────

async function handleChat(
  id: number | string,
  params: ACPChatParams,
  config: ConfigManager,
) {
  if (!initialized) {
    sendResponse(id, undefined, {
      code: ACP_ERROR_CODES.AGENT_NOT_READY,
      message: "Server not initialized. Send initialize first.",
    });
    return;
  }

  const workspaceRoot = params.workspaceRoot ?? process.cwd();
  const conversationId =
    params.conversationId ?? `conv_${Date.now()}_${++conversationCounter}`;

  // Cancel any previous active chat
  if (activeChat) {
    activeChat.abortController.abort();
    activeChat = null;
  }

  const abortController = new AbortController();
  activeChat = { abortController, conversationId };

  // Build the prompt from the user message + optional history
  const userMessage = params.message;

  try {
    const apiKey = config.getApiKey();
    if (!apiKey) {
      sendResponse(id, undefined, {
        code: ACP_ERROR_CODES.AGENT_ERROR,
        message:
          "No API key configured. Run xibecode config --set-key YOUR_KEY.",
      });
      activeChat = null;
      return;
    }

    const model = config.getModel(false);
    const baseUrl = config.getBaseUrl();
    const provider = config.get("provider") as ProviderType | undefined;

    // Initialize ancillary services
    const skillManager = new SkillManager(
      workspaceRoot,
      apiKey,
      baseUrl,
      model,
      provider,
      builtInSkillsDir,
    );
    await skillManager.loadSkills().catch(() => {});

    const mcpClientManager = new MCPClientManager();
    const memory = new NeuralMemory(workspaceRoot);
    await memory.init().catch(() => {});

    const toolExecutor = new CodingToolExecutor(workspaceRoot, {
      mcpClientManager,
      skillManager,
      memory,
    });

    const sessionMemory = new SessionMemory(workspaceRoot);
    await sessionMemory.loadPreviousLearnings().catch(() => {});

    let defaultSkillsPrompt = "";
    try {
      defaultSkillsPrompt = await skillManager.buildDefaultSkillsPromptForTask(
        userMessage,
        workspaceRoot,
      );
    } catch {
      // non-critical
    }

    const agent = new EnhancedAgent(
      {
        apiKey,
        baseUrl,
        model,
        maxIterations: 150,
        verbose: false,
        provider: provider,
        requestFormat: "auto",
        defaultSkillsPrompt,
        sessionMemory,
      },
      provider,
    );

    // Build full context from messages history if provided
    let prompt = userMessage;
    if (params.messages && params.messages.length > 0) {
      // Format the conversation history into a single prompt
      const history = params.messages
        .map((m: ACPChatMessage) => {
          const label =
            m.role === "user"
              ? "User"
              : m.role === "assistant"
                ? "Assistant"
                : "System";
          return `[${label}]\n${m.content}`;
        })
        .join("\n\n");
      prompt = `${history}\n\n[User]\n${userMessage}`;
    }

    const stream = new AgentStream(
      agent,
      prompt,
      toolExecutor.getTools(),
      toolExecutor,
      {
        signal: abortController.signal,
      },
    );

    let fullContent = "";

    await stream.onEvent((event) => {
      switch (event.type) {
        case "text_delta":
          fullContent += event.text;
          // Stream chunk back to Zed immediately
          const delta: ACPChatDeltaParams = {
            content: event.text,
            conversationId,
          };
          sendNotification(ACP_METHODS.CHAT_DELTA, delta);
          break;

        case "thinking":
          // Send thinking as a delta too so Zed can show progress
          const thinkDelta: ACPChatDeltaParams = {
            content: `*${event.message}*\n`,
            conversationId,
          };
          sendNotification(ACP_METHODS.CHAT_DELTA, thinkDelta);
          break;

        case "error":
          console.error("[acp] Agent error:", event.message);
          break;

        case "warning":
          console.error("[acp] Agent warning:", event.message);
          break;

        default:
          break;
      }
      return undefined;
    });

    await sessionMemory.persist().catch(() => {});

    // Send final response
    const result: ACPChatResult = {
      content: fullContent,
      conversationId,
    };

    // Send a final done delta so Zed knows streaming is complete
    const finalDelta: ACPChatDeltaParams = {
      content: "",
      done: true,
      conversationId,
    };
    sendNotification(ACP_METHODS.CHAT_DELTA, finalDelta);

    sendResponse(id, result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[acp] Chat error:", message);
    sendResponse(id, undefined, {
      code: ACP_ERROR_CODES.AGENT_ERROR,
      message,
    });
  } finally {
    if (activeChat?.conversationId === conversationId) {
      activeChat = null;
    }
  }
}

// ─── Cancel Handler ────────────────────────────────────────

function handleCancel(id: number | string) {
  if (activeChat) {
    activeChat.abortController.abort();
    activeChat = null;
    console.error("[acp] Chat cancelled");
  }
  sendResponse(id, { cancelled: true });
}

// ─── Shutdown Handler ──────────────────────────────────────

function handleShutdown(id: number | string) {
  sendResponse(id, { shuttingDown: true });
  console.error("[acp] Shutting down");
  // Flush and exit after a brief delay so the response goes out
  setImmediate(() => process.exit(0));
}

// ─── Entry Point ───────────────────────────────────────────

/**
 * Start the ACP server.
 *
 * Redirects all diagnostic output to stderr and listens for
 * JSON-RPC 2.0 messages on stdin. Each line is a complete message.
 *
 * Call this when `--acp` is passed on the command line.
 */
export async function startACPServer(profile?: string) {
  // Redirect all console.log to stderr so stdout stays clean
  // (console.error already goes to stderr by default)
  const origLog = console.log;
  console.log = (...args: unknown[]) => {
    console.error("[xibecode]", ...args);
  };

  console.error(
    "[acp] Starting ACP server (profile: %s)",
    profile ?? "default",
  );

  const config = new ConfigManager(profile);

  // Verify API key exists early
  const apiKey = config.getApiKey();
  if (!apiKey) {
    console.error("[acp] FATAL: No API key configured.");
    console.error("[acp] Run `xibecode config --set-key YOUR_KEY` first.");
    process.exit(1);
  }

  // Read JSON-RPC messages from stdin, one JSON object per line
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on("line", (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let req: ACPRequest | ACPNotification;
    try {
      req = JSON.parse(trimmed) as ACPRequest | ACPNotification;
    } catch {
      console.error("[acp] Failed to parse JSON:", trimmed.slice(0, 200));
      // Send back a JSON-RPC parse error (no id since we couldn't parse it)
      writeJson({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: ACP_ERROR_CODES.PARSE_ERROR,
          message: "Parse error: invalid JSON",
        },
      });
      return;
    }

    if (req.jsonrpc !== "2.0" || typeof req.method !== "string") {
      const id = "id" in req ? req.id : null;
      sendResponse(id ?? null, undefined, {
        code: ACP_ERROR_CODES.INVALID_REQUEST,
        message: "Invalid JSON-RPC 2.0 message",
      });
      return;
    }

    // Notifications do not have an id and must not receive a response.
    if (!("id" in req) || req.id === undefined || req.id === null) {
      if (
        req.method === ACP_METHODS.SESSION_CANCEL ||
        req.method === ACP_METHODS.CANCEL
      ) {
        if (activeChat) {
          activeChat.abortController.abort();
          activeChat = null;
          console.error("[acp] Chat cancelled");
        }
      }
      return;
    }

    handleRequest(req, config);
  });

  rl.on("close", () => {
    console.error("[acp] stdin closed — exiting");
    process.exit(0);
  });

  // Handle SIGINT / SIGTERM gracefully
  process.on("SIGINT", () => {
    console.error("[acp] Received SIGINT — shutting down");
    if (activeChat) {
      activeChat.abortController.abort();
    }
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.error("[acp] Received SIGTERM — shutting down");
    if (activeChat) {
      activeChat.abortController.abort();
    }
    process.exit(0);
  });

  // Signal to Zed that the server is ready. Some ACP clients expect
  // an initial response or just wait for the initialize handshake.
  // We do nothing here — Zed will send initialize which we handle.
  console.error("[acp] Listening for JSON-RPC messages on stdin...");
}
