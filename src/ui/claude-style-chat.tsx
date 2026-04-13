import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TextInput from 'ink-text-input';
import { Box, Text, createRoot, useApp, useInput } from '../ink.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { TuiThemeColorKey } from '../utils/tui-theme.js';
import { ConfigManager, ProviderType, PROVIDER_CONFIGS } from '../utils/config.js';
import { EnhancedAgent } from '../core/agent.js';
import { CodingToolExecutor } from '../core/tools.js';
import { MCPClientManager } from '../core/mcp-client.js';
import { SkillManager } from '../core/skills.js';
import { AgentMode, ENABLED_MODES, MODE_CONFIG } from '../core/modes.js';
import { renderAndRun } from '../interactiveHelpers.js';
import { AssistantMarkdown } from '../components/AssistantMarkdown.js';
import { formatToolArgs, formatToolOutcome, formatRunSwarmDetailLines } from '../utils/tool-display.js';
import { SPINNER_VERBS } from '../constants/spinnerVerbs.js';

export type ChatOptions = {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  provider?: string;
  costMode?: string;
  noWebui?: boolean;
  profile?: string;
};

type UiLineType = 'user' | 'assistant' | 'tool' | 'tool_out' | 'info' | 'error';
type UiLine = { type: UiLineType; text: string };
const APP_VERSION = '0.9.6';
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

