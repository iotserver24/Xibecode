import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRequire } from 'module';
import { spawn } from 'child_process';
import TextInput from 'ink-text-input';
import { Box, Static, Text, createRoot, useApp, useInput } from '../ink.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { TuiThemeColorKey } from '../utils/tui-theme.js';
import { ConfigManager, ProviderType, PROVIDER_CONFIGS } from '../utils/config.js';
import { EnhancedAgent } from 'xibecode-core';

const pkg = createRequire(import.meta.url)('../../package.json');
import { CodingToolExecutor, NeuralMemory } from 'xibecode-core';
import { MCPClientManager } from 'xibecode-core';
import { SkillManager } from 'xibecode-core';
import { builtInSkillsDir } from '../utils/built-in-skills-dir.js';
import { AgentMode, ENABLED_MODES, MODE_CONFIG, type ParsedQuestion } from 'xibecode-core';
import { renderAndRun } from '../interactiveHelpers.js';
import { AssistantMarkdown } from '../components/AssistantMarkdown.js';
import { formatToolArgs, formatToolOutcome, formatRunSwarmDetailLines } from '../utils/tool-display.js';
import { SPINNER_VERBS } from '../constants/spinnerVerbs.js';
import { collectImageReferencesForPrompt } from 'xibecode-core';
import { loadImageAttachment, mimeFromExtension, type ImageAttachment } from '../utils/image-attachments.js';
import { SessionManager, type ChatSession } from 'xibecode-core';
import { AutoMemoryManager, HooksManager, SettingsManager as CoreSettingsManager } from 'xibecode-core';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { cloudPullCommand } from '../commands/cloud-pull.js';
import { listWorkspaceFiles, type FileEntry } from '../utils/list-files.js';
import {
  attachRemoteExecution,
  codingToolExecutorRemoteOptions,
  getRuntimeStatusLabel,
  remoteToolSandboxIdForAgent,
  remoteToolWorkspaceRootForAgent,
  resolveRemoteExecutionConfig,
} from '../utils/remote-execution.js';
import { syncWorkspaceToSandbox } from '../utils/sandbox-sync.js';
import { withCloudWorkspaceSyncSpinner } from '../utils/cloud-sync-feedback.js';
import { getCloudRuntimeHint } from '../utils/cloud-runtime-hints.js';

export type ChatOptions = {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  provider?: string;
  costMode?: string;
  noWebui?: boolean;
  profile?: string;
  sessionId?: string;
  initialMessages?: Array<{ role: string; content: string | Array<any> }>;
  /** When true, force local sandbox mode for this run (e.g. host `resume` should not inherit global e2b). */
  forceLocalRuntime?: boolean;
};

function isAbortLikeError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as any;
  return (
    anyErr.name === 'AbortError' ||
    anyErr.type === 'aborted' ||
    String(anyErr.message || '').toLowerCase().includes('aborted')
  );
}

async function runCommandCapture(
  command: string,
  args: string[],
  cwd: string = process.cwd(),
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      stderr += error.message;
      resolve({ code: 1, stdout, stderr });
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

function buildAutoCommitMessage(stagedFiles: string[], shortstat: string): string {
  const docsOnly = stagedFiles.length > 0
    && stagedFiles.every((file) =>
      /\.(md|mdx|txt|rst)$/i.test(file) || file.toLowerCase().includes('docs'),
    );
  const type = docsOnly ? 'docs' : 'chore';
  if (stagedFiles.length === 1) {
    return `${type}: update ${stagedFiles[0]}`;
  }
  if (stagedFiles.length === 0) {
    return `${type}: update project files`;
  }
  const stat = shortstat.trim();
  return `${type}: update ${stagedFiles.length} files${stat ? ` (${stat})` : ''}`;
}

type UiLineType = 'user' | 'assistant' | 'tool' | 'tool_out' | 'info' | 'error';
type UiLine = { type: UiLineType; text: string };
type StaticItem =
  | { kind: 'hero'; id: number }
  | ({ kind: 'line'; id: number } & UiLine);

function summarizeToolResultContent(content: unknown): string {
  const raw = typeof content === 'string' ? content : JSON.stringify(content ?? '');
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      if (typeof record.path === 'string') {
        const details = [
          typeof record.lines === 'number' ? `${record.lines} lines` : null,
          typeof record.count === 'number' ? `${record.count} entries` : null,
          typeof record.total === 'number' ? `${record.total} result(s)` : null,
        ].filter(Boolean).join(', ');
        return details ? `${record.path} (${details})` : record.path;
      }
      if (typeof record.message === 'string') return record.message;
      if (typeof record.stdout === 'string') return record.stdout.slice(0, 300);
    }
  } catch {
    // Fall through to plain text summary.
  }
  return raw.replace(/\s+/g, ' ').trim().slice(0, 300);
}

function transcriptLinesFromMessage(message: MessageParam): UiLine[] {
  if (typeof message.content === 'string') {
    const text = message.content.trim();
    return text ? [{ type: message.role === 'assistant' ? 'assistant' : 'user', text }] : [];
  }

  if (!Array.isArray(message.content)) return [];

  const lines: UiLine[] = [];
  for (const block of message.content as any[]) {
    if (block?.type === 'text') {
      const text = String(block.text || '').trim();
      if (text) lines.push({ type: message.role === 'assistant' ? 'assistant' : 'user', text });
      continue;
    }
    if (block?.type === 'tool_use') {
      const name = String(block.name || 'tool');
      lines.push({ type: 'tool', text: `${name}${block.input ? ` — ${formatToolArgs(name, block.input)}` : ''}` });
      continue;
    }
    if (block?.type === 'tool_result') {
      lines.push({
        type: 'tool_out',
        text: `tool_result: ${summarizeToolResultContent(block.content)}`,
      });
    }
  }
  return lines;
}
const APP_VERSION = pkg.version;
const HERO_LOGO = [
  '██╗  ██╗██╗██████╗ ███████╗',
  '╚██╗██╔╝██║██╔══██╗██╔════╝',
  ' ╚███╔╝ ██║██████╔╝█████╗  ',
  ' ██╔██╗ ██║██╔══██╗██╔══╝  ',
  '██╔╝ ██╗██║██████╔╝███████╗',
  '╚═╝  ╚═╝╚═╝╚═════╝ ╚══════╝',
  ' ██████╗ ██████╗ ██████╗ ███████╗',
  '██╔════╝██╔═══██╗██╔══██╗██╔════╝',
  '██║     ██║   ██║██║  ██║█████╗  ',
  '██║     ██║   ██║██║  ██║██╔══╝  ',
  '╚██████╗╚██████╔╝██████╔╝███████╗',
  ' ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝',
];
/** Terminal-friendly spinner frames (Braille) — cycles while the agent is busy */
const WORK_SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

/** How fast to advance OpenClaude-style spinner verbs (ms) */
const WORK_VERB_ROTATE_MS = 2400;

const QUICK_HELP = ['/help', '/mode', '/format', '/model', '/setup', '/config', '/memory', '/hooks', '/cpull', '/commit', '/donate', '/sponsor', '/clear', '/exit'];
const CHAT_COMMANDS: Array<{ name: string; description: string }> = [
  { name: '/help', description: 'Show available shortcuts and usage hints' },
  { name: '/mode', description: 'Switch agent mode from an interactive picker' },
  { name: '/clear', description: 'Clear the current chat transcript' },
  { name: '/format', description: 'Switch wire format: auto | anthropic | openai' },
  { name: '/model', description: 'Fetch and switch available models for this provider' },
  { name: '/setup', description: 'Guided setup (set API key, then pick provider/model)' },
  { name: '/config', description: 'Show current config and quick config hints' },
  { name: '/memory', description: 'Show auto-memories for this project' },
  { name: '/hooks', description: 'Show registered lifecycle hooks' },
  { name: '/cpull', description: 'Pull sandbox workspace; /cpull --apply merges only new/changed files (use --full to replace all)' },
  { name: '/commit', description: 'Stage all changes and commit (auto message or custom text)' },
  { name: '/donate', description: 'Open the donation page in your browser' },
  { name: '/sponsor', description: 'Open the sponsorship page in your browser' },
  { name: '/exit', description: 'Exit the interactive chat session' },
];

export type RequestWireFormat = 'auto' | 'openai' | 'anthropic';

function isAnthropicWireFormat(
  requestFormat: RequestWireFormat,
  provider: ProviderType | undefined,
  customProviderFormat: 'openai' | 'anthropic' | undefined,
): boolean {
  if (requestFormat === 'anthropic') return true;
  if (requestFormat === 'openai') return false;
  if (provider === 'custom') {
    return customProviderFormat === 'anthropic';
  }
  if (provider) {
    return (
      PROVIDER_CONFIGS[provider as keyof typeof PROVIDER_CONFIGS]?.format ===
      'anthropic'
    );
  }
  return false;
}

function computeWindowStart(total: number, selected: number, windowSize: number): number {
  if (total <= windowSize) return 0;
  const clampedSelected = Math.max(0, Math.min(selected, total - 1));
  const maxStart = total - windowSize;
  const start = clampedSelected - Math.floor(windowSize / 2);
  return Math.max(0, Math.min(start, maxStart));
}

function lineColorKey(type: UiLineType): TuiThemeColorKey {
  switch (type) {
    case 'user':
      return 'briefLabelYou';
    case 'assistant':
      return 'text';
    case 'tool':
      return 'professionalBlue';
    case 'tool_out':
      return 'subtle';
    case 'error':
      return 'error';
    case 'info':
    default:
      return 'subtle';
  }
}

function prefixForType(type: UiLineType): string {
  switch (type) {
    case 'user':
      return 'You';
    case 'assistant':
      return 'XibeCode';
    case 'tool':
      return 'Tool';
    case 'tool_out':
      return 'Result';
    case 'error':
      return 'Error';
    case 'info':
    default:
      return 'Info';
  }
}

function prefixColorKey(type: UiLineType): TuiThemeColorKey {
  switch (type) {
    case 'user':
      return 'briefLabelYou';
    case 'assistant':
      return 'briefLabelClaude';
    case 'tool':
      return 'suggestion';
    case 'tool_out':
      return 'inactive';
    case 'error':
      return 'error';
    case 'info':
    default:
      return 'inactive';
  }
}

function formatUiLineForLog(line: UiLine): string {
  const prefix = prefixForType(line.type);
  return `[${prefix}] ${line.text}`;
}

