import React, { useCallback, useMemo, useState } from 'react';
import TextInput from 'ink-text-input';
import { Box, Text, createRoot, useApp, useInput } from '../ink.js';
import type { TuiThemeColorKey } from '../utils/tui-theme.js';
import { ConfigManager, ProviderType, PROVIDER_CONFIGS } from '../utils/config.js';
import { EnhancedAgent } from '../core/agent.js';
import { CodingToolExecutor } from '../core/tools.js';
import { MCPClientManager } from '../core/mcp-client.js';
import { SkillManager } from '../core/skills.js';
import { AgentMode, MODE_CONFIG } from '../core/modes.js';
import { renderAndRun } from '../interactiveHelpers.js';
import { AssistantMarkdown } from '../components/AssistantMarkdown.js';
import { formatToolArgs, formatToolOutcome } from '../utils/tool-display.js';

export type ChatOptions = {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  provider?: string;
  costMode?: string;
  noWebui?: boolean;
};

type UiLineType = 'user' | 'assistant' | 'tool' | 'tool_out' | 'info' | 'error';
type UiLine = { type: UiLineType; text: string };
const APP_VERSION = '0.9.1';
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
const QUICK_HELP = ['/help', '/mode', '/format', '/model', '/clear', '/exit'];
const CHAT_COMMANDS: Array<{ name: string; description: string }> = [
  { name: '/help', description: 'Show available shortcuts and usage hints' },
  { name: '/mode', description: 'Switch agent mode from an interactive picker' },
  { name: '/clear', description: 'Clear the current chat transcript' },
  { name: '/format', description: 'Switch wire format: auto | anthropic | openai' },
  { name: '/model', description: 'Fetch and switch available models for this provider' },
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

function XibeCodeChatApp(props: {
  model: string;
  initialMode: AgentMode;
  provider?: ProviderType;
  baseUrl?: string;
  defaultModel: string;
  modeOptions: Array<{ id: AgentMode; label: string; description: string }>;
  initialRequestFormat: RequestWireFormat;
  customProviderFormat?: 'openai' | 'anthropic';
  runPrompt: (prompt: string, onLine: (line: UiLine) => void) => Promise<void>;
  loadModels: () => Promise<string[]>;
  onModelChange: (nextModel: string) => Promise<void>;
  onModeChange: (nextMode: AgentMode) => Promise<void>;
  onWireFormatChange: (format: RequestWireFormat) => void;
}) {
  const { exit } = useApp();
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
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
  const [lines, setLines] = useState<UiLine[]>([
    {
      type: 'info',
      text: 'XibeCode interactive session. Type /exit to quit, /clear to reset the transcript.',
    },
  ]);

  const pushLine = useCallback((line: UiLine) => {
    // Keep a much larger in-memory transcript so context doesn't vanish quickly.
    setLines((prev: UiLine[]) => [...prev.slice(-5000), line]);
  }, []);

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
        await props.runPrompt(resolvedInput, pushLine);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        pushLine({ type: 'error', text: message });
      } finally {
        setIsRunning(false);
      }
    },
    [
      applyModel,
      ensureModelsLoaded,
      exit,
      isRunning,
      props,
      pushLine,
      selectedCommandIndex,
      activeMode,
      wireFormat,
      applyMode,
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

  const status = useMemo(
    () =>
      `model: ${activeModel} | format: ${wireFormat} | mode: ${activeMode} | provider: ${props.provider || 'auto'} | ${isRunning ? 'running' : 'idle'}`,
    [activeModel, activeMode, props.provider, isRunning, wireFormat],
  );
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
      <Box marginTop={1} justifyContent="space-between">
        <Text color="inactive">? for shortcuts</Text>
        <Text color="inactive">Ctrl+k to generate command</Text>
      </Box>
    </Box>
  );
}

export async function launchClaudeStyleChat(options: ChatOptions): Promise<void> {
  const config = new ConfigManager();
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
  let activeMode: AgentMode = activeAgent.getMode();
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
    const isAnthropicFormat = isAnthropicWireFormat(
      wireFormat,
      provider,
      customProviderFormat,
    );

    const errors: string[] = [];
    const requestOpenAIModels = async (): Promise<string[]> => {
      const response = await fetch(`${normalizedBase}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error(`OpenAI-style /models failed (${response.status})`);
      }
      const payload = (await response.json()) as { data?: Array<{ id?: string }> };
      return (payload.data ?? [])
        .map((entry) => entry.id ?? '')
        .filter((id) => id.length > 0);
    };

    const requestAnthropicModels = async (): Promise<string[]> => {
      const response = await fetch(`${normalizedBase}/models`, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error(`Anthropic-style /models failed (${response.status})`);
      }
      const payload = (await response.json()) as {
        data?: Array<{ id?: string }>;
        models?: Array<{ id?: string }>;
      };
      const models = payload.data ?? payload.models ?? [];
      return models.map((entry) => entry.id ?? '').filter((id) => id.length > 0);
    };

    const strategies = isAnthropicFormat
      ? [requestAnthropicModels, requestOpenAIModels]
      : [requestOpenAIModels, requestAnthropicModels];

    for (const strategy of strategies) {
      try {
        const models = await strategy();
        if (models.length > 0) {
          return Array.from(new Set(models)).sort();
        }
      } catch (error: unknown) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    throw new Error(
      `Unable to fetch models from ${normalizedBase || 'provider endpoint'}: ${errors.join(' | ')}`,
    );
  };

  const runPrompt = async (prompt: string, onLine: (line: UiLine) => void) => {
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
          onLine({
            type: 'tool_out',
            text: `${name}: ${formatToolOutcome(name, result, success)}`,
          });
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
  };

  const modeOptions = (Object.keys(MODE_CONFIG) as AgentMode[]).map((id) => ({
    id,
    label: MODE_CONFIG[id].name,
    description: MODE_CONFIG[id].description,
  }));

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
      runPrompt={runPrompt}
      loadModels={loadModels}
      onModelChange={onModelChange}
      onModeChange={onModeChange}
      onWireFormatChange={onWireFormatChange}
    />,
  );
}