const QUICK_HELP = ['/help', '/mode', '/format', '/model', '/setup', '/config', '/clear', '/exit'];
const CHAT_COMMANDS: Array<{ name: string; description: string }> = [
  { name: '/help', description: 'Show available shortcuts and usage hints' },
  { name: '/mode', description: 'Switch agent mode from an interactive picker' },
  { name: '/clear', description: 'Clear the current chat transcript' },
  { name: '/format', description: 'Switch wire format: auto | anthropic | openai' },
  { name: '/model', description: 'Fetch and switch available models for this provider' },
  { name: '/setup', description: 'Guided setup (set API key, then pick provider/model)' },
  { name: '/config', description: 'Show current config and quick config hints' },
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
  baseUrl?: string;
  defaultModel: string;
  modeOptions: Array<{ id: AgentMode; label: string; description: string }>;
  initialRequestFormat: RequestWireFormat;
  customProviderFormat?: 'openai' | 'anthropic';
  profile?: string;
  runPrompt: (
    prompt: string,
    onLine: (line: UiLine) => void,
  ) => Promise<ReturnType<EnhancedAgent['getStats']>>;
  listBackgroundTasks: () => Promise<
    Array<{ id: string; status: string; startTime: number; prompt: string }>
  >;
  checkBackgroundTask: (taskId: string) => Promise<{ status?: string; lastLine?: string }>;
  onUiLine?: (line: UiLine) => void;
  getLiveStats?: () => ReturnType<EnhancedAgent['getStats']>;
  loadModels: () => Promise<string[]>;
  onModelChange: (nextModel: string) => Promise<void>;
  onModeChange: (nextMode: AgentMode) => Promise<void>;
  onWireFormatChange: (format: RequestWireFormat) => void;
}) {
  const { exit } = useApp();
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [runElapsedMs, setRunElapsedMs] = useState<number>(0);
  const [liveStats, setLiveStats] = useState<ReturnType<EnhancedAgent['getStats']> | null>(null);
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

  type SetupStep = 'idle' | 'baseUrl' | 'apiKey' | 'loadingModels' | 'pickModel';
  const [setupStep, setSetupStep] = useState<SetupStep>('idle');
  const [setupBaseUrl, setSetupBaseUrl] = useState<string>('');
  const [setupApiKey, setSetupApiKey] = useState<string>('');
  const [setupModels, setSetupModels] = useState<string[]>([]);
  const [setupModelPickerOpen, setSetupModelPickerOpen] = useState(false);
  const [setupSelectedModelIndex, setSetupSelectedModelIndex] = useState(0);

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

  const [workSpinnerFrame, setWorkSpinnerFrame] = useState(0);
  const [workVerbIndex, setWorkVerbIndex] = useState(0);
  const [lines, setLines] = useState<UiLine[]>([
    {
      type: 'info',
      text: 'XibeCode interactive session. Type /exit to quit, /clear to reset the transcript.',
    },
    { type: 'info', text: 'Tip: press p to pause/resume live updates (for copying).' },
  ]);

  const pausedBuffer = useRef<UiLine[]>([]);
  const pushLine = useCallback(
    (line: UiLine) => {
      props.onUiLine?.(line);
      if (paused) {
        pausedBuffer.current.push(line);
        return;
      }
      // Keep a much larger in-memory transcript so context doesn't vanish quickly.
      setLines((prev: UiLine[]) => [...prev.slice(-5000), line]);
    },
    [paused, props],
  );

  const togglePaused = useCallback(() => {
    setPaused((prev) => {
      const next = !prev;
      if (prev && pausedBuffer.current.length > 0) {
        const buffered = pausedBuffer.current.splice(0, pausedBuffer.current.length);
        setLines((current) => [...current.slice(-5000), ...buffered].slice(-5000));
      }
      return next;
    });
  }, []);

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
    }, 90);
    return () => clearInterval(id);
  }, [isRunning]);

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
    if (!isRunning || !props.getLiveStats) return;
    const id = setInterval(() => {
      try {
        setLiveStats(props.getLiveStats!());
      } catch {
        // ignore
      }
    }, 1000);
    return () => clearInterval(id);
  }, [isRunning, props]);

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
    const requestFormat =
      (config.get('requestFormat') as RequestWireFormat | undefined) ?? 'auto';
    pushLine({
      type: 'info',
      text: `Config: apiKey=${apiKeyPresent ? 'set' : 'missing'} | provider=${provider || 'auto'} | model=${model || '(none)'} | costMode=${costMode} | baseUrl=${baseUrl || '(default)'} | format=${requestFormat}`,
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
    setSetupStep('baseUrl');
    setSetupBaseUrl('');
    setSetupApiKey('');
    setSetupModels([]);
    setSetupModelPickerOpen(false);
    setSetupSelectedModelIndex(0);
    pushLine({
      type: 'info',
      text: 'Setup 1/3 — enter Base URL (OpenAI format). Example: https://api.openai.com/v1',
    });
  }, [pushLine]);

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

  const onSubmit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || isRunning) return;

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
              text: 'Setup 1/3 — enter Base URL (OpenAI format). Example: https://api.openai.com/v1',
            });
            return;
          }
          const nextBase = trimmed.replace(/\/+$/, '');
          setSetupBaseUrl(nextBase);
          config.set('baseUrl', nextBase);
          // Explicitly force OpenAI wire format for this workflow.
          config.set('requestFormat', 'openai');
          config.set('provider', 'openai');
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
        exit();
        return;
      }

      if (resolvedInput === '/clear') {
        setLines([{ type: 'info', text: 'Cleared transcript.' }]);
        return;
      }

      if (resolvedInput === '/help') {
        setLines((prev: UiLine[]) => [
          ...prev,
          { type: 'info', text: `Shortcuts: ${QUICK_HELP.join(' · ')}` },
          {
            type: 'info',
            text: 'Press Ctrl+C to quit. Type any prompt and XibeCode will run agent mode.',
          },
        ]);
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

      pushLine({ type: 'user', text: resolvedInput });
      setIsRunning(true);
      try {
        const startedAt = Date.now();
        const stats = await props.runPrompt(resolvedInput, pushLine);
        const elapsedMs = Date.now() - startedAt;
        const seconds = (elapsedMs / 1000).toFixed(1);
        pushLine({
          type: 'info',
          text:
            `Done in ${seconds}s · ` +
            `tokens ${stats.inputTokens} in / ${stats.outputTokens} out / ${stats.totalTokens} total` +
            (stats.costLabel ? ` · cost ${stats.costLabel}` : ''),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        pushLine({ type: 'error', text: message });
      } finally {
        setIsRunning(false);
      }
    },
    [
      applyModel,
      beginConfigMenu,
      configPrompt.kind,
      ensureModelsLoaded,
      exit,
      isRunning,
      props,
      pushLine,
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

  useInput((inputKey, key) => {
    if (key.ctrl && inputKey === 'c') {
      exit();
      return;
    }

    if (!key.ctrl && !key.meta && !key.shift && (inputKey === 'p' || inputKey === 'P')) {
      togglePaused();
      return;
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
        const config = new ConfigManager(props.profile);
        config.set('model', picked);
        pushLine({ type: 'info', text: `Model set to: ${picked}` });
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
    const pauseLabel = paused ? ' | PAUSED' : '';
    const elapsed = runElapsedMs ? ` | elapsed ${(runElapsedMs / 1000).toFixed(1)}s` : '';
    const tokens =
      liveStats
        ? ` | tokens ${liveStats.inputTokens}/${liveStats.outputTokens}/${liveStats.totalTokens}`
        : '';
    return `model: ${activeModel} | format: ${wireFormat} | mode: ${activeMode} | provider: ${props.provider || 'auto'} | ${tail}${pauseLabel}${elapsed}${tokens}`;
  }, [
    activeModel,
    activeMode,
    props.provider,
    isRunning,
    wireFormat,
    workSpinnerFrame,
    workVerbPhrase,
    paused,
    runElapsedMs,
    liveStats,
  ]);
  const showWelcome = lines.length <= 1;
  const providerName = props.provider ? props.provider.toUpperCase() : 'AUTO';
  const divider = '─'.repeat(98);
  const chatPanelHeight = showWelcome ? 12 : 22;

  return (
    <Box flexDirection="column" paddingX={1}>
      {showWelcome && (
        <Box flexDirection="column" marginBottom={1}>
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
            <Text color="suggestion">◈ cloud</Text>
            <Text color="inactive">  Ready — type </Text>
            <Text color="claude">/help</Text>
            <Text color="inactive"> to begin</Text>
          </Box>
          <Text color="inactive">
            xibecode <Text color="claude">v{APP_VERSION}</Text>
          </Text>
        </Box>
      )}

      <Text dimColor>{status}</Text>
      <Text color="subtle">{divider}</Text>
      <Box
        marginTop={1}
        borderStyle="round"
        borderColor="promptBorder"
        flexDirection="column"
        paddingX={1}
        minHeight={chatPanelHeight}
      >
        {lines.slice(-chatPanelHeight + 2).map((line: UiLine, index: number) =>
          line.type === 'assistant' ? (
            <Box
              key={`${index}-assistant-${line.text.length}-${line.text.slice(0, 12)}`}
              flexDirection="column"
              marginBottom={1}
            >
              <Text bold color={prefixColorKey('assistant')}>
                {prefixForType('assistant')}:
              </Text>
              <Box marginLeft={2} flexDirection="column">
                <AssistantMarkdown content={line.text} />
              </Box>
            </Box>
          ) : (
            <React.Fragment key={`${index}-${line.type}-${line.text.slice(0, 24)}`}>
              <Text>
                <Text bold color={prefixColorKey(line.type)}>
                  {prefixForType(line.type)}:{' '}
                </Text>
                <Text color={lineColorKey(line.type)}>{line.text}</Text>
              </Text>
            </React.Fragment>
          ),
        )}
      </Box>
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
      <Box marginTop={1} borderStyle="round" borderColor="claude" paddingX={1}>
        <Text color="claude">{'> '}</Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={onSubmit}
          placeholder={isRunning ? 'Waiting for response…' : 'Message XibeCode…'}
        />
      </Box>
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
            filteredModels.slice(0, 14).map((modelName, index) => (
              <React.Fragment key={modelName}>
                <Text>
                  <Text color={index === selectedModelIndex ? 'claude' : 'inactive'}>
                    {index === selectedModelIndex ? '▸ ' : '  '}
                  </Text>
                  <Text color={index === selectedModelIndex ? 'claude' : 'text'}>
                    {modelName}
                  </Text>
                </Text>
              </React.Fragment>
            ))
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
            setupModels.slice(0, 14).map((modelName, index) => (
              <React.Fragment key={modelName}>
                <Text>
                  <Text color={index === setupSelectedModelIndex ? 'claude' : 'inactive'}>
                    {index === setupSelectedModelIndex ? '▸ ' : '  '}
                  </Text>
                  <Text color={index === setupSelectedModelIndex ? 'claude' : 'text'}>
                    {modelName}
                  </Text>
                </Text>
              </React.Fragment>
            ))
          )}
          <Text color="subtle">↑/↓ navigate • Enter apply • Esc cancel</Text>
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
  const config = new ConfigManager(options.profile);
  const apiKey = options.apiKey || config.getApiKey();
  if (!apiKey) {
    throw new Error('No API key found. Run xibecode config --set-key YOUR_KEY');
  }

  const useEconomy = (options.costMode || config.getCostMode()) === 'economy';
  const model = options.model || config.getModel(useEconomy);
  const baseUrl = options.baseUrl || config.getBaseUrl();
  const provider: ProviderType | undefined =
    (options.provider as ProviderType | undefined) || config.get('provider');

  const skillManager = new SkillManager(process.cwd(), apiKey, baseUrl, model, provider);
  await skillManager.loadSkills();
  const defaultSkillsPrompt = await skillManager.buildDefaultSkillsPromptForTask('', process.cwd());

  const mcpClientManager = new MCPClientManager();
  const toolExecutor = new CodingToolExecutor(process.cwd(), { mcpClientManager, skillManager });
  let wireFormat: RequestWireFormat = config.get('requestFormat') ?? 'auto';
  const customProviderFormat = config.get('customProviderFormat');
  const createAgentForModel = (modelName: string): EnhancedAgent =>
    new EnhancedAgent(
      {
        apiKey,
        baseUrl,
        model: modelName,
        maxIterations: 150,
        verbose: false,
        provider,
        customProviderFormat,
        requestFormat: wireFormat,
        defaultSkillsPrompt,
      },
      provider,
    );
  let activeAgent = createAgentForModel(model);
  let activeModel = model;
  let activeMode: AgentMode = 'agent';
  activeAgent.setModeFromUser('agent', 'Default start mode');
  toolExecutor.setMode(activeMode);

  const onModelChange = async (nextModel: string): Promise<void> => {
    if (nextModel === activeModel) return;
    activeAgent.removeAllListeners('event');
    activeModel = nextModel;
    config.set('model', nextModel);
    activeAgent = createAgentForModel(nextModel);
    activeAgent.setModeFromUser(activeMode, 'Preserve user-selected mode after model switch');
    toolExecutor.setMode(activeMode);
  };

  const onModeChange = async (nextMode: AgentMode): Promise<void> => {
    activeMode = nextMode;
    activeAgent.setModeFromUser(nextMode, 'User selected /mode in chat');
    toolExecutor.setMode(nextMode);
  };

  const onWireFormatChange = (next: RequestWireFormat): void => {
    wireFormat = next;
    if (next === 'auto') {
      config.delete('requestFormat');
    } else {
      config.set('requestFormat', next);
    }
    activeAgent.removeAllListeners('event');
    activeAgent = createAgentForModel(activeModel);
  };

  const loadModels = async (): Promise<string[]> => {
    const fallbackBaseUrl =
      provider && provider !== 'custom'
        ? PROVIDER_CONFIGS[provider as keyof typeof PROVIDER_CONFIGS]?.baseUrl
        : undefined;
    const resolvedBaseUrl = baseUrl || fallbackBaseUrl;
    const normalizedBase = (resolvedBaseUrl || '').replace(/\/+$/, '');

    const response = await fetch(`${normalizedBase}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
  ): Promise<ReturnType<EnhancedAgent['getStats']>> => {
    activeAgent.removeAllListeners('event');
    let streamedBuffer = '';

    activeAgent.on('event', (event: { type: string; data?: Record<string, unknown> }) => {
      switch (event.type) {
        case 'thinking':
          onLine({
            type: 'info',
            text: (event.data?.message as string) || 'Thinking…',
          });
          break;
        case 'tool_call': {
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
          streamedBuffer += (event.data?.text as string) || '';
          break;
        case 'stream_end':
          if (streamedBuffer.trim()) {
            onLine({ type: 'assistant', text: streamedBuffer.trim() });
          }
          streamedBuffer = '';
          break;
        case 'response':
          onLine({ type: 'assistant', text: (event.data?.text as string) || '' });
          break;
        case 'error':
          onLine({
            type: 'error',
            text:
              (event.data?.message as string) ||
              (event.data?.error as string) ||
              'Unknown error',
          });
          break;
        default:
          break;
      }
    });

    await activeAgent.run(prompt, toolExecutor.getTools(), toolExecutor);
    activeMode = activeAgent.getMode();
    toolExecutor.setMode(activeMode);
    return activeAgent.getStats();
  };

  const getLiveStats = (): ReturnType<EnhancedAgent['getStats']> => activeAgent.getStats();

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

  const root = createRoot({ exitOnCtrlC: true });
  await renderAndRun(
    root,
    <XibeCodeChatApp
      model={model}
      initialMode={activeMode}
      provider={provider}
      baseUrl={baseUrl}
      defaultModel={model}
      modeOptions={modeOptions}
      initialRequestFormat={wireFormat}
      customProviderFormat={customProviderFormat}
      profile={options.profile}
      runPrompt={runPrompt}
      getLiveStats={getLiveStats}
      listBackgroundTasks={listBackgroundTasks}
      checkBackgroundTask={checkBackgroundTask}
      onUiLine={appendLogLine}
      loadModels={loadModels}
      onModelChange={onModelChange}
      onModeChange={onModeChange}
      onWireFormatChange={onWireFormatChange}
    />,
  );
}