function XibeCodeChatApp(props: {
  model: string;
  initialMode: AgentMode;
  provider?: ProviderType;
  runtimeStatus: 'local' | 'cloud';
  sandboxLabel?: string;
  sandboxId?: string;
  previewUrl?: string;
  pullHint?: string;
  baseUrl?: string;
  needsFirstRunSetup?: boolean;
  defaultModel: string;
  modeOptions: Array<{ id: AgentMode; label: string; description: string }>;
  initialRequestFormat: RequestWireFormat;
  customProviderFormat?: 'openai' | 'anthropic';
  profile?: string;
  sessionId?: string;
  initialMessages?: Array<{ role: string; content: string | Array<any> }>;
  runPrompt: (
    prompt: string,
    onLine: (line: UiLine) => void,
    opts?: { images?: ImageAttachment[]; signal?: AbortSignal; onVisibleOutput?: () => void },
  ) => Promise<ReturnType<EnhancedAgent['getStats']>>;
  listBackgroundTasks: () => Promise<
    Array<{ id: string; status: string; startTime: number; prompt: string }>
  >;
  checkBackgroundTask: (taskId: string) => Promise<{ status?: string; lastLine?: string }>;
  onUiLine?: (line: UiLine) => void;
  registerUiSink?: (sink: (line: UiLine) => void) => void;
  registerModeSink?: (sink: (mode: AgentMode) => void) => void;
  registerQuestionsSink?: (sink: (questions: ParsedQuestion[]) => void) => void;
  loadModels: () => Promise<string[]>;
  onModelChange: (nextModel: string) => Promise<void>;
  onModeChange: (nextMode: AgentMode) => Promise<void>;
  onWireFormatChange: (format: RequestWireFormat) => void;
  onSessionCreated?: (sessionId: string) => void;
  onMessagesUpdate?: (messages: MessageParam[]) => void;
  getCurrentMessages?: () => MessageParam[];
  onMemoryCommand?: (subcmd: string, pushLine: (line: UiLine) => void) => void;
  onHooksCommand?: (subcmd: string, pushLine: (line: UiLine) => void) => void;
  onCloudPullCommand?: (argsRaw: string, pushLine: (line: UiLine) => void) => Promise<void>;
  onCommitCommand?: (messageRaw: string, pushLine: (line: UiLine) => void) => Promise<void>;
}) {
  const { exit } = useApp();
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [runElapsedMs, setRunElapsedMs] = useState<number>(0);
  const [wireFormat, setWireFormat] = useState<RequestWireFormat>(props.initialRequestFormat);
  const [activeModel, setActiveModel] = useState(props.model);
  const [activeMode, setActiveMode] = useState<AgentMode>(props.initialMode);
  const [modePickerOpen, setModePickerOpen] = useState(false);
  const [selectedModeIndex, setSelectedModeIndex] = useState(0);
  const [isModelListLoading, setIsModelListLoading] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModelIndex, setSelectedModelIndex] = useState(0);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  type SetupStep = 'idle' | 'pickProvider' | 'baseUrl' | 'apiKey' | 'loadingModels' | 'pickModel';
  const [setupStep, setSetupStep] = useState<SetupStep>('idle');
  const [setupBaseUrl, setSetupBaseUrl] = useState<string>('');
  const [setupApiKey, setSetupApiKey] = useState<string>('');
  const [setupModels, setSetupModels] = useState<string[]>([]);
  const [setupModelPickerOpen, setSetupModelPickerOpen] = useState(false);
  const [setupSelectedModelIndex, setSetupSelectedModelIndex] = useState(0);
  const [setupProviderPickerOpen, setSetupProviderPickerOpen] = useState(false);
  const [setupProviderIndex, setSetupProviderIndex] = useState(0);

  type ConfigMenuItem =
    | 'set_baseurl'
    | 'set_apikey'
    | 'pick_model'
    | 'set_provider'
    | 'set_costmode'
    | 'set_economy_model'
    | 'show'
    | 'close';
  const CONFIG_MENU: Array<{ label: string; value: ConfigMenuItem; description: string }> = [
    { label: 'Set Base URL (OpenAI format)', value: 'set_baseurl', description: 'Example: https://api.openai.com/v1' },
    { label: 'Set API key', value: 'set_apikey', description: 'Bearer token used for /models and chat calls' },
    { label: 'Pick model from /models', value: 'pick_model', description: 'Fetch models from your base URL and select one' },
    { label: 'Set provider', value: 'set_provider', description: 'openai / anthropic / auto-detect' },
    { label: 'Set cost mode', value: 'set_costmode', description: 'normal / economy' },
    { label: 'Set economy model', value: 'set_economy_model', description: 'Model used when cost mode is economy' },
    { label: 'Show config summary', value: 'show', description: 'Print current config status' },
    { label: 'Close', value: 'close', description: 'Return to chat' },
  ];
  const [configMenuOpen, setConfigMenuOpen] = useState(false);
  const [configSelectedIndex, setConfigSelectedIndex] = useState(0);
  type ConfigPrompt =
    | { kind: 'none' }
    | { kind: 'baseUrl' }
    | { kind: 'apiKey' }
    | { kind: 'economyModel' };
  const [configPrompt, setConfigPrompt] = useState<ConfigPrompt>({ kind: 'none' });
  const [configProviderPickerOpen, setConfigProviderPickerOpen] = useState(false);
  const [configProviderIndex, setConfigProviderIndex] = useState(0);
  const [configCostModePickerOpen, setConfigCostModePickerOpen] = useState(false);
  const [configCostModeIndex, setConfigCostModeIndex] = useState(0);

  // File picker state (@-triggered)
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [filteredFileEntries, setFilteredFileEntries] = useState<FileEntry[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [fileQuery, setFileQuery] = useState('');
  const [atPos, setAtPos] = useState(-1);
  const [filePickerLoading, setFilePickerLoading] = useState(false);

  // Interactive questions state for plan mode
  type QuestionsState = {
    questions: ParsedQuestion[];
    currentIndex: number;
    answers: Record<string, string>;
    selectedOptionIndex: number;  // which option row is highlighted by arrows
    isTypingCustom: boolean;      // true when user selected "type yourself"
  } | null;
  const [questionsState, setQuestionsState] = useState<QuestionsState>(null);

  const [workSpinnerFrame, setWorkSpinnerFrame] = useState(0);
  const [workVerbIndex, setWorkVerbIndex] = useState(0);
  const nextLineIdRef = useRef(1);
  const initialMessagesRef = useRef(props.initialMessages);
  const sessionIdRef = useRef(props.sessionId);

  const buildInitialLines = useCallback((): StaticItem[] => {
    const base: StaticItem[] = [
      {
        kind: 'line',
        id: nextLineIdRef.current++,
        type: 'info',
        text: 'XibeCode interactive session. Type /exit to quit, /clear to reset the transcript.',
      },
      { kind: 'line', id: nextLineIdRef.current++, type: 'info', text: 'Type /help for shortcuts.' },
    ];

    if (sessionIdRef.current) {
      const hasHistory = Boolean(initialMessagesRef.current && initialMessagesRef.current.length > 0);
      base.push({
        kind: 'line',
        id: nextLineIdRef.current++,
        type: 'info',
        text: hasHistory
          ? `Resumed session: ${sessionIdRef.current}`
          : `Session: ${sessionIdRef.current}`,
      });
    }

    if (initialMessagesRef.current && initialMessagesRef.current.length > 0) {
      for (const msg of initialMessagesRef.current) {
        for (const line of transcriptLinesFromMessage(msg as MessageParam)) {
          base.push({ kind: 'line', id: nextLineIdRef.current++, ...line });
        }
      }
    }

    return base;
  }, []);

  const [lines, setLines] = useState<StaticItem[]>(buildInitialLines);

  const pushLine = useCallback(
    (line: UiLine) => {
      const withId: StaticItem = { ...line, kind: 'line', id: nextLineIdRef.current++ };
      props.onUiLine?.(line);
      // Keep a much larger in-memory transcript so context doesn't vanish quickly.
      setLines((prev: StaticItem[]) => [...prev.slice(-5000), withId]);
    },
    [props],
  );

  useEffect(() => {
    props.registerUiSink?.(pushLine);
  }, [props, pushLine]);

  useEffect(() => {
    props.registerModeSink?.((nextMode: AgentMode) => {
      setActiveMode(nextMode);
    });
  }, [props]);

  useEffect(() => {
    props.registerQuestionsSink?.((qs: ParsedQuestion[]) => {
      setQuestionsState({ questions: qs, currentIndex: 0, answers: {}, selectedOptionIndex: 0, isTypingCustom: false });
    });
  }, [props]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const abortReasonRef = useRef<'none' | 'user' | 'watchdog'>('none');
  const queuedPromptRef = useRef<string | null>(null);
  const lastVisibleOutputAtRef = useRef<number>(Date.now());
  const currentPromptRef = useRef<string | null>(null);
  const restartAttemptsRef = useRef<number>(0);
  const promptHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const savedInputRef = useRef('');
  const cachedFileEntriesRef = useRef<FileEntry[]>([]);
  const sessionMessagesRef = useRef<MessageParam[]>(
    (props.initialMessages as MessageParam[]) || []
  );

  const lastBgLineByTask = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!isRunning) return;
    let cancelled = false;
    const interval = setInterval(() => {
      void (async () => {
        try {
          const tasks = await props.listBackgroundTasks();
          const running = tasks.filter((t) => t.status === 'running').slice(0, 3);
          if (running.length === 0) return;
          for (const t of running) {
            const status = await props.checkBackgroundTask(t.id);
            const line = status.lastLine?.trim();
            if (!line) continue;
            const prev = lastBgLineByTask.current.get(t.id);
            if (prev === line) continue;
            lastBgLineByTask.current.set(t.id, line);
            if (!cancelled) {
              pushLine({ type: 'tool_out', text: `bg:${t.id} ${line}` });
            }
          }
        } catch {
          // ignore background monitor errors
        }
      })();
    }, 1200);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isRunning, props, pushLine]);

  useEffect(() => {
    if (!isRunning) {
      setWorkSpinnerFrame(0);
      return;
    }
    const id = setInterval(() => {
      setWorkSpinnerFrame((f) => (f + 1) % WORK_SPINNER_FRAMES.length);
    }, 120);
    return () => clearInterval(id);
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => {
      // Silent means: no visible output (tool_call/tool_result/stream_text/response) for 180s.
      // Some models (DeepSeek, etc.) can take a long time for their first token during complex tasks.
      if (Date.now() - lastVisibleOutputAtRef.current > 180_000) {
        if (abortControllerRef.current && abortReasonRef.current === 'none') {
          abortReasonRef.current = 'watchdog';
          pushLine({
            type: 'info',
            text: `No output for 180s — restarting (attempt ${Math.min(restartAttemptsRef.current + 1, 2)}/2)…`,
          });
          abortControllerRef.current.abort();
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [isRunning, pushLine]);

  useEffect(() => {
    if (!isRunning) {
      setRunStartedAt(null);
      setRunElapsedMs(0);
      return;
    }
    const started = Date.now();
    setRunStartedAt(started);
    const id = setInterval(() => {
      setRunElapsedMs(Date.now() - started);
    }, 250);
    return () => clearInterval(id);
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) return;
    setWorkVerbIndex(Math.floor(Math.random() * SPINNER_VERBS.length));
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => {
      setWorkVerbIndex((v) => (v + 1) % SPINNER_VERBS.length);
    }, WORK_VERB_ROTATE_MS);
    return () => clearInterval(id);
  }, [isRunning]);

  // Load workspace file list once on mount for @-picker
  useEffect(() => {
    let cancelled = false;
    setFilePickerLoading(true);
    (async () => {
      try {
        const entries = await listWorkspaceFiles(process.cwd());
        if (!cancelled) {
          cachedFileEntriesRef.current = entries;
        }
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setFilePickerLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Detect '@' in input to open file picker
  useEffect(() => {
    const lastAtIndex = input.lastIndexOf('@');

    if (lastAtIndex === -1) {
      if (filePickerOpen) {
        setFilePickerOpen(false);
        setSelectedFileIndex(0);
      }
      return;
    }

    // '@' must be at a word boundary (preceded by space, '(', or start of string)
    if (lastAtIndex > 0 && input[lastAtIndex - 1] !== ' ' && input[lastAtIndex - 1] !== '(') {
      if (filePickerOpen) {
        setFilePickerOpen(false);
        setSelectedFileIndex(0);
      }
      return;
    }

    // Extract query: everything after '@' up to the next space
    const afterAt = input.slice(lastAtIndex + 1);
    const spaceIdx = afterAt.indexOf(' ');
    const query = spaceIdx === -1 ? afterAt : afterAt.slice(0, spaceIdx);

    setAtPos(lastAtIndex);
    setFileQuery(query);
    setFilePickerOpen(true);

    const lowerQuery = query.toLowerCase();
    const filtered = cachedFileEntriesRef.current.filter(
      (e) => e.relativePath.toLowerCase().includes(lowerQuery),
    );
    setFilteredFileEntries(filtered);
    setSelectedFileIndex((prev) => Math.min(prev, Math.max(0, filtered.length - 1)));
  }, [input]);

  const ensureModelsLoaded = useCallback(async (): Promise<string[]> => {
    if (availableModels.length > 0) {
      return availableModels;
    }
    setIsModelListLoading(true);
    try {
      const models = await props.loadModels();
      setAvailableModels(models);
      return models;
    } finally {
      setIsModelListLoading(false);
    }
  }, [availableModels, props]);

  const printConfigSummary = useCallback(() => {
    const config = new ConfigManager(props.profile);
    const apiKeyPresent = Boolean(config.getApiKey());
    const costMode = config.getCostMode();
    const provider = (config.get('provider') as ProviderType | undefined) ?? undefined;
    const model = config.getModel(costMode === 'economy');
    const baseUrl = config.getBaseUrl();
    const sandboxMode = config.getSandboxMode();
    const sandboxGateway = config.getSandboxGatewayUrl();
    const requestFormat =
      (config.get('requestFormat') as RequestWireFormat | undefined) ?? 'auto';
    pushLine({
      type: 'info',
      text: `Config: apiKey=${apiKeyPresent ? 'set' : 'missing'} | provider=${provider || 'auto'} | model=${model || '(none)'} | costMode=${costMode} | baseUrl=${baseUrl || '(default)'} | format=${requestFormat} | runtime=${sandboxMode}${sandboxGateway ? ` @ ${sandboxGateway}` : ''}`,
    });
  }, [props.profile, pushLine]);

  const requestOpenAIModelsFrom = useCallback(
    async (baseUrl: string, apiKey: string): Promise<string[]> => {
      const normalized = baseUrl.replace(/\/+$/, '');
      const response = await fetch(`${normalized}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error(`GET ${normalized}/models failed (${response.status})`);
      }
      const payload = (await response.json()) as { data?: Array<{ id?: string }> };
      return (payload.data ?? [])
        .map((entry) => entry.id ?? '')
        .filter((id) => id.length > 0);
    },
    [],
  );

  const startSetupWizard = useCallback(() => {
    setSetupStep('pickProvider');
    setSetupBaseUrl('');
    setSetupApiKey('');
    setSetupModels([]);
    setSetupModelPickerOpen(false);
    setSetupSelectedModelIndex(0);
    setSetupProviderPickerOpen(true);
    setSetupProviderIndex(0);
    pushLine({ type: 'info', text: 'Setup started.' });
  }, [pushLine]);

  useEffect(() => {
    if (!props.needsFirstRunSetup) return;
    pushLine({ type: 'info', text: 'No API key configured yet — starting guided setup.' });
    pushLine({ type: 'info', text: 'Tip: paste Base URL first, then API key; models will load automatically.' });
    startSetupWizard();
  }, [props.needsFirstRunSetup, pushLine, startSetupWizard]);

  const beginConfigMenu = useCallback(() => {
    setConfigMenuOpen(true);
    setConfigSelectedIndex(0);
    setConfigPrompt({ kind: 'none' });
    setConfigProviderPickerOpen(false);
    setConfigCostModePickerOpen(false);
    pushLine({ type: 'info', text: 'Config menu open — use ↑/↓ and Enter. Esc closes.' });
  }, [pushLine]);

  const applyModel = useCallback(
    async (nextModel: string) => {
      if (!nextModel) return;
      await props.onModelChange(nextModel);
      setActiveModel(nextModel);
      setModelPickerOpen(false);
      setInput('');
      pushLine({
        type: 'info',
        text: `Model switched to ${nextModel}`,
      });
    },
    [props, pushLine],
  );

  const applyMode = useCallback(
    async (nextMode: AgentMode) => {
      if (!nextMode || nextMode === activeMode) {
        setModePickerOpen(false);
        return;
      }
      await props.onModeChange(nextMode);
      setActiveMode(nextMode);
      setModePickerOpen(false);
      setInput('');
      pushLine({
        type: 'info',
        text: `Mode switched to ${nextMode}`,
      });
    },
    [activeMode, props, pushLine],
  );

  const applyQuestionAnswer = useCallback(
    async (state: NonNullable<QuestionsState>, answer: string) => {
      const { questions, currentIndex, answers } = state;
      const currentQ = questions[currentIndex];
      const newAnswers = { ...answers, [currentQ.id]: answer };
      const nextIndex = currentIndex + 1;

      if (nextIndex < questions.length) {
        // More questions - advance with reset selection
        setQuestionsState({
          questions,
          currentIndex: nextIndex,
          answers: newAnswers,
          selectedOptionIndex: 0,
          isTypingCustom: false,
        });
        setInput('');
        pushLine({ type: 'info', text: `  ${currentIndex + 1}. ${currentQ.question} → ${answer}` });
      } else {
        // All questions answered - submit
        setQuestionsState(null);
        setInput('');
        pushLine({ type: 'info', text: `  ${currentIndex + 1}. ${currentQ.question} → ${answer}` });

        const answersText = questions
          .map((q, i) => `${i + 1}. ${q.question}\n   Answer: ${newAnswers[q.id] || '(skipped)'}`)
          .join('\n');
        pushLine({ type: 'info', text: 'Answers submitted. Continuing...' });

        const answersPrompt = `Here are my answers to your questions:\n\n${answersText}`;
        currentPromptRef.current = answersPrompt;
        abortReasonRef.current = 'none';
        lastVisibleOutputAtRef.current = Date.now();
        abortControllerRef.current = new AbortController();

        pushLine({ type: 'user', text: answersPrompt });
        sessionMessagesRef.current.push({ role: 'user', content: answersPrompt });
        setIsRunning(true);
        try {
          const startedAt = Date.now();
          const stats = await props.runPrompt(answersPrompt, pushLine, {
            signal: abortControllerRef.current.signal,
            onVisibleOutput: () => {
              lastVisibleOutputAtRef.current = Date.now();
            },
          });
          const elapsedMs = Date.now() - startedAt;
          const seconds = (elapsedMs / 1000).toFixed(1);
          pushLine({
            type: 'info',
            text: `Done in ${seconds}s` + (stats.costLabel ? ` · cost ${stats.costLabel}` : ''),
          });
        } finally {
          abortControllerRef.current = null;
          currentPromptRef.current = null;
          setIsRunning(false);
        }
      }
    },
    [props, pushLine],
  );

  // Called from useInput when a question option is selected via arrows+Enter
  const handleQuestionAnswer = useCallback(
    (state: NonNullable<QuestionsState>, answer: string) => {
      applyQuestionAnswer(state, answer);
    },
    [applyQuestionAnswer],
  );

  const onSubmit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;

      // Handle custom-typing mode for questions (Enter after typing custom answer)
      if (questionsState && questionsState.isTypingCustom) {
        await applyQuestionAnswer(questionsState, trimmed);
        return;
      }

      // If questions are active but not in typing mode, ignore (use arrows + Enter)
      if (questionsState) {
        return;
      }

      // If file picker is open, ignore Enter (handled by useInput)
      if (filePickerOpen) {
        return;
      }

      if (isRunning) {
        queuedPromptRef.current = trimmed;
        setInput('');
        pushLine({ type: 'info', text: 'Queued message — will run next.' });
        return;
      }

      const commandMatches = CHAT_COMMANDS.filter((command) =>
        command.name.toLowerCase().startsWith(trimmed.toLowerCase()),
      );
      const exactMatch = CHAT_COMMANDS.some(
        (command) => command.name.toLowerCase() === trimmed.toLowerCase(),
      );
      const resolvedInput =
        trimmed.startsWith('/') && !exactMatch && commandMatches[selectedCommandIndex]
          ? commandMatches[selectedCommandIndex].name
          : trimmed;

      setInput('');

      // Setup wizard input capture
      if (setupStep !== 'idle') {
        const config = new ConfigManager(props.profile);
        if (setupStep === 'baseUrl') {
          if (!trimmed.startsWith('http')) {
            pushLine({ type: 'error', text: 'Base URL must start with http:// or https://' });
            pushLine({
              type: 'info',
              text: 'Setup — enter Base URL (OpenAI format). Example: https://api.openai.com/v1',
            });
            return;
          }
          const nextBase = trimmed.replace(/\/+$/, '');
          setSetupBaseUrl(nextBase);
          config.set('baseUrl', nextBase);
          // If the user hasn't picked a provider explicitly, assume OpenAI-compatible.
          if (!config.get('provider')) {
            config.set('provider', 'openai');
          }
          if (!config.get('requestFormat')) {
            config.set('requestFormat', 'openai');
          }
          pushLine({ type: 'info', text: `Saved base URL: ${nextBase}` });
          setSetupStep('apiKey');
          pushLine({ type: 'info', text: 'Setup 2/3 — enter API key (will be saved locally).' });
          return;
        }
        if (setupStep === 'apiKey') {
          if (trimmed.length < 10) {
            pushLine({ type: 'error', text: 'API key seems too short. Paste the full key.' });
            pushLine({ type: 'info', text: 'Setup 2/3 — enter API key.' });
            return;
          }
          setSetupApiKey(trimmed);
          config.set('apiKey', trimmed);
          pushLine({ type: 'info', text: 'API key saved.' });
          setSetupStep('loadingModels');
          pushLine({ type: 'info', text: 'Setup 3/3 — fetching models from /models…' });
          try {
            const models = await requestOpenAIModelsFrom(setupBaseUrl || config.getBaseUrl() || '', trimmed);
            const unique = Array.from(new Set(models)).sort();
            if (unique.length === 0) {
              throw new Error('No models returned from /models');
            }
            setSetupModels(unique);
            setSetupModelPickerOpen(true);
            setSetupSelectedModelIndex(0);
            setSetupStep('pickModel');
            pushLine({
              type: 'info',
              text: `Loaded ${unique.length} model(s). Pick one with ↑/↓ and Enter.`,
            });
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to fetch models';
            pushLine({ type: 'error', text: message });
            pushLine({
              type: 'info',
              text: 'Type /setup to restart setup.',
            });
            setSetupStep('idle');
          }
          return;
        }
      }

      // Config prompts capture (single-field edits)
      if (configPrompt.kind !== 'none') {
        const config = new ConfigManager(props.profile);
        if (configPrompt.kind === 'baseUrl') {
          if (!trimmed.startsWith('http')) {
            pushLine({ type: 'error', text: 'Base URL must start with http:// or https://' });
            return;
          }
          const nextBase = trimmed.replace(/\/+$/, '');
          config.set('baseUrl', nextBase);
          pushLine({ type: 'info', text: `Saved base URL: ${nextBase}` });
          setConfigPrompt({ kind: 'none' });
          return;
        }
        if (configPrompt.kind === 'apiKey') {
          if (trimmed.length < 10) {
            pushLine({ type: 'error', text: 'API key seems too short.' });
            return;
          }
          config.set('apiKey', trimmed);
          pushLine({ type: 'info', text: 'API key saved.' });
          setConfigPrompt({ kind: 'none' });
          return;
        }
        if (configPrompt.kind === 'economyModel') {
          config.set('economyModel', trimmed);
          pushLine({ type: 'info', text: `Economy model set to: ${trimmed}` });
          setConfigPrompt({ kind: 'none' });
          return;
        }
      }

      if (resolvedInput === '/exit') {
        props.onMessagesUpdate?.(props.getCurrentMessages?.() ?? sessionMessagesRef.current);
        exit();
        return;
      }

      if (resolvedInput === '/clear') {
        pushLine({ type: 'info', text: '──────────── transcript cleared ────────────' });
        return;
      }

      if (resolvedInput === '/help') {
        setLines((prev: StaticItem[]) => [
          ...prev,
          {
            kind: 'line',
            id: nextLineIdRef.current++,
            type: 'info',
            text: `Shortcuts: ${QUICK_HELP.join(' · ')}`,
          },
          {
            kind: 'line',
            id: nextLineIdRef.current++,
            type: 'info',
            text: 'Press Ctrl+C to quit. Type any prompt and XibeCode will run agent mode.',
          },
          {
            kind: 'line',
            id: nextLineIdRef.current++,
            type: 'info',
            text: 'Vision: mention an image path (e.g. boot.jpg or assets/photo.png) or use @path so the model receives pixels (when a matching file exists).',
          },
        ]);
        return;
      }

      if (resolvedInput === '/donate' || resolvedInput === '/sponsor') {
        const url = 'https://ai.xibebase.in';
        try {
          const open = (await import('open')).default;
          await open(url);
          pushLine({ type: 'info', text: `Opened: ${url}` });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          pushLine({ type: 'error', text: `Failed to open browser: ${message}` });
          pushLine({ type: 'info', text: `You can open it manually: ${url}` });
        }
        return;
      }

      if (resolvedInput === '/config') {
        beginConfigMenu();
        return;
      }

      if (resolvedInput === '/setup') {
        startSetupWizard();
        return;
      }

      if (resolvedInput === '/memory' || resolvedInput.startsWith('/memory ')) {
        const subcmd = resolvedInput.replace('/memory', '').trim().toLowerCase();
        props.onMemoryCommand?.(subcmd || 'list', pushLine);
        return;
      }

      if (resolvedInput === '/hooks' || resolvedInput.startsWith('/hooks ')) {
        const subcmd = resolvedInput.replace('/hooks', '').trim().toLowerCase();
        props.onHooksCommand?.(subcmd || 'list', pushLine);
        return;
      }

      if (resolvedInput === '/cpull' || resolvedInput.startsWith('/cpull ')) {
        if (!props.onCloudPullCommand) {
          pushLine({
            type: 'error',
            text: '/cpull is only available for cloud sandbox_full sessions.',
          });
          return;
        }
        const argsRaw = resolvedInput.replace(/^\/cpull\s*/i, '').trim();
        try {
          await props.onCloudPullCommand(argsRaw, pushLine);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : 'Failed to pull cloud workspace';
          pushLine({ type: 'error', text: message });
        }
        return;
      }

      if (resolvedInput === '/commit' || resolvedInput.startsWith('/commit ')) {
        if (!props.onCommitCommand) {
          pushLine({
            type: 'error',
            text: '/commit is unavailable in this chat session.',
          });
          return;
        }
        const messageRaw = resolvedInput.replace(/^\/commit\s*/i, '').trim();
        try {
          await props.onCommitCommand(messageRaw, pushLine);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : 'Failed to create git commit';
          pushLine({ type: 'error', text: message });
        }
        return;
      }

      if (resolvedInput === '/format' || resolvedInput.startsWith('/format ')) {
        const arg = resolvedInput.replace(/^\/format\s*/i, '').trim().toLowerCase();
        if (!arg) {
          const effective = isAnthropicWireFormat(
            wireFormat,
            props.provider,
            props.customProviderFormat,
          )
            ? 'anthropic (Messages API)'
            : 'openai (chat completions)';
          pushLine({
            type: 'info',
            text: `Wire format setting: ${wireFormat} → effective: ${effective}`,
          });
          pushLine({
            type: 'info',
            text: 'Usage: /format auto | /format anthropic | /format openai',
          });
          return;
        }
        if (arg === 'auto' || arg === 'openai' || arg === 'anthropic') {
          const next = arg as RequestWireFormat;
          props.onWireFormatChange(next);
          setWireFormat(next);
          setAvailableModels([]);
          pushLine({
            type: 'info',
            text: `Wire format set to ${next}. OpenAI mode only appends /chat/completions to your base URL.`,
          });
          return;
        }
        pushLine({
          type: 'error',
          text: `Unknown /format argument "${arg}". Use auto, anthropic, or openai.`,
        });
        return;
      }

      if (resolvedInput.startsWith('/model')) {
        const modelArg = resolvedInput.replace('/model', '').trim();
        if (modelArg === 'default') {
          await applyModel(props.defaultModel);
          return;
        }

        if (!modelArg) {
          try {
            const models = await ensureModelsLoaded();
            setModelPickerOpen(true);
            setSelectedModelIndex(0);
            pushLine({
              type: 'info',
              text: `Loaded ${models.length} model(s). Select one with ↑/↓ and Enter, or type /model <id>.`,
            });
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : 'Failed to fetch models';
            pushLine({ type: 'error', text: message });
          }
          return;
        }

        try {
          await applyModel(modelArg);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : 'Failed to switch model';
          pushLine({ type: 'error', text: message });
        }
        return;
      }

      if (resolvedInput === '/mode' || resolvedInput.startsWith('/mode ')) {
        const modeArg = resolvedInput.replace('/mode', '').trim().toLowerCase();
        if (!modeArg) {
          setModePickerOpen(true);
          const defaultIndex = props.modeOptions.findIndex((m) => m.id === activeMode);
          setSelectedModeIndex(defaultIndex >= 0 ? defaultIndex : 0);
          pushLine({
            type: 'info',
            text: `Select a mode with ↑/↓ and Enter, or type /mode <id>. Current: ${activeMode}.`,
          });
          return;
        }

        const selectedMode = props.modeOptions.find((mode) => mode.id === modeArg);
        if (!selectedMode) {
          pushLine({
            type: 'error',
            text: `Unknown mode "${modeArg}". Use /mode and pick from the list.`,
          });
          return;
        }

        try {
          await applyMode(selectedMode.id);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Failed to switch mode';
          pushLine({ type: 'error', text: message });
        }
        return;
      }

      const runOne = async (prompt: string): Promise<void> => {
        currentPromptRef.current = prompt;
        abortReasonRef.current = 'none';
        lastVisibleOutputAtRef.current = Date.now();
        abortControllerRef.current = new AbortController();

        pushLine({ type: 'user', text: prompt });
        sessionMessagesRef.current.push({ role: 'user', content: prompt });
        setIsRunning(true);
        try {
          const startedAt = Date.now();
          const { imageRefs, explicitAtImagePaths } = collectImageReferencesForPrompt(
            prompt,
            process.cwd(),
          );
          const images: ImageAttachment[] = [];
          for (const ref of imageRefs) {
            try {
              const mime = mimeFromExtension(ref.extension);
              if (!mime) continue;
              const attachment = await loadImageAttachment(ref.resolvedPath, { mime });
              images.push(attachment);
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'Failed to load image';
              if (explicitAtImagePaths.has(ref.resolvedPath)) {
                pushLine({ type: 'error', text: message });
              }
              // Implicit path mentions: skip silently if file missing (avoid noise for figurative ".png" etc.)
            }
          }

          if (images.length > 0) {
            pushLine({
              type: 'info',
              text: `Including ${images.length} image(s) in this message for the model (vision).`,
            });
          }

          const stats = await props.runPrompt(prompt, pushLine, {
            images: images.length ? images : undefined,
            signal: abortControllerRef.current.signal,
            onVisibleOutput: () => {
              lastVisibleOutputAtRef.current = Date.now();
            },
          });
          const elapsedMs = Date.now() - startedAt;
          const seconds = (elapsedMs / 1000).toFixed(1);
          pushLine({
            type: 'info',
            text: `Done in ${seconds}s` + (stats.costLabel ? ` · cost ${stats.costLabel}` : ''),
          });
        } finally {
          abortControllerRef.current = null;
          currentPromptRef.current = null;
          setIsRunning(false);
        }
      };

      const isAbortError = (err: unknown): boolean => {
        if (!err || typeof err !== 'object') return false;
        const anyErr = err as any;
        return anyErr.name === 'AbortError' || String(anyErr.message || '').toLowerCase().includes('aborted');
      };

      // Save to prompt history (avoid duplicates for consecutive same prompts)
      if (resolvedInput && !resolvedInput.startsWith('/')) {
        const hist = promptHistoryRef.current;
        if (hist[hist.length - 1] !== resolvedInput) {
          hist.push(resolvedInput);
        }
        historyIndexRef.current = hist.length;
      }

      // Watchdog auto-restart loop (up to 2 restarts)
      restartAttemptsRef.current = 0;
      let promptToRun: string | null = resolvedInput;
      while (promptToRun) {
        const activePrompt: string = promptToRun;
        promptToRun = null;
        try {
          await runOne(activePrompt);
        } catch (err: unknown) {
          if (isAbortError(err) && abortReasonRef.current === 'watchdog') {
            restartAttemptsRef.current += 1;
            if (restartAttemptsRef.current <= 2) {
              // Restart same prompt
              promptToRun = activePrompt;
              continue;
            }
            pushLine({ type: 'error', text: 'Restart limit reached (2). Stopping.' });
          } else if (isAbortError(err) && abortReasonRef.current === 'user') {
            pushLine({ type: 'info', text: 'Cancelled.' });
          } else {
            const message = err instanceof Error ? err.message : 'Unknown error';
            pushLine({ type: 'error', text: message });
          }
        }

        // If a message was queued during this run, send it next.
        if (!promptToRun && queuedPromptRef.current) {
          promptToRun = queuedPromptRef.current;
          queuedPromptRef.current = null;
        }
      }
    },
    [
      applyModel,
      beginConfigMenu,
      configPrompt.kind,
      ensureModelsLoaded,
      exit,
      filePickerOpen,
      isRunning,
      props,
      pushLine,
      questionsState,
      requestOpenAIModelsFrom,
      selectedCommandIndex,
      activeMode,
      setupBaseUrl,
      setupStep,
      wireFormat,
      applyMode,
      startSetupWizard,
    ],
  );

  const normalizedInput = input.trim().toLowerCase();
  const isSlashMode = input.startsWith('/');
  const modelFilter = input.startsWith('/model')
    ? input.replace('/model', '').trim().toLowerCase()
    : '';
  const modeFilter = input.startsWith('/mode')
    ? input.replace('/mode', '').trim().toLowerCase()
    : '';
  const filteredModels = availableModels.filter((modelName) =>
    modelName.toLowerCase().includes(modelFilter),
  );
  const filteredModeOptions = props.modeOptions.filter(
    (mode) =>
      mode.id.toLowerCase().includes(modeFilter) ||
      mode.label.toLowerCase().includes(modeFilter) ||
      mode.description.toLowerCase().includes(modeFilter),
  );
  const filteredCommands = CHAT_COMMANDS.filter((command) =>
    command.name.toLowerCase().startsWith(normalizedInput || '/'),
  );

  const MODEL_PICKER_WINDOW = 14;
  const modelPickerStart = computeWindowStart(
    filteredModels.length,
    selectedModelIndex,
    MODEL_PICKER_WINDOW,
  );
  const visibleModelOptions = filteredModels.slice(
    modelPickerStart,
    modelPickerStart + MODEL_PICKER_WINDOW,
  );

  const setupModelPickerStart = computeWindowStart(
    setupModels.length,
    setupSelectedModelIndex,
    MODEL_PICKER_WINDOW,
  );
  const visibleSetupModelOptions = setupModels.slice(
    setupModelPickerStart,
    setupModelPickerStart + MODEL_PICKER_WINDOW,
  );

  const FILE_PICKER_WINDOW = 14;
  const filePickerStart = computeWindowStart(
    filteredFileEntries.length,
    selectedFileIndex,
    FILE_PICKER_WINDOW,
  );
  const visibleFileEntries = filteredFileEntries.slice(
    filePickerStart,
    filePickerStart + FILE_PICKER_WINDOW,
  );

  useInput((inputKey, key) => {
    if (key.ctrl && inputKey === 'c') {
      exit();
      return;
    }

    // During an active run, Esc always means "abort run" (takes priority over question UI).
    if (isRunning && key.escape) {
      if (questionsState) {
        setQuestionsState(null);
      }
      if (abortControllerRef.current && abortReasonRef.current === 'none') {
        abortReasonRef.current = 'user';
        abortControllerRef.current.abort();
      }
      return;
    }

    // Interactive questions: arrow key navigation
    if (questionsState && !questionsState.isTypingCustom) {
      const q = questionsState.questions[questionsState.currentIndex];
      const totalOptions = q.options.length + (q.hasOther !== false ? 1 : 0);
      if (key.upArrow) {
        setQuestionsState({
          ...questionsState,
          selectedOptionIndex: questionsState.selectedOptionIndex <= 0
            ? totalOptions - 1
            : questionsState.selectedOptionIndex - 1,
        });
        return;
      }
      if (key.downArrow) {
        setQuestionsState({
          ...questionsState,
          selectedOptionIndex: questionsState.selectedOptionIndex >= totalOptions - 1
            ? 0
            : questionsState.selectedOptionIndex + 1,
        });
        return;
      }
      // Enter on a highlighted option: if "type yourself" is selected, switch to typing mode
      if (key.return) {
        const idx = questionsState.selectedOptionIndex;
        const isOtherOption = idx === q.options.length && q.hasOther !== false;
        if (isOtherOption) {
          setQuestionsState({ ...questionsState, isTypingCustom: true });
          setInput('');
          return;
        }
        // Picked a concrete option — resolve and submit
        if (idx < q.options.length) {
          const answer = q.options[idx].label;
          handleQuestionAnswer(questionsState, answer);
          return;
        }
      }
      // Escape to cancel questions
      if (key.escape) {
        setQuestionsState(null);
        pushLine({ type: 'info', text: 'Questions cancelled.' });
        return;
      }
      // If not a special key and not typing custom, ignore (user must use arrows + Enter)
      if (!key.return && !key.escape && !key.upArrow && !key.downArrow && !key.ctrl && !key.meta) {
        return;
      }
    }

    // If in custom-typing mode for a question, handle Enter to submit
    if (questionsState && questionsState.isTypingCustom) {
      if (key.return) {
        const answer = input.trim();
        if (!answer) return;
        handleQuestionAnswer(questionsState, answer);
        return;
      }
      if (key.escape) {
        // Go back to option selection
        setQuestionsState({ ...questionsState, isTypingCustom: false });
        setInput('');
        return;
      }
      // Let normal TextInput handle typing — don't intercept
    }

    if (configMenuOpen && !isRunning) {
      if (key.escape) {
        setConfigMenuOpen(false);
        pushLine({ type: 'info', text: 'Config menu closed.' });
        return;
      }
      if (key.upArrow) {
        setConfigSelectedIndex((prev) => (prev === 0 ? CONFIG_MENU.length - 1 : prev - 1));
        return;
      }
      if (key.downArrow) {
        setConfigSelectedIndex((prev) => (prev >= CONFIG_MENU.length - 1 ? 0 : prev + 1));
        return;
      }
      if (key.return) {
        const picked = CONFIG_MENU[configSelectedIndex];
        const config = new ConfigManager(props.profile);
        if (!picked) return;
        if (picked.value === 'close') {
          setConfigMenuOpen(false);
          pushLine({ type: 'info', text: 'Config menu closed.' });
          return;
        }
        if (picked.value === 'show') {
          printConfigSummary();
          return;
        }
        if (picked.value === 'set_baseurl') {
          setConfigPrompt({ kind: 'baseUrl' });
          pushLine({
            type: 'info',
            text: 'Enter Base URL (OpenAI format). Example: https://api.openai.com/v1',
          });
          return;
        }
        if (picked.value === 'set_apikey') {
          setConfigPrompt({ kind: 'apiKey' });
          pushLine({ type: 'info', text: 'Enter API key (will be saved locally).' });
          return;
        }
        if (picked.value === 'set_economy_model') {
          setConfigPrompt({ kind: 'economyModel' });
          pushLine({ type: 'info', text: 'Enter economy model id:' });
          return;
        }
        if (picked.value === 'set_provider') {
          setConfigProviderPickerOpen(true);
          setConfigProviderIndex(0);
          pushLine({ type: 'info', text: 'Pick provider: ↑/↓ then Enter (Esc to cancel)' });
          return;
        }
        if (picked.value === 'set_costmode') {
          setConfigCostModePickerOpen(true);
          setConfigCostModeIndex(0);
          pushLine({ type: 'info', text: 'Pick cost mode: ↑/↓ then Enter (Esc to cancel)' });
          return;
        }
        if (picked.value === 'pick_model') {
          // Fetch /models using current baseUrl + apiKey
          const baseUrl = config.getBaseUrl();
          const apiKey = config.getApiKey();
          if (!baseUrl || !apiKey) {
            pushLine({
              type: 'error',
              text: 'Missing baseUrl or apiKey. Set them first (Base URL + API key).',
            });
            return;
          }
          pushLine({ type: 'info', text: 'Fetching models from /models…' });
          void (async () => {
            try {
              const models = await requestOpenAIModelsFrom(baseUrl, apiKey);
              const unique = Array.from(new Set(models)).sort();
              setSetupModels(unique);
              setSetupModelPickerOpen(true);
              setSetupSelectedModelIndex(0);
              setSetupStep('pickModel');
              pushLine({ type: 'info', text: `Loaded ${unique.length} model(s). Pick one with ↑/↓ and Enter.` });
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : 'Failed to fetch models';
              pushLine({ type: 'error', text: message });
            }
          })();
          return;
        }
      }
    }

    if (configProviderPickerOpen && !isRunning) {
      const providers: Array<{ label: string; value: ProviderType | 'auto' }> = [
        { label: 'auto-detect', value: 'auto' },
        { label: 'openai', value: 'openai' },
        { label: 'anthropic', value: 'anthropic' },
        { label: 'deepseek', value: 'deepseek' },
        { label: 'openrouter', value: 'openrouter' },
        { label: 'google', value: 'google' },
        { label: 'grok', value: 'grok' },
        { label: 'kimi', value: 'kimi' },
        { label: 'zai', value: 'zai' },
        { label: 'routingrun', value: 'routingrun' },
        { label: 'zenllm', value: 'zenllm' },
      ];
      if (key.escape) {
        setConfigProviderPickerOpen(false);
        return;
      }
      if (key.upArrow) {
        setConfigProviderIndex((prev) => (prev === 0 ? providers.length - 1 : prev - 1));
        return;
      }
      if (key.downArrow) {
        setConfigProviderIndex((prev) => (prev >= providers.length - 1 ? 0 : prev + 1));
        return;
      }
      if (key.return) {
        const picked = providers[configProviderIndex];
        if (!picked) return;
        const config = new ConfigManager(props.profile);
        if (picked.value === 'auto') {
          config.delete('provider');
          pushLine({ type: 'info', text: 'Provider set to auto-detect.' });
        } else {
          config.set('provider', picked.value);
          pushLine({ type: 'info', text: `Provider set to: ${picked.value}` });
        }
        setConfigProviderPickerOpen(false);
        return;
      }
    }

    if (configCostModePickerOpen && !isRunning) {
      const modes: Array<{ label: string; value: 'normal' | 'economy' }> = [
        { label: 'normal', value: 'normal' },
        { label: 'economy', value: 'economy' },
      ];
      if (key.escape) {
        setConfigCostModePickerOpen(false);
        return;
      }
      if (key.upArrow) {
        setConfigCostModeIndex((prev) => (prev === 0 ? modes.length - 1 : prev - 1));
        return;
      }
      if (key.downArrow) {
        setConfigCostModeIndex((prev) => (prev >= modes.length - 1 ? 0 : prev + 1));
        return;
      }
      if (key.return) {
        const picked = modes[configCostModeIndex];
        if (!picked) return;
        const config = new ConfigManager(props.profile);
        config.set('costMode', picked.value);
        pushLine({ type: 'info', text: `Cost mode set to: ${picked.value}` });
        setConfigCostModePickerOpen(false);
        return;
      }
    }

    if (setupProviderPickerOpen && !isRunning) {
      const providers: Array<{
        label: string;
        value: ProviderType | 'custom';
        baseUrl?: string;
        format?: RequestWireFormat;
        note?: string;
      }> = [
        {
          label: 'Routing.run (recommended) (cheapest opensource model provider)',
          value: 'routingrun',
          baseUrl: PROVIDER_CONFIGS.routingrun.baseUrl,
          format: 'openai',
        },
        {
          label: 'zenllm.org (recommended) (best ai provider with 200+ models)',
          value: 'zenllm',
          baseUrl: PROVIDER_CONFIGS.zenllm.baseUrl,
          format: 'openai',
        },
        { label: 'OpenAI', value: 'openai', baseUrl: PROVIDER_CONFIGS.openai.baseUrl, format: 'openai' },
        { label: 'Anthropic', value: 'anthropic', baseUrl: PROVIDER_CONFIGS.anthropic.baseUrl, format: 'anthropic' },
        { label: 'OpenRouter', value: 'openrouter', baseUrl: PROVIDER_CONFIGS.openrouter.baseUrl, format: 'openai' },
        { label: 'Groq', value: 'groq', baseUrl: PROVIDER_CONFIGS.groq.baseUrl, format: 'openai' },
        { label: 'DeepSeek', value: 'deepseek', baseUrl: PROVIDER_CONFIGS.deepseek.baseUrl, format: 'openai' },
        { label: 'Google (Gemini)', value: 'google', baseUrl: PROVIDER_CONFIGS.google.baseUrl, format: 'openai' },
        { label: 'xAI (Grok)', value: 'grok', baseUrl: PROVIDER_CONFIGS.grok.baseUrl, format: 'openai' },
        { label: 'Moonshot (Kimi)', value: 'kimi', baseUrl: PROVIDER_CONFIGS.kimi.baseUrl, format: 'anthropic' },
        { label: 'Zhipu AI (z.ai)', value: 'zai', baseUrl: PROVIDER_CONFIGS.zai.baseUrl, format: 'anthropic' },
        {
          label: 'Custom (paste your own Base URL)',
          value: 'custom',
          note: 'Lets you paste any OpenAI-compatible endpoint',
        },
      ];

      if (key.escape) {
        setSetupProviderPickerOpen(false);
        setSetupStep('idle');
        pushLine({ type: 'info', text: 'Setup cancelled.' });
        return;
      }
      if (key.upArrow) {
        setSetupProviderIndex((prev) => (prev === 0 ? providers.length - 1 : prev - 1));
        return;
      }
      if (key.downArrow) {
        setSetupProviderIndex((prev) => (prev >= providers.length - 1 ? 0 : prev + 1));
        return;
      }
      if (key.return) {
        const picked = providers[setupProviderIndex];
        if (!picked) return;
        const config = new ConfigManager(props.profile);
        setSetupProviderPickerOpen(false);

        if (picked.value === 'custom') {
          setSetupStep('baseUrl');
          pushLine({
            type: 'info',
            text: 'Setup — enter Base URL (OpenAI format). Example: https://api.openai.com/v1',
          });
          return;
        }

        // Preset: write config + proceed to API key
        config.set('provider', picked.value);
        if (picked.baseUrl) {
          config.set('baseUrl', picked.baseUrl);
          setSetupBaseUrl(picked.baseUrl);
        }
        if (picked.format) {
          config.set('requestFormat', picked.format);
        }
        pushLine({
          type: 'info',
          text: `Selected provider: ${picked.value} (${picked.format ?? 'auto'}). Now enter API key.`,
        });
        setSetupStep('apiKey');
        return;
      }
    }

    if (setupModelPickerOpen && !isRunning && setupModels.length > 0) {
      if (key.escape) {
        setSetupModelPickerOpen(false);
        setSetupStep('idle');
        pushLine({ type: 'info', text: 'Setup cancelled.' });
        return;
      }
      if (key.upArrow) {
        setSetupSelectedModelIndex((prev) => (prev === 0 ? setupModels.length - 1 : prev - 1));
        return;
      }
      if (key.downArrow) {
        setSetupSelectedModelIndex((prev) => (prev >= setupModels.length - 1 ? 0 : prev + 1));
        return;
      }
      if (key.return) {
        const picked = setupModels[setupSelectedModelIndex];
        if (!picked) return;
        // Use the same path as /model so the live status line updates immediately.
        void applyModel(picked);
        setSetupModelPickerOpen(false);
        setSetupStep('idle');
        pushLine({ type: 'info', text: 'Setup complete. Type a prompt to start.' });
        return;
      }
    }

    if (
      modePickerOpen &&
      !isRunning &&
      (filteredModeOptions.length > 0 || key.escape)
    ) {
      if (key.escape) {
        setModePickerOpen(false);
        return;
      }
      if (key.upArrow) {
        setSelectedModeIndex((prev) =>
          prev === 0 ? filteredModeOptions.length - 1 : prev - 1,
        );
        return;
      }
      if (key.downArrow) {
        setSelectedModeIndex((prev) =>
          prev >= filteredModeOptions.length - 1 ? 0 : prev + 1,
        );
        return;
      }
      if (key.return) {
        const selectedMode = filteredModeOptions[selectedModeIndex];
        if (selectedMode) {
          void applyMode(selectedMode.id);
        }
        return;
      }
    }

    if (
      modelPickerOpen &&
      !isRunning &&
      (filteredModels.length > 0 || key.escape)
    ) {
      if (key.escape) {
        setModelPickerOpen(false);
        return;
      }
      if (key.upArrow) {
        setSelectedModelIndex((prev) =>
          prev === 0 ? filteredModels.length - 1 : prev - 1,
        );
        return;
      }
      if (key.downArrow) {
        setSelectedModelIndex((prev) =>
          prev >= filteredModels.length - 1 ? 0 : prev + 1,
        );
        return;
      }
      if (key.return) {
        const selectedModel = filteredModels[selectedModelIndex];
        if (selectedModel) {
          void applyModel(selectedModel);
        }
        return;
      }
    }

    // File picker arrow navigation (@-triggered)
    if (filePickerOpen && !isRunning && !isSlashMode) {
      if (key.escape) {
        setFilePickerOpen(false);
        setSelectedFileIndex(0);
        return;
      }
      if (key.upArrow) {
        setSelectedFileIndex((prev) =>
          prev === 0 ? filteredFileEntries.length - 1 : prev - 1,
        );
        return;
      }
      if (key.downArrow) {
        setSelectedFileIndex((prev) =>
          prev >= filteredFileEntries.length - 1 ? 0 : prev + 1,
        );
        return;
      }
      if (key.return) {
        const selected = filteredFileEntries[selectedFileIndex];
        if (selected) {
          const beforeAt = input.slice(0, atPos);
          const afterAtPart = input.slice(atPos + 1);
          const spaceIdx = afterAtPart.indexOf(' ');
          const rest = spaceIdx === -1 ? '' : afterAtPart.slice(spaceIdx);
          const newInput = `${beforeAt}@${selected.relativePath}${rest} `;
          setInput(newInput);
        }
        setFilePickerOpen(false);
        setSelectedFileIndex(0);
        return;
      }
    }

    // Prompt history browsing with UP/DOWN arrows (only in normal chat input)
    if (!isSlashMode && !isRunning && !questionsState && !configMenuOpen && !modePickerOpen && !modelPickerOpen && !setupModelPickerOpen && !setupProviderPickerOpen && !configProviderPickerOpen && !configCostModePickerOpen) {
      const hist = promptHistoryRef.current;
      if (key.upArrow) {
        if (hist.length === 0) return;
        // Save current input before browsing (only the first time we press up)
        if (historyIndexRef.current >= hist.length) {
          savedInputRef.current = input;
        }
        if (historyIndexRef.current > 0) {
          historyIndexRef.current -= 1;
          setInput(hist[historyIndexRef.current]);
        }
        return;
      }
      if (key.downArrow) {
        if (historyIndexRef.current < hist.length) {
          historyIndexRef.current += 1;
          if (historyIndexRef.current >= hist.length) {
            setInput(savedInputRef.current);
          } else {
            setInput(hist[historyIndexRef.current]);
          }
        }
        return;
      }
    }

    if (!isSlashMode || isRunning || filteredCommands.length === 0) {
      return;
    }

    if (key.upArrow) {
      setSelectedCommandIndex((prev) =>
        prev === 0 ? filteredCommands.length - 1 : prev - 1,
      );
      return;
    }

    if (key.downArrow) {
      setSelectedCommandIndex((prev) =>
        prev >= filteredCommands.length - 1 ? 0 : prev + 1,
      );
      return;
    }

    if (key.tab) {
      const selected = filteredCommands[selectedCommandIndex];
      if (selected) {
        setInput(
          selected.name +
            (selected.name === '/model' ||
            selected.name === '/format' ||
            selected.name === '/mode'
              ? ' '
              : ''),
        );
      }
    }
  });

  React.useEffect(() => {
    setSelectedCommandIndex(0);
  }, [input]);

  const workVerbPhrase = useMemo(
    () => SPINNER_VERBS[workVerbIndex % SPINNER_VERBS.length],
    [workVerbIndex],
  );

  const status = useMemo(() => {
    if (!isRunning) {
      return `model: ${activeModel} | format: ${wireFormat} | mode: ${activeMode} | provider: ${props.provider || 'auto'} | idle`;
    }
    const shortVerb =
      workVerbPhrase.length > 32
        ? `${workVerbPhrase.slice(0, 30)}…`
        : workVerbPhrase;
    const tail = `working ${WORK_SPINNER_FRAMES[workSpinnerFrame]} · ${shortVerb}`;
    const elapsed = runElapsedMs ? ` | elapsed ${(runElapsedMs / 1000).toFixed(1)}s` : '';
    return `model: ${activeModel} | format: ${wireFormat} | mode: ${activeMode} | provider: ${props.provider || 'auto'} | ${tail}${elapsed}`;
  }, [
    activeModel,
    activeMode,
    props.provider,
    isRunning,
    wireFormat,
    workSpinnerFrame,
    workVerbPhrase,
    runElapsedMs,
  ]);
  /** Taller transcript area once there is real chat; hero stays visible for the whole session. */
  const hasChatContent = lines.some(
    (l) =>
      l.kind === 'line' &&
      (l.type === 'user' ||
        l.type === 'assistant' ||
        l.type === 'tool' ||
        l.type === 'tool_out' ||
        l.type === 'error'),
  );
  const providerName = props.provider ? props.provider.toUpperCase() : 'AUTO';
  const divider = '─'.repeat(98);

  const staticItems = useMemo<StaticItem[]>(
    () => [{ kind: 'hero', id: 0 }, ...lines],
    [lines],
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text dimColor>{status}</Text>
      <Text color="subtle">{divider}</Text>
      <Static items={staticItems}>
        {(item) => {
          if (item.kind === 'hero') {
            return (
              <Box key={item.id} flexDirection="column" marginBottom={1}>
                {HERO_LOGO.map((line, idx) => (
                  <React.Fragment key={`logo-${idx}`}>
                    <Text bold color={idx < 6 ? 'claude' : 'suggestion'}>
                      {line}
                    </Text>
                  </React.Fragment>
                ))}
                <Text color="suggestion">✦ Any model, Every tool, Zero limits. ✦</Text>
                <Box
                  marginTop={1}
                  borderStyle="round"
                  borderColor="claude"
                  flexDirection="column"
                  paddingX={1}
                >
                  <Text>
                    <Text color="inactive">Provider </Text>
                    <Text color="claude" bold>
                      {providerName}
                    </Text>
                  </Text>
                  <Text>
                    <Text color="inactive">Model    </Text>
                    <Text>{activeModel}</Text>
                  </Text>
                  <Text>
                    <Text color="inactive">Endpoint </Text>
                    <Text>{props.baseUrl || 'provider default'}</Text>
                  </Text>
                  <Text>
                    <Text color="inactive">Format  </Text>
                    <Text>
                      {wireFormat}{' '}
                      <Text dimColor>
                        (
                        {isAnthropicWireFormat(
                          wireFormat,
                          props.provider,
                          props.customProviderFormat,
                        )
                          ? 'Anthropic Messages'
                          : 'OpenAI chat'}
                        )
                      </Text>
                    </Text>
                  </Text>
                </Box>
                <Box marginTop={1}>
                  <Text color="suggestion">{props.runtimeStatus}:</Text>
                  <Text color="inactive"> Ready  -  type </Text>
                  <Text color="claude">/help</Text>
                  <Text color="inactive"> to begin</Text>
                </Box>
                {props.sandboxLabel ? (
                  <Text color="inactive">sandbox: {props.sandboxLabel}</Text>
                ) : null}
                {props.sandboxId ? (
                  <Text color="inactive">sandbox id: {props.sandboxId}</Text>
                ) : null}
                {props.previewUrl ? (
                  <Text color="inactive">preview: {props.previewUrl}</Text>
                ) : null}
                {props.pullHint ? (
                  <Text color="inactive">pull: {props.pullHint}</Text>
                ) : null}
                <Text color="inactive">
                  xibecode <Text color="claude">v{APP_VERSION}</Text>
                </Text>
                <Text color="subtle">{'─'.repeat(98)}</Text>
                <Text color="inactive">Agent transcript</Text>
              </Box>
            );
          }

          return (
            <React.Fragment key={item.id}>
              {item.type === 'assistant' ? (
                <Box flexDirection="column" marginBottom={1}>
                  <Text bold color={prefixColorKey('assistant')}>
                    {prefixForType('assistant')}:
                  </Text>
                  <Box marginLeft={2} flexDirection="column">
                    <AssistantMarkdown content={item.text} />
                  </Box>
                </Box>
              ) : (
                <Text>
                  <Text bold color={prefixColorKey(item.type)}>
                    {prefixForType(item.type)}:{' '}
                  </Text>
                  <Text color={lineColorKey(item.type)}>{item.text}</Text>
                </Text>
              )}
            </React.Fragment>
          );
        }}
      </Static>
      {!hasChatContent && (
        <Box marginTop={1} flexDirection="column">
          <Text color="inactive">(send a message to start)</Text>
        </Box>
      )}
      <Text color="subtle">{divider}</Text>
      {isRunning && (
        <Box
          marginTop={1}
          paddingX={1}
          borderStyle="round"
          borderColor="claudeBlue_FOR_SYSTEM_SPINNER"
          flexDirection="column"
        >
          <Text wrap="wrap">
            <Text bold color="claudeBlue_FOR_SYSTEM_SPINNER">
              {WORK_SPINNER_FRAMES[workSpinnerFrame]}{' '}
            </Text>
            <Text bold color="briefLabelClaude">
              {workVerbPhrase}
            </Text>
          </Text>
        </Box>
      )}
      {questionsState && (() => {
        const { questions, currentIndex, selectedOptionIndex, isTypingCustom } = questionsState;
        const q = questions[currentIndex];
        const optLetters = 'abcdefghij';
        const totalOptions = q.options.length + (q.hasOther !== false ? 1 : 0);

        if (isTypingCustom) {
          return (
            <Box
              marginTop={1}
              borderStyle="round"
              borderColor="green"
              flexDirection="column"
              paddingX={1}
            >
              <Text bold color="green">
                Question {currentIndex + 1}/{questions.length} — Type your answer
              </Text>
              <Text color="text">{q.question}</Text>
              <Text color="inactive" dimColor>Press Esc to go back to options</Text>
            </Box>
          );
        }

        return (
          <Box
            marginTop={1}
            borderStyle="round"
            borderColor="yellow"
            flexDirection="column"
            paddingX={1}
          >
            <Text bold color="yellow">
              Question {currentIndex + 1}/{questions.length}
            </Text>
            <Text color="text">{q.question}{q.allowMultiple ? ' (select all that apply)' : ''}</Text>
            <Box flexDirection="column" marginTop={1}>
              {q.options.map((o, j) => {
                const isSelected = j === selectedOptionIndex;
                return (
                  <Text key={o.id}>
                    <Text bold color={isSelected ? 'green' : 'inactive'}>
                      {isSelected ? ' ▸ ' : '   '}
                    </Text>
                    <Text bold color={isSelected ? 'green' : 'yellow'}>
                      {optLetters[j]})
                    </Text>
                    <Text color={isSelected ? 'green' : 'text'}> {o.label}</Text>
                  </Text>
                );
              })}
              {q.hasOther !== false && (() => {
                const otherIdx = q.options.length;
                const isSelected = otherIdx === selectedOptionIndex;
                return (
                  <Text>
                    <Text bold color={isSelected ? 'green' : 'inactive'}>
                      {isSelected ? ' ▸ ' : '   '}
                    </Text>
                    <Text bold color={isSelected ? 'green' : 'yellow'}>
                      {optLetters[otherIdx]})
                    </Text>
                    <Text color={isSelected ? 'green' : 'inactive'}> type yourself</Text>
                  </Text>
                );
              })()}
            </Box>
            <Text color="inactive" dimColor>↑/↓ to navigate, Enter to select, Esc to cancel</Text>
          </Box>
        );
      })()}
      <Box marginTop={1} borderStyle="round" borderColor={questionsState ? (questionsState.isTypingCustom ? 'green' : 'yellow') : 'claude'} paddingX={1}>
        <Text color={questionsState ? (questionsState.isTypingCustom ? 'green' : 'yellow') : 'claude'}>{'> '}</Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={onSubmit}
          placeholder={questionsState
            ? questionsState.isTypingCustom
              ? `Type your answer for Q${questionsState.currentIndex + 1} and press Enter`
              : `Use ↑/↓ and Enter to pick an option (Q${questionsState.currentIndex + 1}/${questionsState.questions.length})`
            : isRunning ? 'Waiting for response…' : 'Message XibeCode…'}
        />
      </Box>
      {filePickerOpen && (
        <Box
          marginTop={1}
          borderStyle="round"
          borderColor="suggestion"
          flexDirection="column"
          paddingX={1}
        >
          <Text bold color="suggestion">
            Files{filePickerLoading ? ' (loading...)' : ''}
          </Text>
          {filePickerLoading ? (
            <Text color="inactive">Scanning workspace…</Text>
          ) : filteredFileEntries.length === 0 ? (
            <Text color="inactive">
              {fileQuery ? `No files match "${fileQuery}"` : 'No files in workspace'}
            </Text>
          ) : (
            visibleFileEntries.map((entry, index) => {
              const absoluteIndex = filePickerStart + index;
              const isSelected = absoluteIndex === selectedFileIndex;
              return (
                <Text key={entry.relativePath}>
                  <Text color={isSelected ? 'claude' : 'inactive'}>
                    {isSelected ? '▸ ' : '  '}
                  </Text>
                  <Text color={isSelected ? 'claude' : (entry.isDirectory ? 'yellow' : 'text')}>
                    {entry.relativePath}
                  </Text>
                  {entry.isDirectory && (
                    <Text color="inactive">/</Text>
                  )}
                </Text>
              );
            })
          )}
          <Text color="subtle">↑/↓ navigate • Enter select • Esc close</Text>
        </Box>
      )}
      {isSlashMode && (
        <Box
          marginTop={1}
          borderStyle="round"
          borderColor="suggestion"
          flexDirection="column"
          paddingX={1}
        >
          <Text color="suggestion" bold>
            Commands
          </Text>
          {filteredCommands.length === 0 ? (
            <Text color="inactive">No commands match "{input}"</Text>
          ) : (
            filteredCommands.map((command, index) => (
              <React.Fragment key={command.name}>
                <Text>
                  <Text color={index === selectedCommandIndex ? 'claude' : 'inactive'}>
                    {index === selectedCommandIndex ? '▸ ' : '  '}
                  </Text>
                  <Text bold color={index === selectedCommandIndex ? 'claude' : 'text'}>
                    {command.name}
                  </Text>
                  <Text color="inactive"> — {command.description}</Text>
                </Text>
              </React.Fragment>
            ))
          )}
          <Text color="subtle">Use ↑/↓ to navigate, Tab to autocomplete.</Text>
        </Box>
      )}
      {modelPickerOpen && (
        <Box
          marginTop={1}
          borderStyle="round"
          borderColor="claude"
          flexDirection="column"
          paddingX={1}
        >
          <Text bold color="claude">
            Select model
          </Text>
          {isModelListLoading ? (
            <Text color="inactive">Loading models from provider...</Text>
          ) : filteredModels.length === 0 ? (
            <Text color="inactive">No models matched current filter.</Text>
          ) : (
            visibleModelOptions.map((modelName, index) => {
              const absoluteIndex = modelPickerStart + index;
              const isSelected = absoluteIndex === selectedModelIndex;
              return (
              <React.Fragment key={modelName}>
                <Text>
                  <Text color={isSelected ? 'claude' : 'inactive'}>
                    {isSelected ? '▸ ' : '  '}
                  </Text>
                  <Text color={isSelected ? 'claude' : 'text'}>
                    {modelName}
                  </Text>
                </Text>
              </React.Fragment>
              );
            })
          )}
          <Text color="subtle">↑/↓ navigate • Enter apply • Esc close</Text>
        </Box>
      )}
      {setupModelPickerOpen && (
        <Box
          marginTop={1}
          borderStyle="round"
          borderColor="claude"
          flexDirection="column"
          paddingX={1}
        >
          <Text bold color="claude">
            Setup: select model
          </Text>
          {setupModels.length === 0 ? (
            <Text color="inactive">No models loaded.</Text>
          ) : (
            visibleSetupModelOptions.map((modelName, index) => {
              const absoluteIndex = setupModelPickerStart + index;
              const isSelected = absoluteIndex === setupSelectedModelIndex;
              return (
              <React.Fragment key={modelName}>
                <Text>
                  <Text color={isSelected ? 'claude' : 'inactive'}>
                    {isSelected ? '▸ ' : '  '}
                  </Text>
                  <Text color={isSelected ? 'claude' : 'text'}>
                    {modelName}
                  </Text>
                </Text>
              </React.Fragment>
              );
            })
          )}
          <Text color="subtle">↑/↓ navigate • Enter apply • Esc cancel</Text>
        </Box>
      )}
      {(setupStep !== 'idle' || setupProviderPickerOpen) && (
        <Box
          marginTop={1}
          borderStyle="round"
          borderColor="suggestion"
          flexDirection="column"
          paddingX={1}
        >
          <Text bold color="suggestion">
            Setup wizard
          </Text>
          <Text wrap="wrap">
            <Text color="claude" bold>
              You are configuring your provider connection.
            </Text>
            <Text color="inactive">
              {' '}
              This is required before the agent can run.
            </Text>
          </Text>
          {setupProviderPickerOpen && (
            <Box flexDirection="column" marginTop={1}>
              <Text color="inactive">Pick a provider preset (↑/↓, Enter). Esc cancels.</Text>
              {[
                'Routing.run (recommended) (cheapest opensource model provider)',
                'zenllm.org (recommended) (best ai provider with 200+ models)',
                'OpenAI',
                'Anthropic',
                'OpenRouter',
                'Groq',
                'DeepSeek',
                'Google (Gemini)',
                'xAI (Grok)',
                'Moonshot (Kimi)',
                'Zhipu AI (z.ai)',
                'Custom (paste your own Base URL)',
              ].map((label, index) => (
                <React.Fragment key={label}>
                  <Text>
                    <Text color={index === setupProviderIndex ? 'claude' : 'inactive'}>
                      {index === setupProviderIndex ? '▸ ' : '  '}
                    </Text>
                    <Text color={index === setupProviderIndex ? 'claude' : 'text'}>{label}</Text>
                  </Text>
                </React.Fragment>
              ))}
            </Box>
          )}
          {setupStep === 'baseUrl' && !setupProviderPickerOpen && (
            <Text color="inactive">
              Step: Base URL — paste an OpenAI-compatible endpoint (example: https://api.openai.com/v1)
            </Text>
          )}
          {setupStep === 'apiKey' && !setupProviderPickerOpen && (
            <Text color="inactive">Step: API key — paste your key (stored locally)</Text>
          )}
          {setupStep === 'loadingModels' && (
            <Text color="inactive">Step: Models — fetching `/models`…</Text>
          )}
          {setupStep === 'pickModel' && (
            <Text color="inactive">Step: Model — select one below</Text>
          )}
        </Box>
      )}
      {configMenuOpen && (
        <Box
          marginTop={1}
          borderStyle="round"
          borderColor="suggestion"
          flexDirection="column"
          paddingX={1}
        >
          <Text bold color="suggestion">
            Config
          </Text>
          {CONFIG_MENU.map((item, index) => (
            <React.Fragment key={item.value}>
              <Text>
                <Text color={index === configSelectedIndex ? 'claude' : 'inactive'}>
                  {index === configSelectedIndex ? '▸ ' : '  '}
                </Text>
                <Text bold color={index === configSelectedIndex ? 'claude' : 'text'}>
                  {item.label}
                </Text>
                <Text color="inactive"> — {item.description}</Text>
              </Text>
            </React.Fragment>
          ))}
          <Text color="subtle">↑/↓ navigate • Enter select • Esc close</Text>
        </Box>
      )}
      {configProviderPickerOpen && (
        <Box
          marginTop={1}
          borderStyle="round"
          borderColor="suggestion"
          flexDirection="column"
          paddingX={1}
        >
          <Text bold color="suggestion">
            Provider
          </Text>
          {[
            'auto-detect',
            'openai',
            'anthropic',
            'deepseek',
            'openrouter',
            'google',
            'grok',
            'kimi',
            'zai',
          ].map((label, index) => (
            <React.Fragment key={label}>
              <Text>
                <Text color={index === configProviderIndex ? 'claude' : 'inactive'}>
                  {index === configProviderIndex ? '▸ ' : '  '}
                </Text>
                <Text color={index === configProviderIndex ? 'claude' : 'text'}>{label}</Text>
              </Text>
            </React.Fragment>
          ))}
          <Text color="subtle">↑/↓ navigate • Enter apply • Esc close</Text>
        </Box>
      )}
      {configCostModePickerOpen && (
        <Box
          marginTop={1}
          borderStyle="round"
          borderColor="suggestion"
          flexDirection="column"
          paddingX={1}
        >
          <Text bold color="suggestion">
            Cost mode
          </Text>
          {['normal', 'economy'].map((label, index) => (
            <React.Fragment key={label}>
              <Text>
                <Text color={index === configCostModeIndex ? 'claude' : 'inactive'}>
                  {index === configCostModeIndex ? '▸ ' : '  '}
                </Text>
                <Text color={index === configCostModeIndex ? 'claude' : 'text'}>{label}</Text>
              </Text>
            </React.Fragment>
          ))}
          <Text color="subtle">↑/↓ navigate • Enter apply • Esc close</Text>
        </Box>
      )}
      {modePickerOpen && (
        <Box
          marginTop={1}
          borderStyle="round"
          borderColor="suggestion"
          flexDirection="column"
          paddingX={1}
        >
          <Text bold color="suggestion">
            Select mode
          </Text>
          {filteredModeOptions.length === 0 ? (
            <Text color="inactive">No modes matched current filter.</Text>
          ) : (
            filteredModeOptions.map((mode, index) => (
              <React.Fragment key={mode.id}>
                <Text>
                  <Text color={index === selectedModeIndex ? 'claude' : 'inactive'}>
                    {index === selectedModeIndex ? '▸ ' : '  '}
                  </Text>
                  <Text color={index === selectedModeIndex ? 'claude' : 'text'}>
                    {mode.id}
                  </Text>
                  <Text color="inactive"> — {mode.description}</Text>
                </Text>
              </React.Fragment>
            ))
          )}
          <Text color="subtle">↑/↓ navigate • Enter apply • Esc close</Text>
        </Box>
      )}
    </Box>
  );
}

export async function launchClaudeStyleChat(options: ChatOptions): Promise<void> {
  if (options.forceLocalRuntime) {
    process.env.XIBECODE_SANDBOX_MODE = 'local';
    delete process.env.XIBECODE_SANDBOX_SESSION_ID;
    delete process.env.XIBECODE_SANDBOX_SKIP_SYNC;
  }

  const config = new ConfigManager(options.profile);
  const apiKey = options.apiKey || config.getApiKey() || '';
  const needsFirstRunSetup = !apiKey;

  const useEconomy = (options.costMode || config.getCostMode()) === 'economy';
  const model = options.model || config.getModel(useEconomy);
  const baseUrl = options.baseUrl || config.getBaseUrl();
  const provider: ProviderType | undefined =
    (options.provider as ProviderType | undefined) || config.get('provider');

  const skillManager = new SkillManager(process.cwd(), apiKey, baseUrl, model, provider, builtInSkillsDir);
  await skillManager.loadSkills();
  const defaultSkillsPrompt = await skillManager.buildDefaultSkillsPromptForTask('', process.cwd());

  const mcpClientManager = new MCPClientManager();
  const memory = new NeuralMemory(process.cwd());
  await memory.init().catch(() => { });
  const remoteExecution = resolveRemoteExecutionConfig(config, process.cwd());
  const skipInitialSync =
    process.env.XIBECODE_SANDBOX_SKIP_SYNC === '1' || process.env.XIBECODE_SANDBOX_SKIP_SYNC === 'true';
  if (remoteExecution?.strategy === 'sandbox_full' && !skipInitialSync) {
    const syncResult = await withCloudWorkspaceSyncSpinner(() =>
      syncWorkspaceToSandbox(remoteExecution, process.cwd(), {
        maxMb: config.getSandboxSyncMaxMb(),
        excludeGlobs: config.getSandboxSyncExcludeGlobs(),
        workspaceRoot: remoteExecution.workspaceRoot,
        respectGitignore: config.getSandboxSyncRespectGitignore(),
      }),
    );
    remoteExecution.sessionId = syncResult.sessionId;
    remoteExecution.e2bSandboxId = syncResult.sandboxId || remoteExecution.e2bSandboxId;
  } else if (skipInitialSync && remoteExecution?.strategy === 'sandbox_full' && !remoteExecution.sessionId) {
    throw new Error('Cloud resume requested without a sandbox session ID.');
  }
  const cloudHint = await getCloudRuntimeHint(remoteExecution);
  const runtimeStatus = getRuntimeStatusLabel(config);
  const sandboxLabel =
    remoteExecution?.strategy === 'sandbox_full'
      ? 'full (workspace synced to E2B)'
      : remoteExecution
        ? 'host_only (file edits stay local)'
        : undefined;
  const toolExecutor = new CodingToolExecutor(process.cwd(), {
    mcpClientManager,
    skillManager,
    memory,
    remoteExecution: codingToolExecutorRemoteOptions(remoteExecution),
  });
  attachRemoteExecution(toolExecutor, remoteExecution);
  let wireFormat: RequestWireFormat = config.get('requestFormat') ?? 'auto';
  const customProviderFormat = config.get('customProviderFormat');
  const remoteWs = remoteToolWorkspaceRootForAgent(remoteExecution);
  const createAgentForModel = (modelName: string, creds: { apiKey: string; baseUrl?: string }): EnhancedAgent =>
    new EnhancedAgent(
      {
        apiKey: creds.apiKey,
        baseUrl: creds.baseUrl,
        model: modelName,
        maxIterations: 150,
        verbose: false,
        provider,
        customProviderFormat,
        requestFormat: wireFormat,
        defaultSkillsPrompt,
        remoteToolWorkspaceRoot: remoteWs,
        remoteToolSandboxId: remoteToolSandboxIdForAgent(remoteExecution),
      },
      provider,
    );
  let activeAgent: EnhancedAgent | null = apiKey ? createAgentForModel(model, { apiKey, baseUrl }) : null;
  let activeCreds = { apiKey, baseUrl };
  let activeModel = model;
  let activeMode: AgentMode = 'agent';
  activeAgent?.setModeFromUser('agent', 'Default start mode');
  toolExecutor.setMode(activeMode);

  const onModelChange = async (nextModel: string): Promise<void> => {
    if (nextModel === activeModel) return;
    activeAgent?.removeAllListeners('event');
    activeModel = nextModel;
    config.set('model', nextModel);
    if (activeCreds.apiKey) {
      activeAgent = createAgentForModel(nextModel, { apiKey: activeCreds.apiKey, baseUrl: activeCreds.baseUrl });
      if (currentSession?.messages?.length) {
        activeAgent.setMessages(currentSession.messages);
      }
      activeAgent.setModeFromUser(activeMode, 'Preserve user-selected mode after model switch');
    } else {
      activeAgent = null;
    }
    toolExecutor.setMode(activeMode);
  };

  const onModeChange = async (nextMode: AgentMode): Promise<void> => {
    activeMode = nextMode;
    activeAgent?.setModeFromUser(nextMode, 'User selected /mode in chat');
    toolExecutor.setMode(nextMode);
  };

  const onWireFormatChange = (next: RequestWireFormat): void => {
    wireFormat = next;
    if (next === 'auto') {
      config.delete('requestFormat');
    } else {
      config.set('requestFormat', next);
    }
    activeAgent?.removeAllListeners('event');
    if (activeCreds.apiKey) {
      activeAgent = createAgentForModel(activeModel, { apiKey: activeCreds.apiKey, baseUrl: activeCreds.baseUrl });
      if (currentSession?.messages?.length) {
        activeAgent.setMessages(currentSession.messages);
      }
      activeAgent.setModeFromUser(activeMode, 'Preserve user-selected mode after format switch');
    } else {
      activeAgent = null;
    }
  };

  const loadModels = async (): Promise<string[]> => {
    const currentApiKey = config.getApiKey();
    const currentBaseUrl =
      config.getBaseUrl() ||
      (provider && provider !== 'custom'
        ? PROVIDER_CONFIGS[provider as keyof typeof PROVIDER_CONFIGS]?.baseUrl
        : undefined);
    if (!currentApiKey) {
      throw new Error('Missing API key. Run /setup first.');
    }
    if (!currentBaseUrl) {
      throw new Error('Missing Base URL. Run /setup first.');
    }
    const normalizedBase = (currentBaseUrl || '').replace(/\/+$/, '');

    const response = await fetch(`${normalizedBase}/models`, {
      headers: {
        Authorization: `Bearer ${currentApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Unable to fetch models from ${normalizedBase || 'provider endpoint'}: /models failed (${response.status})`);
    }

    const payload = (await response.json()) as { data?: Array<{ id?: string }> };
    const models = (payload.data ?? [])
      .map((entry) => entry.id ?? '')
      .filter((id) => id.length > 0);

    const unique = Array.from(new Set(models)).sort();
    if (unique.length === 0) {
      throw new Error(`Unable to fetch models from ${normalizedBase || 'provider endpoint'}: no models returned`);
    }

    return unique;
  };

  const runPrompt = async (
    prompt: string,
    onLine: (line: UiLine) => void,
    opts?: { images?: ImageAttachment[]; signal?: AbortSignal; onVisibleOutput?: () => void },
  ): Promise<ReturnType<EnhancedAgent['getStats']>> => {
    const currentApiKey = config.getApiKey() || options.apiKey || '';
    const currentBaseUrl = config.getBaseUrl() || options.baseUrl;
    if (!currentApiKey) {
      onLine({ type: 'error', text: 'Missing API key. Type /setup to configure Base URL + API key.' });
      throw new Error('Missing API key');
    }

    if (
      !activeAgent ||
      activeCreds.apiKey !== currentApiKey ||
      activeCreds.baseUrl !== currentBaseUrl
    ) {
      activeCreds = { apiKey: currentApiKey, baseUrl: currentBaseUrl };
      activeAgent = createAgentForModel(activeModel, { apiKey: currentApiKey, baseUrl: currentBaseUrl });
      if (currentSession?.messages?.length) {
        activeAgent.setMessages(currentSession.messages);
      }
      activeAgent.setModeFromUser(activeMode, 'Refresh agent after credential change');
      toolExecutor.setMode(activeMode);
    }

    activeAgent.removeAllListeners('event');
    let streamedBuffer = '';
    let streamFlushTimer: ReturnType<typeof setTimeout> | null = null;

    const flushStreamedBuffer = () => {
      if (streamedBuffer.trim()) {
        onLine({ type: 'assistant', text: streamedBuffer.trim() });
        streamedBuffer = '';
      }
    };

    activeAgent.on('event', (event: { type: string; data?: Record<string, unknown> }) => {
      switch (event.type) {
        case 'thinking':
          // Flush any pending streamed text before showing thinking indicator
          flushStreamedBuffer();
          if (streamFlushTimer) { clearTimeout(streamFlushTimer); streamFlushTimer = null; }
          // Thinking messages are visible output — reset the watchdog timer
          opts?.onVisibleOutput?.();
          onLine({
            type: 'info',
            text: (event.data?.message as string) || 'Thinking…',
          });
          break;
        case 'tool_call': {
          // Flush any pending streamed text before showing tool call
          flushStreamedBuffer();
          if (streamFlushTimer) { clearTimeout(streamFlushTimer); streamFlushTimer = null; }
          opts?.onVisibleOutput?.();
          const name = String(event.data?.name ?? 'tool');
          const input = event.data?.input;
          const args = formatToolArgs(name, input);
          onLine({
            type: 'tool',
            text: args ? `${name} — ${args}` : name,
          });
          break;
        }
        case 'tool_result': {
          // Flush any pending streamed text before showing tool result
          flushStreamedBuffer();
          if (streamFlushTimer) { clearTimeout(streamFlushTimer); streamFlushTimer = null; }
          opts?.onVisibleOutput?.();
          const name = String(event.data?.name ?? 'tool');
          const result = event.data?.result;
          const success = event.data?.success !== false;
          if (name === 'run_swarm') {
            onLine({
              type: 'tool_out',
              text: `${name}: ${formatToolOutcome(name, result, success)}`,
            });
            for (const line of formatRunSwarmDetailLines(result)) {
              onLine({ type: 'tool_out', text: line });
            }
          } else {
            onLine({
              type: 'tool_out',
              text: `${name}: ${formatToolOutcome(name, result, success)}`,
            });
          }
          break;
        }
        case 'stream_text':
          opts?.onVisibleOutput?.();
          streamedBuffer += (event.data?.text as string) || '';
          // Accumulate streamed text and flush periodically or when buffer is large.
          // Use a longer interval (2s) to batch more text into fewer "XibeCode:" blocks,
          // reducing the fragmented multi-prefix display seen with fast models.
          if (streamedBuffer.length > 1500) {
            // Large buffer — flush immediately to avoid memory buildup
            if (streamFlushTimer) { clearTimeout(streamFlushTimer); streamFlushTimer = null; }
            flushStreamedBuffer();
          } else if (!streamFlushTimer) {
            streamFlushTimer = setTimeout(() => {
              streamFlushTimer = null;
              flushStreamedBuffer();
            }, 2000);
          }
          break;
        case 'stream_end':
          if (streamFlushTimer) { clearTimeout(streamFlushTimer); streamFlushTimer = null; }
          flushStreamedBuffer();
          break;
        case 'response':
          opts?.onVisibleOutput?.();
          onLine({ type: 'assistant', text: (event.data?.text as string) || '' });
          break;
        case 'error':
          if (isAbortLikeError(event.data?.message) || isAbortLikeError(event.data?.error)) {
            break;
          }
          onLine({
            type: 'error',
            text:
              (event.data?.message as string) ||
              (event.data?.error as string) ||
              'Unknown error',
          });
          break;
        case 'mode_changed': {
          const next = String(event.data?.to ?? '') as AgentMode;
          if (next) {
            activeMode = next;
            toolExecutor.setMode(next);
            modeSink?.(next);
            onLine({ type: 'info', text: `Mode changed to ${next}` });
          }
          break;
        }
        case 'plan_ready':
          onLine({
            type: 'info',
            text: 'Plan written to implementations.md. Say "build" to implement it, or ask for edits.',
          });
          break;
        case 'questions': {
          const qs = event.data?.questions as ParsedQuestion[] | undefined;
          if (qs && qs.length > 0) {
            // Push questions to the UI component via the sink
            questionsSink?.(qs);
          }
          break;
        }
        default:
          break;
      }
    });

    await activeAgent.run(prompt, toolExecutor.getTools(), toolExecutor, {
      images: opts?.images,
      signal: opts?.signal,
    });

    // Write the latest messages to the transcript incrementally.
    // The agent's run() method appends to this.messages; we persist
    // the user prompt and assistant response as separate transcript entries.
    const latestMessages = activeAgent.getMessages();
    if (latestMessages.length > 0) {
      // Write the user prompt that triggered this turn
      const userMsg = latestMessages[latestMessages.length - 2];
      if (userMsg?.role === 'user') {
        await activeAgent.transcriptUserMessage(userMsg);
      }
      // Write the assistant response
      const assistantMsg = latestMessages[latestMessages.length - 1];
      if (assistantMsg?.role === 'assistant') {
        await activeAgent.transcriptAssistantMessage(assistantMsg);
      }
    }

    await onMessagesUpdate(activeAgent.getMessages());
    activeMode = activeAgent.getMode();
    toolExecutor.setMode(activeMode);
    modeSink?.(activeMode);
    return activeAgent.getStats();
  };

  const listBackgroundTasks = async (): Promise<
    Array<{ id: string; status: string; startTime: number; prompt: string }>
  > => {
    const result: any = await toolExecutor.execute('list_background_tasks', {});
    if (result?.success && Array.isArray(result.tasks)) {
      return result.tasks as Array<{ id: string; status: string; startTime: number; prompt: string }>;
    }
    return [];
  };

  const checkBackgroundTask = async (taskId: string): Promise<{ status?: string; lastLine?: string }> => {
    const result: any = await toolExecutor.execute('check_background_task', { task_id: taskId });
    const logs = typeof result?.logs === 'string' ? result.logs : '';
    const lastLine = logs.split('\n').filter(Boolean).slice(-1)[0];
    const status = result?.task?.status;
    return { status, lastLine };
  };

  const modeOptions = (ENABLED_MODES as AgentMode[]).map((id) => ({
    id,
    label: MODE_CONFIG[id].name,
    description: MODE_CONFIG[id].description,
  }));

  const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
  const logsDir = path.join(homeDir, '.xibecode', 'logs');
  await fs.mkdir(logsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const chatLogPath = path.join(logsDir, `chat-${ts}.log`);
  let logChain: Promise<void> = Promise.resolve();
  const appendLogLine = (line: UiLine) => {
    const rendered = formatUiLineForLog(line) + '\n';
    logChain = logChain.then(() => fs.appendFile(chatLogPath, rendered, 'utf8')).catch(() => {});
  };

  // Keep the chat UI alive even if something throws unexpectedly.
  // We surface errors as chat lines instead of crashing the whole process.
  let uiSink: ((line: UiLine) => void) | null = null;
  const registerUiSink = (sink: (line: UiLine) => void) => {
    uiSink = sink;
  };

  // Keep the UI's displayed mode in sync with the tool permission mode.
  let modeSink: ((mode: AgentMode) => void) | null = null;
  const registerModeSink = (sink: (mode: AgentMode) => void) => {
    modeSink = sink;
  };

  // Sink for pushing interactive questions from the agent to the UI component.
  let questionsSink: ((questions: ParsedQuestion[]) => void) | null = null;
  const registerQuestionsSink = (sink: (questions: ParsedQuestion[]) => void) => {
    questionsSink = sink;
  };

  const formatUnknownError = (err: unknown): string => {
    if (err instanceof Error) return err.stack || err.message;
    try {
      return typeof err === 'string' ? err : JSON.stringify(err);
    } catch {
      return String(err);
    }
  };

  const onUnhandledRejection = (reason: unknown) => {
    if (isAbortLikeError(reason)) return;
    uiSink?.({ type: 'error', text: `Unhandled rejection:\n${formatUnknownError(reason)}` });
  };
  const onUncaughtException = (err: unknown) => {
    if (isAbortLikeError(err)) return;
    uiSink?.({ type: 'error', text: `Uncaught exception:\n${formatUnknownError(err)}` });
  };

  process.on('unhandledRejection', onUnhandledRejection);
  process.on('uncaughtException', onUncaughtException);

  const sessionManager = new SessionManager();
  let currentSessionId = options.sessionId;
  let currentSession: ChatSession | null = null;

  if (!currentSessionId) {
    currentSession = await sessionManager.createSession({
      model,
      cwd: process.cwd(),
    });
    currentSessionId = currentSession.id;
    // Initialize transcript persistence for the agent
    activeAgent?.initTranscript(currentSessionId, process.cwd());
    if (options.initialMessages && options.initialMessages.length > 0) {
      currentSession.messages = options.initialMessages as MessageParam[];
      // Write initial messages to transcript
      for (const msg of options.initialMessages) {
        if (msg.role === 'user') {
          await activeAgent?.transcriptUserMessage(msg as MessageParam);
        } else if (msg.role === 'assistant') {
          await activeAgent?.transcriptAssistantMessage(msg as MessageParam);
        }
      }
    }
  } else {
    currentSession = await sessionManager.loadSession(currentSessionId);
    // Initialize transcript persistence for resumed session
    if (currentSession) {
      activeAgent?.initTranscript(currentSessionId, currentSession.cwd);
      const fileHistorySnapshots = await sessionManager.loadFileHistorySnapshots(currentSessionId);
      if (fileHistorySnapshots.length > 0) {
        toolExecutor.restoreFileHistorySnapshots(fileHistorySnapshots);
      }
    }
  }

  if (currentSession?.messages?.length) {
    activeAgent?.setMessages(currentSession.messages);
  } else if (options.initialMessages && options.initialMessages.length > 0) {
    activeAgent?.setMessages(options.initialMessages as MessageParam[]);
  }

  const onSessionCreated = (sessionId: string) => {
    currentSessionId = sessionId;
    activeAgent?.initTranscript(sessionId, process.cwd());
  };

  const onMessagesUpdate = async (messages: MessageParam[]) => {
    if (currentSessionId && currentSession) {
      currentSession.messages = messages;
      if (messages.length > 0) {
        const firstUserMsg = messages.find((m) => m.role === 'user');
        if (firstUserMsg && typeof firstUserMsg.content === 'string') {
          const title = firstUserMsg.content.trim().slice(0, 60);
          if (title) {
            currentSession.title = title + (firstUserMsg.content.length > 60 ? '…' : '');
          }
        }
      }
      // Use JSONL transcript persistence instead of monolithic JSON save.
      // Each message was already written to the transcript incrementally
      // via transcriptUserMessage/transcriptAssistantMessage in the chat loop.
      // Here we just update the title metadata.
      try {
        await sessionManager.saveSession(currentSession);
      } catch {
        // Transcript writes are best-effort; don't block the chat loop
      }
    }
  };

  const root = createRoot({ exitOnCtrlC: true });

  // ── Memory & Hooks slash-command handlers ──
  const autoMemManager = new AutoMemoryManager({ cwd: process.cwd() });
  const coreSettingsManager = new CoreSettingsManager({ cwd: process.cwd() });
  const hooksMgr = new HooksManager(coreSettingsManager);
  await hooksMgr.loadFromSettingsManager().catch(() => {});

  const onMemoryCommand = (subcmd: string, pushLine: (line: UiLine) => void) => {
    void (async () => {
      try {
        if (subcmd === 'list' || subcmd === '') {
          const memories = await autoMemManager.listMemories();
          if (memories.length === 0) {
            pushLine({ type: 'info', text: 'No memories found for this project. Memories are auto-extracted as you chat.' });
            return;
          }
          pushLine({ type: 'info', text: `Found ${memories.length} memory/memories:` });
          for (const mem of memories.slice(0, 10)) {
            const tags = mem.frontmatter.tags?.length ? ` [${mem.frontmatter.tags.join(', ')}]` : '';
            pushLine({ type: 'info', text: `  ${mem.frontmatter.type}${tags}: ${mem.content.trim().slice(0, 80)}${mem.content.length > 80 ? '...' : ''}` });
          }
          if (memories.length > 10) {
            pushLine({ type: 'info', text: `  ... and ${memories.length - 10} more. Use "xc memory list" to see all.` });
          }
        } else if (subcmd === 'dream') {
          pushLine({ type: 'info', text: 'Running dream consolidation...' });
          const result = await autoMemManager.dream();
          pushLine({ type: 'info', text: `Dream complete: created=${result.created}, merged=${result.merged}, pruned=${result.pruned}` });
        } else if (subcmd === 'path') {
          pushLine({ type: 'info', text: `Memory dir: ${autoMemManager.getMemoryDir()}` });
        } else {
          pushLine({ type: 'info', text: 'Usage: /memory [list|dream|path]. Default: list' });
        }
      } catch (err: any) {
        pushLine({ type: 'error', text: `Memory error: ${err?.message || err}` });
      }
    })();
  };

  const onHooksCommand = (subcmd: string, pushLine: (line: UiLine) => void) => {
    const allHooks = hooksMgr.getAllHooks();
    const flatList: Array<{ event: string; config: any; matcher?: string }> = [];
    for (const [event, hooks] of allHooks) {
      for (const hook of hooks) {
        flatList.push({ event, config: hook.config, matcher: hook.matcher });
      }
    }

    if (subcmd === 'list' || subcmd === '') {
      if (flatList.length === 0) {
        pushLine({ type: 'info', text: 'No hooks configured. Use "xc hooks add" or edit ~/.xibecode/settings.json' });
        return;
      }
      pushLine({ type: 'info', text: `Registered hooks (${flatList.length}):` });
      for (const hook of flatList.slice(0, 10)) {
        const type = 'command' in hook.config ? 'command' : 'prompt' in hook.config ? 'prompt' : 'agent' in hook.config ? 'agent' : 'http' in hook.config ? 'http' : 'function';
        const value = hook.config.command || hook.config.prompt || hook.config.agent || hook.config.http || hook.config.url || '(fn)';
        const matcher = hook.matcher ? ` matcher="${hook.matcher}"` : '';
        pushLine({ type: 'info', text: `  ${hook.event}${matcher} -> ${type}: ${value}` });
      }
    } else {
      pushLine({ type: 'info', text: 'Usage: /hooks [list]. Default: list. Use "xc hooks" CLI for full management.' });
    }
  };

  const onCloudPullCommand = async (
    argsRaw: string,
    pushLine: (line: UiLine) => void,
  ): Promise<void> => {
    if (!remoteExecution || remoteExecution.strategy !== 'sandbox_full') {
      throw new Error('/cpull is available only in cloud sandbox_full mode.');
    }
    const sessionId = remoteExecution.sessionId?.trim();
    if (!sessionId) {
      throw new Error('No cloud session id found. Start with "xc cloud" before using /cpull.');
    }

    const tokens = argsRaw ? argsRaw.split(/\s+/).filter(Boolean) : [];
    let apply = false;
    let force = false;
    let full = false;
    let output: string | undefined;

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token === '--apply') {
        apply = true;
        continue;
      }
      if (token === '--full') {
        full = true;
        continue;
      }
      if (token === '--force') {
        force = true;
        continue;
      }
      if (token === '--output') {
        const next = tokens[i + 1];
        if (!next || next.startsWith('--')) {
          throw new Error('Usage: /cpull [--apply] [--full] [--force] [--output <path>]');
        }
        output = next;
        i += 1;
        continue;
      }
      throw new Error(`Unknown /cpull option "${token}". Usage: /cpull [--apply] [--full] [--force] [--output <path>]`);
    }

    await cloudPullCommand({
      profile: options.profile,
      session: sessionId,
      apply,
      full,
      force,
      output,
      onStatus: (text) => pushLine({ type: 'info', text }),
    });
  };

  const onCommitCommand = async (
    messageRaw: string,
    pushLine: (line: UiLine) => void,
  ): Promise<void> => {
    pushLine({ type: 'info', text: 'Staging files with git add .' });
    const addResult = await runCommandCapture('git', ['add', '.']);
    if (addResult.code !== 0) {
      throw new Error(`git add failed: ${(addResult.stderr || addResult.stdout || 'unknown error').trim()}`);
    }

    const stagedResult = await runCommandCapture('git', ['diff', '--cached', '--name-only']);
    if (stagedResult.code !== 0) {
      throw new Error(`Failed to inspect staged files: ${(stagedResult.stderr || stagedResult.stdout || 'unknown error').trim()}`);
    }
    const stagedFiles = stagedResult.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (stagedFiles.length === 0) {
      pushLine({ type: 'info', text: 'No staged changes found after git add.' });
      return;
    }

    let commitMessage = messageRaw.trim();
    if (!commitMessage) {
      const statResult = await runCommandCapture('git', ['diff', '--cached', '--shortstat']);
      const shortstat = statResult.code === 0 ? statResult.stdout : '';
      commitMessage = buildAutoCommitMessage(stagedFiles, shortstat);
      pushLine({ type: 'info', text: `Auto commit message: ${commitMessage}` });
    }

    const commitResult = await runCommandCapture('git', ['commit', '-m', commitMessage]);
    if (commitResult.code !== 0) {
      throw new Error((commitResult.stderr || commitResult.stdout || 'git commit failed').trim());
    }

    const firstLine = (commitResult.stdout || commitResult.stderr)
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean);
    pushLine({
      type: 'info',
      text: firstLine ? `Commit created: ${firstLine}` : `Commit created with message: ${commitMessage}`,
    });
  };

  try {
    await renderAndRun(
      root,
      <XibeCodeChatApp
        model={model}
        initialMode={activeMode}
        provider={provider}
        runtimeStatus={runtimeStatus}
        sandboxLabel={sandboxLabel}
        sandboxId={cloudHint.sandboxId}
        previewUrl={cloudHint.previewUrl}
        pullHint={cloudHint.pullHint}
        baseUrl={baseUrl}
        needsFirstRunSetup={needsFirstRunSetup}
        defaultModel={model}
        modeOptions={modeOptions}
        initialRequestFormat={wireFormat}
        customProviderFormat={customProviderFormat}
        profile={options.profile}
        sessionId={currentSessionId}
        initialMessages={options.initialMessages}
        runPrompt={runPrompt}
        listBackgroundTasks={listBackgroundTasks}
        checkBackgroundTask={checkBackgroundTask}
        onUiLine={appendLogLine}
        registerUiSink={registerUiSink}
        registerModeSink={registerModeSink}
        registerQuestionsSink={registerQuestionsSink}
        loadModels={loadModels}
        onModelChange={onModelChange}
        onModeChange={onModeChange}
        onWireFormatChange={onWireFormatChange}
        onSessionCreated={onSessionCreated}
        onMessagesUpdate={onMessagesUpdate}
        getCurrentMessages={() => activeAgent?.getMessages() ?? currentSession?.messages ?? []}
        onMemoryCommand={onMemoryCommand}
        onHooksCommand={onHooksCommand}
        onCloudPullCommand={onCloudPullCommand}
        onCommitCommand={onCommitCommand}
      />,
    );
  } finally {
    process.off('unhandledRejection', onUnhandledRejection);
    process.off('uncaughtException', onUncaughtException);

    if (currentSessionId) {
      console.log('\n');
      console.log('─'.repeat(60));
      console.log(`Session: ${currentSessionId}`);
      console.log(`To resume: xibecode resume ${currentSessionId}`);
      console.log('─'.repeat(60));
    }
  }
}
