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
import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "module";
import {
  EnhancedAgent,
  AgentStream,
  CodingToolExecutor,
  MCPClientManager,
  NeuralMemory,
  SkillManager,
  SessionMemory,
  ENABLED_MODES,
  MODE_CONFIG,
  type AgentMode,
  type ProviderType,
} from "xibecode-core";
import { ConfigManager, PROVIDER_CONFIGS, listSetupProviders } from "../utils/config.js";
import { builtInSkillsDir } from "../utils/built-in-skills-dir.js";
import {
  type ACPRequest,
  type ACPResponse,
  type ACPNotification,
  type ACPInitializeParams,
  type ACPInitializeResult,
  type ACPSessionConfigOption,
  type ACPSessionModeState,
  type ACPSessionNewParams,
  type ACPSessionNewResult,
  type ACPSessionPromptParams,
  type ACPSessionPromptResult,
  type ACPSetConfigOptionParams,
  type ACPSetModeParams,
  type ACPChatParams,
  type ACPChatResult,
  type ACPChatDeltaParams,
  type ACPChatMessage,
  type ACPPermissionRequestParams,
  type ACPPermissionChoice,
  ACP_ERROR_CODES,
  ACP_METHODS,
} from "./acp-types.js";
import type { DangerousApprovalHandler } from "xibecode-core";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version?: string };
const VERSION = pkg.version ?? "0.0.0";
const NAME = "xibecode";
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

/** Pending dangerous-tool approvals (messaging gateway/Claude ACP-style). */
const pendingPermissions = new Map<
  string,
  { resolve: (c: ACPPermissionChoice) => void; createdAt: number }
>();
let permissionSeq = 0;

function createAcpApprovalHandler(sessionId: string): DangerousApprovalHandler {
  return async (req) => {
    const requestId = `perm-${++permissionSeq}`;
    sendNotification(ACP_METHODS.SESSION_UPDATE, {
      sessionId,
      sessionUpdate: "permission_request",
      requestId,
      toolName: req.toolName,
      detail: req.command || req.path || req.reason || "",
      choices: ["once", "session", "always", "deny"],
    });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingPermissions.delete(requestId);
        resolve("deny");
      }, 5 * 60 * 1000);
      pendingPermissions.set(requestId, {
        resolve: (c) => {
          clearTimeout(timer);
          resolve(c);
        },
        createdAt: Date.now(),
      });
    });
  };
}

function handlePermissionResponse(
  id: number | string | null,
  params: ACPPermissionRequestParams,
) {
  const requestId = params?.requestId;
  const choice = (params?.choice || "deny") as ACPPermissionChoice;
  const pending = requestId ? pendingPermissions.get(requestId) : undefined;
  if (pending) {
    pendingPermissions.delete(requestId!);
    pending.resolve(
      ["once", "session", "always", "deny"].includes(choice) ? choice : "deny",
    );
    sendResponse(id, { ok: true });
  } else {
    sendResponse(id, undefined, {
      code: ACP_ERROR_CODES.INVALID_PARAMS,
      message: "Unknown or expired permission requestId",
    });
  }
}

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

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
  label?: string,
): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err: unknown) => {
        clearTimeout(timer);
        if (label) {
          console.error(
            `[acp] ${label} failed:`,
            err instanceof Error ? err.message : String(err),
          );
        }
        resolve(fallback);
      });
  });
}

// ─── Server State ──────────────────────────────────────────

interface ActiveChat {
  abortController: AbortController;
  conversationId: string;
}

let initialized = false;
let activeChat: ActiveChat | null = null;
let conversationCounter = 0;
type SetupStep = "idle" | "pickProvider" | "baseUrl" | "apiKey" | "pickModel" | "manualModel";

type SetupState = {
  step: SetupStep;
  provider?: ProviderType | "custom";
  baseUrl?: string;
  apiKey?: string;
  models?: string[];
};

interface ACPSessionState {
  cwd: string;
  mode: AgentMode;
  model: string;
  setup?: SetupState;
  mcpClientManager?: MCPClientManager;
  mcpConnectPromise?: Promise<any>;
}

const sessions = new Map<string, ACPSessionState>();
const chatSessions = new Map<string, ACPSessionState>();
type ModelCacheEntry = {
  fetchedAt: number;
  models: string[];
  inflight?: Promise<string[]>;
};
const modelCache = new Map<string, ModelCacheEntry>();
// Keep in-flight skill load promises to pre-warm skills for a workspace+apiKey+model
const skillLoadPromises = new Map<string, Promise<void>>();

type SetupProviderOption = {
  label: string;
  value: ProviderType | "custom";
  baseUrl?: string;
  format?: "openai" | "anthropic";
  note?: string;
};

const SETUP_PROVIDERS: SetupProviderOption[] = [
  ...listSetupProviders().map((p) => ({
    label: p.label,
    value: p.id as ProviderType,
    baseUrl: p.baseUrl || undefined,
    format: p.format,
  })),
  {
    label: "Custom (paste your own Base URL)",
    value: "custom",
    note: "Lets you paste any OpenAI-compatible endpoint",
  },
];

// ─── Request Handler ───────────────────────────────────────

async function handleRequest(req: ACPRequest, config: ConfigManager) {
  const { id, method, params } = req;

  try {
    switch (method) {
      case ACP_METHODS.INITIALIZE:
        return handleInitialize(id, params as ACPInitializeParams);

      case ACP_METHODS.SESSION_NEW:
        return handleSessionNew(id, params as ACPSessionNewParams, config);

      case ACP_METHODS.SESSION_PROMPT:
        return handleSessionPrompt(
          id,
          params as ACPSessionPromptParams,
          config,
        );

      case ACP_METHODS.SESSION_CLOSE:
        return handleSessionClose(id, params as { sessionId?: string });

      case ACP_METHODS.SESSION_SET_CONFIG_OPTION:
        return handleSetConfigOption(
          id,
          params as ACPSetConfigOptionParams,
          config,
        );

      case ACP_METHODS.SESSION_SET_MODE:
        return handleSetMode(id, params as ACPSetModeParams, config);

      case ACP_METHODS.CHAT:
        return handleChat(id, params as ACPChatParams, config);

      case ACP_METHODS.CANCEL:
        return handleCancel(id);

      case ACP_METHODS.SESSION_PERMISSION:
        return handlePermissionResponse(
          id,
          params as ACPPermissionRequestParams,
        );

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
      fsCapabilities: {
        readTextFile: true,
        writeFile: true,
      },
      sessionCapabilities: {
        close: {},
        closeSession: {},
      },
    },
    agentInfo: { name: NAME, title: "XibeCode", version: VERSION },
    authMethods: [],
  };
  sendResponse(id, result);
  console.error("[acp] Initialized — ready for requests");
}

function isSetupCommand(input: string): boolean {
  return input.trim().toLowerCase().startsWith("/setup");
}

function isSetupCancel(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return ["cancel", "/cancel", "exit", "/exit", "quit"].includes(normalized);
}

function formatSetupProvidersPrompt(): string {
  const lines = ["Setup 1/3 — choose a provider:"];
  SETUP_PROVIDERS.forEach((provider, idx) => {
    const suffix = provider.note ? ` — ${provider.note}` : "";
    lines.push(`${idx + 1}. ${provider.label}${suffix}`);
  });
  lines.push("0. Cancel");
  lines.push("Type the number or provider name.");
  return lines.join("\n");
}

function formatSetupModelsPrompt(models: string[]): string {
  const limit = 20;
  const visible = models.slice(0, limit);
  const lines = [
    `Setup 3/3 — select a model (${models.length} available):`,
    ...visible.map((model, idx) => `${idx + 1}. ${model}`),
  ];
  if (models.length > limit) {
    lines.push(`…showing first ${limit} models`);
  }
  lines.push("0. Type a model ID manually");
  lines.push("Type the number or a model ID.");
  return lines.join("\n");
}

function resolveProviderChoice(input: string): SetupProviderOption | "cancel" | undefined {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "0") return "cancel";
  const numeric = Number(normalized);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= SETUP_PROVIDERS.length) {
    return SETUP_PROVIDERS[numeric - 1];
  }
  const direct = SETUP_PROVIDERS.find(
    (provider) =>
      provider.value === normalized ||
      provider.label.toLowerCase().includes(normalized),
  );
  return direct;
}

function resolveModelChoice(
  input: string,
  models: string[],
): { kind: "model"; value: string } | { kind: "manual" } | { kind: "invalid"; message: string } {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "invalid", message: "Model ID cannot be empty." };
  const normalized = trimmed.toLowerCase();
  if (normalized === "0" || normalized === "manual" || normalized === "custom") {
    return { kind: "manual" };
  }
  const numeric = Number(normalized);
  if (Number.isFinite(numeric) && numeric >= 1) {
    if (numeric > models.length) {
      return { kind: "invalid", message: `Select a number between 1 and ${models.length}.` };
    }
    return { kind: "model", value: models[numeric - 1] };
  }
  const matched = models.find((model) => model.toLowerCase() === normalized);
  return { kind: "model", value: matched ?? trimmed };
}

async function handleSetupFlow(args: {
  input: string;
  session: ACPSessionState;
  config: ConfigManager;
  sendText: (text: string) => void;
  onConfigUpdated?: () => Promise<void>;
}): Promise<boolean> {
  const trimmed = args.input.trim();
  const setup = args.session.setup ?? { step: "idle" };

  if (isSetupCommand(trimmed)) {
    args.session.setup = { step: "pickProvider" };
    args.sendText("Setup started.");
    args.sendText(formatSetupProvidersPrompt());
    return true;
  }

  if (setup.step === "idle") {
    return false;
  }

  if (isSetupCancel(trimmed)) {
    args.session.setup = { step: "idle" };
    args.sendText("Setup cancelled.");
    return true;
  }

  if (setup.step === "pickProvider") {
    const choice = resolveProviderChoice(trimmed);
    if (!choice) {
      args.sendText("Please choose a provider from the list.");
      args.sendText(formatSetupProvidersPrompt());
      return true;
    }
    if (choice === "cancel") {
      args.session.setup = { step: "idle" };
      args.sendText("Setup cancelled.");
      return true;
    }

    args.session.setup = {
      step: choice.value === "custom" ? "baseUrl" : "apiKey",
      provider: choice.value,
      baseUrl: choice.baseUrl,
    };

    if (choice.value === "custom") {
      args.sendText(
        "Setup — enter Base URL (OpenAI format). Example: https://api.openai.com/v1",
      );
      return true;
    }

    args.config.set("provider", choice.value);
    if (choice.baseUrl) {
      args.config.set("baseUrl", choice.baseUrl);
    }
    if (choice.format) {
      args.config.set("requestFormat", choice.format);
    }
    args.sendText(
      `Selected provider: ${choice.value} (${choice.format ?? "auto"}). Now enter API key.`,
    );
    return true;
  }

  if (setup.step === "baseUrl") {
    if (!trimmed.startsWith("http")) {
      args.sendText("Base URL must start with http:// or https://");
      args.sendText(
        "Setup — enter Base URL (OpenAI format). Example: https://api.openai.com/v1",
      );
      return true;
    }
    const nextBase = trimmed.replace(/\/+$/, "");
    args.config.set("baseUrl", nextBase);
    if (!args.config.get("provider")) {
      args.config.set("provider", "openai");
    }
    if (!args.config.get("requestFormat")) {
      args.config.set("requestFormat", "openai");
    }
    args.session.setup = { ...setup, step: "apiKey", baseUrl: nextBase };
    args.sendText(`Saved base URL: ${nextBase}`);
    args.sendText("Setup 2/3 — enter API key (will be saved locally).");
    return true;
  }

  if (setup.step === "apiKey") {
    if (trimmed.length < 10) {
      args.sendText("API key seems too short. Paste the full key.");
      args.sendText("Setup 2/3 — enter API key.");
      return true;
    }
    args.config.set("apiKey", trimmed);
    args.session.setup = { ...setup, apiKey: trimmed, step: "pickModel" };
    args.sendText("API key saved.");
    args.sendText("Setup 3/3 — fetching models from /models…");
    try {
      const baseUrl = setup.baseUrl || args.config.getBaseUrl();
      if (!baseUrl) throw new Error("Missing base URL. Run /setup again.");
      const models = await fetchModelsFromEndpoint(baseUrl.replace(/\/+$/, ""), trimmed);
      const unique = Array.from(new Set(models)).sort((a, b) => a.localeCompare(b));
      if (!unique.length) {
        throw new Error("No models returned from /models");
      }
      args.session.setup = { ...setup, apiKey: trimmed, step: "pickModel", models: unique };
      args.sendText(formatSetupModelsPrompt(unique));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch models";
      args.sendText(`Error: ${message}`);
      args.sendText("Type /setup to restart setup.");
      args.session.setup = { step: "idle" };
    }
    return true;
  }

  if (setup.step === "manualModel") {
    if (!trimmed) {
      args.sendText("Model ID cannot be empty. Enter the model ID:");
      return true;
    }
    const chosen = trimmed;
    args.config.set("model", chosen);
    args.session.model = chosen;
    args.session.setup = { step: "idle" };
    args.sendText(`Setup complete! Model set to: ${chosen}`);
    await args.onConfigUpdated?.();
    return true;
  }

  if (setup.step === "pickModel") {
    const models = setup.models ?? [];
    const choice = resolveModelChoice(trimmed, models);
    if (choice.kind === "invalid") {
      args.sendText(choice.message);
      args.sendText(formatSetupModelsPrompt(models));
      return true;
    }
    if (choice.kind === "manual") {
      args.session.setup = { ...setup, step: "manualModel" };
      args.sendText("Enter model ID:");
      return true;
    }
    args.config.set("model", choice.value);
    args.session.model = choice.value;
    args.session.setup = { step: "idle" };
    args.sendText(`Setup complete! Model set to: ${choice.value}`);
    await args.onConfigUpdated?.();
    return true;
  }

  return false;
}

// ─── Session Handlers ──────────────────────────────────────

async function handleSessionNew(
  id: number | string,
  params: ACPSessionNewParams,
  config: ConfigManager,
) {
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
  const mcpClientManager = new MCPClientManager();
  const mcpConnectPromise = config.getMCPServers().then((mcpServers) => {
    if (Object.keys(mcpServers).length > 0) {
      console.error(`[acp] Connecting MCP servers asynchronously for session ${sessionId}...`);
      return mcpClientManager.connectAll(mcpServers, { retries: 1, backoffMs: 750 }).then(() => {
        console.error(`[acp] MCP servers connected for session ${sessionId}`);
      });
    }
  }).catch((err) => {
    console.error("[acp] Failed to connect MCP servers in background:", err instanceof Error ? err.message : String(err));
  });

  const session: ACPSessionState = {
    cwd,
    mode: "agent",
    model: getDefaultModel(config),
    setup: { step: "idle" },
    mcpClientManager,
    mcpConnectPromise,
  };
  sessions.set(sessionId, session);

  // Respond quickly with lightweight config options (no network calls)
  const quickConfigOptions = buildConfigOptionsSync(config, session);
  const result: ACPSessionNewResult = {
    sessionId,
    configOptions: quickConfigOptions,
    modes: buildModeState(session),
  };
  sendResponse(id, result);
  sendAvailableCommandsUpdate(sessionId);

  // Fetch full config asynchronously (including /models) and push an update when ready
  (async () => {
    try {
      const fullConfigOptions = await buildConfigOptions(config, session);
      sendNotification(ACP_METHODS.SESSION_UPDATE, {
        sessionId,
        update: { sessionUpdate: "config_option_update", configOptions: fullConfigOptions },
      });
    } catch (err: unknown) {
      console.error("[acp] Failed to fetch models for session: ", err instanceof Error ? err.message : String(err));
    }

    // Start preloading skills in the background to reduce first-turn latency
    try {
      const apiKey = config.getApiKey() ?? "";
      const baseUrl = config.getBaseUrl() ?? undefined;
      const provider = config.get("provider") as ProviderType | undefined;
      const model = session.model || getDefaultModel(config);
      const preloadKey = `${session.cwd}::${apiKey}::${model}`;
      if (!skillLoadPromises.has(preloadKey)) {
        const sm = new SkillManager(session.cwd, apiKey, baseUrl, model, provider, builtInSkillsDir);
        const p = sm.loadSkills().then(() => {
          // keep loaded; no-op
        }).catch((e: unknown) => {
          console.error("[acp] skill preload failed:", e instanceof Error ? e.message : String(e));
          skillLoadPromises.delete(preloadKey);
        });
        skillLoadPromises.set(preloadKey, p);
      }
    } catch (err: unknown) {
      console.error("[acp] skill preload setup failed:", err instanceof Error ? err.message : String(err));
    }
  })();
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

  sendNotification(ACP_METHODS.SESSION_UPDATE, {
    sessionId,
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "_Preparing context..._\n" },
    },
  });

  const prompt = await extractPromptText(params.prompt, session.cwd, {
    onResourceReadStart: (toolCallId, path) => {
      sendNotification(ACP_METHODS.SESSION_UPDATE, {
        sessionId,
        update: buildToolCallUpdate({
          sessionUpdate: "tool_call",
          toolCallId,
          cwd: session.cwd,
          name: "read_file",
          input: { path },
          status: "pending",
        }),
      });
      sendNotification(ACP_METHODS.SESSION_UPDATE, {
        sessionId,
        update: buildToolCallUpdate({
          sessionUpdate: "tool_call_update",
          toolCallId,
          cwd: session.cwd,
          name: "read_file",
          input: { path },
          status: "in_progress",
        }),
      });
    },
    onResourceReadEnd: (toolCallId, path, text, success) =>
      sendNotification(ACP_METHODS.SESSION_UPDATE, {
        sessionId,
        update: buildToolCallResultUpdate({
          sessionUpdate: "tool_call_update",
          toolCallId,
          cwd: session.cwd,
          name: "read_file",
          input: { path },
          result: success ? { path, content: text } : { path, error: text },
          success,
        }),
      }),
  });
  const trimmedPrompt = prompt.trim();
  const handledSetup = await handleSetupFlow({
    input: trimmedPrompt,
    session,
    config,
    sendText: (text) =>
      sendNotification(ACP_METHODS.SESSION_UPDATE, {
        sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: text.endsWith("\n") ? text : `${text}\n` },
        },
      }),
    onConfigUpdated: async () => {
      const configOptions = await buildConfigOptions(config, session);
      sendNotification(ACP_METHODS.SESSION_UPDATE, {
        sessionId,
        update: { sessionUpdate: "config_option_update", configOptions },
      });
    },
  });
  if (handledSetup) {
    const result: ACPSessionPromptResult = { stopReason: "end_turn" };
    sendResponse(id, result);
    return;
  }
  if (!trimmedPrompt) {
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
      model: session.model,
      mode: session.mode,
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
      onToolStart: (toolCallId, name, input) =>
        sendNotification(ACP_METHODS.SESSION_UPDATE, {
          sessionId,
          update: buildToolCallUpdate({
            sessionUpdate: "tool_call",
            toolCallId,
            cwd: session.cwd,
            name,
            input,
            status: "pending",
          }),
        }),
      onToolProgress: (toolCallId, name, input) =>
        sendNotification(ACP_METHODS.SESSION_UPDATE, {
          sessionId,
          update: buildToolCallUpdate({
            sessionUpdate: "tool_call_update",
            toolCallId,
            cwd: session.cwd,
            name,
            input,
            status: "in_progress",
          }),
        }),
      onToolEnd: (toolCallId, name, input, result, success) =>
        sendNotification(ACP_METHODS.SESSION_UPDATE, {
          sessionId,
          update: buildToolCallResultUpdate({
            sessionUpdate: "tool_call_update",
            toolCallId,
            cwd: session.cwd,
            name,
            input,
            result,
            success,
          }),
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
    const session = sessions.get(params.sessionId);
    if (session?.mcpClientManager) {
      session.mcpClientManager.disconnectAll().catch(() => {});
    }
    sessions.delete(params.sessionId);
    if (activeChat?.conversationId === params.sessionId) {
      activeChat.abortController.abort();
      activeChat = null;
    }
  }
  sendResponse(id, {});
}

async function handleSetConfigOption(
  id: number | string,
  params: ACPSetConfigOptionParams,
  config: ConfigManager,
) {
  const session = params?.sessionId
    ? sessions.get(params.sessionId)
    : undefined;
  if (!session) {
    sendResponse(id, undefined, {
      code: ACP_ERROR_CODES.INVALID_PARAMS,
      message: "Unknown or missing sessionId.",
    });
    return;
  }

  if (params.configId === "mode") {
    if (!isAllowedMode(params.value)) {
      sendResponse(id, undefined, {
        code: ACP_ERROR_CODES.INVALID_PARAMS,
        message: `Unsupported mode: ${params.value}`,
      });
      return;
    }
    session.mode = params.value;
    sendModeUpdate(params.sessionId, session);
  } else if (params.configId === "model") {
    const models = await getAvailableModels(config, session.model);
    if (!models.includes(params.value)) {
      sendResponse(id, undefined, {
        code: ACP_ERROR_CODES.INVALID_PARAMS,
        message: `Unsupported model: ${params.value}`,
      });
      return;
    }
    session.model = params.value;
  } else {
    sendResponse(id, undefined, {
      code: ACP_ERROR_CODES.INVALID_PARAMS,
      message: `Unsupported config option: ${params.configId}`,
    });
    return;
  }

  const configOptions = await buildConfigOptions(config, session);
  sendNotification(ACP_METHODS.SESSION_UPDATE, {
    sessionId: params.sessionId,
    update: { sessionUpdate: "config_option_update", configOptions },
  });
  sendResponse(id, { configOptions });
}

async function handleSetMode(
  id: number | string,
  params: ACPSetModeParams,
  config: ConfigManager,
) {
  const session = params?.sessionId
    ? sessions.get(params.sessionId)
    : undefined;
  if (!session) {
    sendResponse(id, undefined, {
      code: ACP_ERROR_CODES.INVALID_PARAMS,
      message: "Unknown or missing sessionId.",
    });
    return;
  }
  if (!isAllowedMode(params.modeId)) {
    sendResponse(id, undefined, {
      code: ACP_ERROR_CODES.INVALID_PARAMS,
      message: `Unsupported mode: ${params.modeId}`,
    });
    return;
  }

  session.mode = params.modeId;
  sendModeUpdate(params.sessionId, session);
  const configOptions = await buildConfigOptions(config, session);
  sendNotification(ACP_METHODS.SESSION_UPDATE, {
    sessionId: params.sessionId,
    update: { sessionUpdate: "config_option_update", configOptions },
  });
  sendResponse(id, {});
}

function getDefaultModel(config: ConfigManager): string {
  const useEconomy = config.getCostMode() === "economy";
  return config.getModel(useEconomy);
}

async function getAvailableModels(
  config: ConfigManager,
  currentModel: string,
): Promise<string[]> {
  const fallbackValues = [
    currentModel,
    config.getModel(false),
    config.getModel(true),
    config.getEconomyModel(),
    config.getPlanningModel(),
    config.getExecutionModel(),
  ].filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );
  const fallback = Array.from(new Set(fallbackValues));
  const apiKey = config.getApiKey();
  const baseUrl = config.getBaseUrl();
  if (!apiKey || !baseUrl) return Promise.resolve(fallback);

  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const cacheKey = `${normalizedBase}::${apiKey}`;
  const now = Date.now();
  const cached = modelCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < MODEL_CACHE_TTL_MS) {
    return Promise.resolve(mergeModelLists(cached.models, fallback));
  }

  const inflight = cached?.inflight ?? fetchModelsFromEndpoint(normalizedBase, apiKey);
  modelCache.set(cacheKey, {
    fetchedAt: cached?.fetchedAt ?? 0,
    models: cached?.models ?? [],
    inflight,
  });

  return (async () => {
    try {
      const models = await inflight;
      modelCache.set(cacheKey, {
        fetchedAt: Date.now(),
        models,
      });
      return mergeModelLists(models, fallback);
    } catch {
      if (cached?.models?.length) {
        return mergeModelLists(cached.models, fallback);
      }
      return fallback;
    }
  })();
}

// Synchronous fallback-only model list (no network)
function getAvailableModelsSync(config: ConfigManager, currentModel: string): string[] {
  const values = [
    currentModel,
    config.getModel(false),
    config.getModel(true),
    config.getEconomyModel(),
    config.getPlanningModel(),
    config.getExecutionModel(),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return Array.from(new Set(values));
}

function buildConfigOptionsSync(
  config: ConfigManager,
  session: ACPSessionState,
): ACPSessionConfigOption[] {
  const models = getAvailableModelsSync(config, session.model);
  return [
    {
      id: "mode",
      name: "Mode",
      description: "Controls how XibeCode plans, reviews, or edits code.",
      category: "mode",
      type: "select",
      currentValue: session.mode,
      options: buildModeState(session).availableModes.map((mode) => ({
        value: mode.id,
        name: mode.name,
        description: mode.description,
      })),
    },
    {
      id: "model",
      name: "Model",
      description: "LLM model used for this XibeCode session.",
      category: "model",
      type: "select",
      currentValue: session.model,
      options: models.map((model) => ({ value: model, name: model })),
    },
  ];
}

async function buildConfigOptions(
  config: ConfigManager,
  session: ACPSessionState,
): Promise<ACPSessionConfigOption[]> {
  const availableModels = await getAvailableModels(config, session.model);
  return [
    {
      id: "mode",
      name: "Mode",
      description: "Controls how XibeCode plans, reviews, or edits code.",
      category: "mode",
      type: "select",
      currentValue: session.mode,
      options: buildModeState(session).availableModes.map((mode) => ({
        value: mode.id,
        name: mode.name,
        description: mode.description,
      })),
    },
    {
      id: "model",
      name: "Model",
      description: "LLM model used for this XibeCode session.",
      category: "model",
      type: "select",
      currentValue: session.model,
      options: availableModels.map((model) => ({
        value: model,
        name: model,
      })),
    },
  ];
}

async function fetchModelsFromEndpoint(
  normalizedBase: string,
  apiKey: string,
): Promise<string[]> {
  const res = await fetch(`${normalizedBase}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`GET /models failed (${res.status})`);

  const payload = (await res.json()) as { data?: unknown };
  if (!Array.isArray(payload.data)) return [];
  const models = payload.data
    .map((entry: unknown) => {
      if (typeof entry !== "object" || entry === null) return "";
      const record = entry as { id?: unknown };
      return typeof record.id === "string" ? record.id.trim() : "";
    })
    .filter((model) => model.length > 0);
  return Array.from(new Set(models));
}

function mergeModelLists(primary: string[], fallback: string[]): string[] {
  return Array.from(new Set([...primary, ...fallback]));
}

function buildModeState(session: ACPSessionState): ACPSessionModeState {
  return {
    currentModeId: session.mode,
    availableModes: ENABLED_MODES.map((mode) => ({
      id: mode,
      name: MODE_CONFIG[mode].name,
      description: MODE_CONFIG[mode].description,
    })),
  };
}

function isAllowedMode(value: string): value is AgentMode {
  return (ENABLED_MODES as readonly string[]).includes(value);
}

function sendModeUpdate(sessionId: string, session: ACPSessionState) {
  sendNotification(ACP_METHODS.SESSION_UPDATE, {
    sessionId,
    update: {
      sessionUpdate: "current_mode_update",
      currentModeId: session.mode,
      modeId: session.mode,
    },
  });
}

function sendAvailableCommandsUpdate(sessionId: string) {
  sendNotification(ACP_METHODS.SESSION_UPDATE, {
    sessionId,
    update: {
      sessionUpdate: "available_commands_update",
      availableCommands: [
        {
          name: "setup",
          description: "Guided setup (provider, base URL, API key, model)",
          input: { hint: "type /setup to start" },
        },
      ],
    },
  });
}

async function extractPromptText(
  prompt: ACPSessionPromptParams["prompt"],
  cwd: string,
  hooks?: {
    onResourceReadStart?: (toolCallId: string, path: string) => void;
    onResourceReadEnd?: (
      toolCallId: string,
      path: string,
      text: string,
      success: boolean,
    ) => void;
  },
): Promise<string> {
  if (!Array.isArray(prompt)) return "";
  const chunks: string[] = [];

  for (const block of prompt) {
    if (block && block.type === "text" && typeof block.text === "string") {
      chunks.push(block.text);
      continue;
    }

    if (block && block.type === "resource") {
      const resource = (
        block as { resource?: { uri?: unknown; text?: unknown } }
      ).resource;
      if (typeof resource?.text === "string") {
        chunks.push(formatEmbeddedResourceText(resource.uri, resource.text));
      }
      continue;
    }

    if (block && block.type === "resource_link") {
      const uri = (block as { uri?: unknown }).uri;
      const name =
        (block as { name?: unknown; title?: unknown }).name ??
        (block as { title?: unknown }).title;
      const path = resolveResourceLinkPath(uri, cwd);
      const toolCallId = makeToolCallId("read_file", Date.now());
      if (path) hooks?.onResourceReadStart?.(toolCallId, path);
      const linked = await readResourceLinkText(uri, cwd)
        .then(({ path: readPath, text }) => {
          hooks?.onResourceReadEnd?.(toolCallId, readPath, text, true);
          return formatEmbeddedResourceText(readPath, text);
        })
        .catch((error: unknown) => {
          const label =
            typeof name === "string" ? name : String(uri ?? "resource");
          const message =
            error instanceof Error ? error.message : String(error);
          if (path)
            hooks?.onResourceReadEnd?.(toolCallId, path, message, false);
          return `[Referenced resource ${label} could not be read: ${message}]`;
        });
      if (linked) chunks.push(linked);
    }
  }

  return chunks.filter(Boolean).join("\n");
}

function formatEmbeddedResourceText(uri: unknown, text: string): string {
  const label = typeof uri === "string" ? uri : "embedded resource";
  const maxChars = 30000;
  const clipped =
    text.length > maxChars
      ? `${text.slice(0, maxChars)}\n\n[File content truncated after ${maxChars} characters for responsiveness.]`
      : text;
  return `\n\n---\nReferenced file: ${label}\n\n${clipped}\n---`;
}

function resolveResourceLinkPath(
  uri: unknown,
  cwd: string,
): string | undefined {
  if (typeof uri !== "string" || uri.trim().length === 0) return undefined;
  if (uri.startsWith("file://")) return fileURLToPath(uri);
  if (uri.startsWith("/")) return uri;
  return resolvePath(cwd, uri);
}

async function readResourceLinkText(
  uri: unknown,
  cwd: string,
): Promise<{ path: string; text: string }> {
  const path = resolveResourceLinkPath(uri, cwd);
  if (!path) throw new Error("Missing resource URI");
  const text = await readFile(path, "utf8");
  return { path, text };
}

function makeToolCallId(name: string, index: number): string {
  return `tool_${index}_${name.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function getReadableAction(name: string): string {
  switch (name) {
    case "read_file":
      return "Reading file";
    case "write_file":
      return "Writing file";
    case "edit_file":
      return "Editing file";
    case "delete_path":
      return "Deleting file";
    case "move_path":
      return "Moving file";
    case "list_directory":
      return "Listing directory";
    case "grep":
    case "find_path":
      return "Searching";
    case "terminal":
      return "Executing";
    case "fetch":
      return "Fetching URL";
    default:
      return name;
  }
}

function buildToolCallUpdate(params: {
  sessionUpdate: "tool_call" | "tool_call_update";
  toolCallId: string;
  cwd: string;
  name: string;
  input: unknown;
  status: "pending" | "in_progress";
}) {
  const readableAction = getReadableAction(params.name);
  const statusText =
    params.status === "pending"
      ? "Queued"
      : params.status === "in_progress"
        ? "In progress"
        : "Completed";

  return {
    sessionUpdate: params.sessionUpdate,
    toolCallId: params.toolCallId,
    title: formatToolTitle(params.name, params.input),
    kind: getToolKind(params.name),
    status: params.status,
    readableAction,
    rawInput: params.input ?? {},
    locations:
      typeof params.input === "object" && params.input !== null
        ? Array.isArray(params.input)
          ? // for array inputs
            []
          : // for object inputs - extract paths
            "path" in params.input && typeof params.input.path === "string"
            ? [params.input.path]
            : ["unknown"]
        : ["unknown"],
    content: [
      {
        type: "content",
        content: {
          type: "text",
          text: `${readableAction}: ${statusText}`,
        },
      },
    ],
  };
}

function buildToolCallResultUpdate(params: {
  sessionUpdate: "tool_call_update";
  toolCallId: string;
  cwd: string;
  name: string;
  input: unknown;
  result: unknown;
  success: boolean;
}) {
  const resultContent =
    params.success && typeof params.result === "string"
      ? params.result
      : typeof params.result === "object" && params.result !== null
        ? "content" in params.result
          ? String(params.result.content)
          : undefined
        : undefined;

  const locations =
    typeof params.result === "object" && params.result !== null
      ? "path" in params.result && typeof params.result.path === "string"
        ? [params.result.path]
        : ["unknown"]
      : [];

  return {
    sessionUpdate: params.sessionUpdate,
    toolCallId: params.toolCallId,
    title: formatToolTitle(params.name, params.input),
    kind: getToolKind(params.name),
    status: params.success ? "completed" : "failed",
    readableAction: getReadableAction(params.name),
    rawInput: params.input ?? {},
    rawOutput: params.result ?? {},
    locations,
    content: [
      {
        type: "content",
        content: {
          type: "text",
          text: resultContent
            ? resultContent.length > 500
              ? resultContent.slice(0, 500) + "\u2026"
              : resultContent
            : params.name,
        },
      },
    ],
  };
}

function getToolKind(name: string): string {
  if (name === "read_file") return "read";
  if (name === "write_file" || name === "edit_file") return "edit";
  if (name === "delete_path") return "delete";
  if (name === "move_path") return "move";
  if (name === "grep" || name === "list_directory" || name === "find_path")
    return "search";
  if (name === "terminal") return "execute";
  if (name === "fetch") return "fetch";
  return "other";
}

function formatToolTitle(name: string, input: unknown): string {
  const path = extractPathLike(input);
  const label = path ? ` ${path}` : "";
  switch (name) {
    case "read_file":
      return `Read${label}`;
    case "write_file":
      return `Write${label}`;
    case "edit_file":
      return `Edit${label}`;
    case "delete_path":
      return `Delete${label}`;
    case "move_path":
      return `Move${label}`;
    case "list_directory":
      return `List${label}`;
    case "grep":
      return "Search files";
    case "terminal":
      return "Run command";
    default:
      return name;
  }
}

function getToolLocations(
  cwd: string,
  input: unknown,
  result?: unknown,
): Array<{ path: string; line?: number }> {
  const paths = new Set<string>();
  for (const value of [extractPathLike(input), extractPathLike(result)]) {
    if (value)
      paths.add(value.startsWith("/") ? value : resolvePath(cwd, value));
  }
  return Array.from(paths).map((path) => ({ path }));
}

function extractPathLike(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of [
    "path",
    "file",
    "filePath",
    "source_path",
    "destination_path",
  ]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return undefined;
}

function summarizeToolResult(
  name: string,
  result: unknown,
  success: boolean,
): string {
  if (!success) return `${name} failed: ${safeStringify(result, 1200)}`;
  if (typeof result === "string") return truncate(result, 2000);
  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    if (typeof record.content === "string")
      return truncate(record.content, 2000);
    if (typeof record.output === "string") return truncate(record.output, 2000);
    if (typeof record.message === "string")
      return truncate(record.message, 2000);
  }
  return `${name} completed successfully.`;
}

function safeStringify(value: unknown, max: number): string {
  try {
    return truncate(JSON.stringify(value), max);
  } catch {
    return truncate(String(value), max);
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

async function runAgentTurn(args: {
  prompt: string;
  workspaceRoot: string;
  conversationId: string;
  config: ConfigManager;
  model?: string;
  mode?: AgentMode;
  onText: (text: string) => void;
  onThinking?: (message: string) => void;
  onToolStart?: (toolCallId: string, name: string, input: unknown) => void;
  onToolProgress?: (toolCallId: string, name: string, input: unknown) => void;
  onToolEnd?: (
    toolCallId: string,
    name: string,
    input: unknown,
    result: unknown,
    success: boolean,
  ) => void;
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

    const model = args.model || args.config.getModel(false);
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
    const preloadKey = `${args.workspaceRoot}::${apiKey}::${model}`;
    const preload = skillLoadPromises.get(preloadKey);
    const skillLoadPromise =
      preload ??
      skillManager.loadSkills().catch(() => {
        // non-critical
      });
    if (!preload) {
      skillLoadPromises.set(preloadKey, skillLoadPromise);
    }

    const session = sessions.get(args.conversationId);
    let mcpClientManager = session?.mcpClientManager;
    if (!mcpClientManager) {
      mcpClientManager = new MCPClientManager();
      if (session) {
        session.mcpClientManager = mcpClientManager;
      }
    }

    if (!session?.mcpConnectPromise) {
      const connectPromise = (async () => {
        try {
          const mcpServers = await args.config.getMCPServers();
          if (Object.keys(mcpServers).length > 0) {
            await mcpClientManager.connectAll(mcpServers, { retries: 1, backoffMs: 750 });
          }
        } catch {
          // non-critical
        }
      })();
      if (session) {
        session.mcpConnectPromise = connectPromise;
      }
    }

    const memory = new NeuralMemory(args.workspaceRoot);
    const memoryInitPromise = memory.init().catch(() => {});

    const sessionMemory = new SessionMemory(args.workspaceRoot);
    const sessionMemoryPromise = sessionMemory
      .loadPreviousLearnings()
      .catch(() => {});

    await withTimeout(
      Promise.all([memoryInitPromise, sessionMemoryPromise]),
      250,
      undefined,
      "memory warmup",
    );

    const defaultSkillsPromise = (async () => {
      await skillLoadPromise;
      return skillManager.buildDefaultSkillsPromptForTask(
        args.prompt,
        args.workspaceRoot,
      );
    })();
    const defaultSkillsPrompt = await withTimeout(
      defaultSkillsPromise,
      350,
      "",
      "skills prompt",
    );

    const toolExecutor = new CodingToolExecutor(args.workspaceRoot, {
      mcpClientManager,
      skillManager,
      memory,
      onDangerousApproval: createAcpApprovalHandler(
        args.conversationId || "default",
      ),
    });

    const agent = new EnhancedAgent(
      {
        apiKey,
        baseUrl,
        model,
        maxIterations: 0,
        verbose: false,
        mode: args.mode || "agent",
        provider,
        requestFormat: "auto",
        defaultSkillsPrompt,
        sessionMemory,
        // Same harness defaults as CLI run / gateway (Claude-style)
        completionEvidenceMode: "balanced",
        postEditVerification: "balanced",
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
    let toolSequence = 0;
    const toolInputs = new Map<string, unknown>();
    const toolIdsByIndex = new Map<number, string>();
    const toolIdQueueByName = new Map<string, string[]>();
    await stream.onEvent((event) => {
      switch (event.type) {
        case "text_delta":
          fullContent += event.text;
          args.onText(event.text);
          break;
        case "thinking":
          args.onThinking?.(event.message);
          break;
        case "tool_call_start": {
          const toolCallId = makeToolCallId(event.name, ++toolSequence);
          toolInputs.set(toolCallId, event.input);
          toolIdsByIndex.set(event.index, toolCallId);
          const queue = toolIdQueueByName.get(event.name) ?? [];
          queue.push(toolCallId);
          toolIdQueueByName.set(event.name, queue);
          args.onToolStart?.(toolCallId, event.name, event.input);
          args.onToolProgress?.(toolCallId, event.name, event.input);
          break;
        }
        case "tool_call_end": {
          const queue = toolIdQueueByName.get(event.name) ?? [];
          const toolCallId =
            toolIdsByIndex.get(event.index) ??
            queue.shift() ??
            makeToolCallId(event.name, ++toolSequence);
          const input = toolInputs.get(toolCallId);
          args.onToolEnd?.(
            toolCallId,
            event.name,
            input,
            event.result,
            event.success,
          );
          toolInputs.delete(toolCallId);
          toolIdsByIndex.delete(event.index);
          if (queue.length) toolIdQueueByName.set(event.name, queue);
          else toolIdQueueByName.delete(event.name);
          break;
        }
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
    const chatSession =
      chatSessions.get(conversationId) ?? {
        cwd: workspaceRoot,
        mode: "agent",
        model: getDefaultModel(config),
        setup: { step: "idle" },
      };
    // Always store the session in the map so we reuse it
    chatSessions.set(conversationId, chatSession);

    let mcpClientManager = chatSession.mcpClientManager;
    if (!mcpClientManager) {
      mcpClientManager = new MCPClientManager();
      chatSession.mcpClientManager = mcpClientManager;
      chatSession.mcpConnectPromise = (async () => {
        try {
          const mcpServers = await config.getMCPServers();
          if (Object.keys(mcpServers).length > 0) {
            await mcpClientManager!.connectAll(mcpServers, { retries: 1, backoffMs: 750 });
          }
        } catch (err) {
          console.error("[acp] Failed to connect MCP servers in background for chat:", err);
        }
      })();
    }
    const setupMessages: string[] = [];
    const handledSetup = await handleSetupFlow({
      input: userMessage,
      session: chatSession,
      config,
      sendText: (text) => {
        setupMessages.push(text);
        sendNotification(ACP_METHODS.CHAT_DELTA, {
          content: text.endsWith("\n") ? text : `${text}\n`,
          conversationId,
        });
      },
    });
    if (handledSetup) {
      chatSessions.set(conversationId, chatSession);
      const finalDelta: ACPChatDeltaParams = {
        content: "",
        done: true,
        conversationId,
      };
      sendNotification(ACP_METHODS.CHAT_DELTA, finalDelta);
      const result: ACPChatResult = {
        content: setupMessages.join("\n"),
        conversationId,
      };
      sendResponse(id, result);
      return;
    }

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
    const preloadKey = `${workspaceRoot}::${apiKey}::${model}`;
    const preload = skillLoadPromises.get(preloadKey);
    const skillLoadPromise =
      preload ??
      skillManager.loadSkills().catch(() => {
        // non-critical
      });
    if (!preload) {
      skillLoadPromises.set(preloadKey, skillLoadPromise);
    }

    const memory = new NeuralMemory(workspaceRoot);
    const memoryInitPromise = memory.init().catch(() => {});

    const sessionMemory = new SessionMemory(workspaceRoot);
    const sessionMemoryPromise = sessionMemory
      .loadPreviousLearnings()
      .catch(() => {});

    await withTimeout(
      Promise.all([memoryInitPromise, sessionMemoryPromise]),
      250,
      undefined,
      "memory warmup",
    );

    const defaultSkillsPromise = (async () => {
      await skillLoadPromise;
      return skillManager.buildDefaultSkillsPromptForTask(
        userMessage,
        workspaceRoot,
      );
    })();
    const defaultSkillsPrompt = await withTimeout(
      defaultSkillsPromise,
      350,
      "",
      "skills prompt",
    );

    const toolExecutor = new CodingToolExecutor(workspaceRoot, {
      mcpClientManager,
      skillManager,
      memory,
      onDangerousApproval: createAcpApprovalHandler("chat"),
    });

    const agent = new EnhancedAgent(
      {
        apiKey,
        baseUrl,
        model,
        maxIterations: 0,
        verbose: false,
        provider: provider,
        requestFormat: "auto",
        defaultSkillsPrompt,
        sessionMemory,
        completionEvidenceMode: "balanced",
        postEditVerification: "balanced",
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
