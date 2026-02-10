import React, { useEffect, useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import type { EnhancedAgent } from '../../core/agent.js';
import type { CodingToolExecutor } from '../../core/tools.js';
import type { SessionManager, ChatSession, SessionMetadata } from '../../core/session-manager.js';
import type { ConfigManager } from '../../utils/config.js';
import type { MCPClientManager } from '../../core/mcp-client.js';
import type { ContextManager } from '../../core/context.js';
import type { AgentMode } from '../../core/modes.js';

type Role = 'user' | 'assistant' | 'system' | 'tool';

interface Message {
  id: number;
  role: Role;
  text: string;
}

interface AppProps {
  agent: EnhancedAgent;
  toolExecutor: CodingToolExecutor;
  sessionManager: SessionManager;
  initialSession: ChatSession;
  config: ConfigManager;
  mcpClientManager: MCPClientManager;
  contextManager: ContextManager;
  initialThemeName: string;
  initialMode: AgentMode;
  allModes: AgentMode[];
  model: string;
  cwd: string;
}

const InkApp: React.FC<AppProps> = (props: AppProps) => {
  const {
    agent,
    toolExecutor,
    sessionManager,
    initialSession,
    config,
    contextManager,
    initialThemeName,
    initialMode,
    allModes,
    model,
    cwd,
  } = props;

  const { exit } = useApp();

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      role: 'system',
      text: `Welcome to XibeCode TUI (Ink) - model: ${model}`,
    },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [session, setSession] = useState<ChatSession>(initialSession);
  const [mode, setMode] = useState<AgentMode>(initialMode);
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [themeName] = useState(initialThemeName);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<number | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [thinkingFrame, setThinkingFrame] = useState(0);

  const pushMessage = (role: Role, text: string) => {
    setMessages((prev: Message[]) => [
      ...prev,
      {
        id: prev.length ? prev[prev.length - 1].id + 1 : 1,
        role,
        text,
      },
    ]);
  };

  // Wire agent events
  useEffect(() => {
    const handler = (event: any) => {
      switch (event.type) {
        case 'thinking':
          setThinking(true);
          break;
        case 'stream_start':
          pushMessage('assistant', '');
          break;
        case 'stream_text': {
          const chunk: string = event.data.text || '';
          setMessages((prev: Message[]) => {
            if (!prev.length) return prev;
            const last = prev[prev.length - 1];
            if (last.role !== 'assistant') {
              return [...prev, { id: last.id + 1, role: 'assistant', text: chunk }];
            }
            const updated = { ...last, text: last.text + chunk };
            return [...prev.slice(0, -1), updated];
          });
          break;
        }
        case 'stream_end':
          setThinking(false);
          break;
        case 'response':
          pushMessage('assistant', event.data.text);
          setThinking(false);
          break;
        case 'tool_call':
          pushMessage('tool', `-> ${event.data.name}: ${JSON.stringify(event.data.input)}`);
          break;
        case 'tool_result':
          pushMessage(
            'tool',
            `OK ${event.data.name}: ${event.data.success ? 'ok' : 'failed'} ${
              event.data.result?.message ? '- ' + event.data.result.message : ''
            }`,
          );
          break;
        case 'mode_changed':
          setMode(event.data.to);
          pushMessage('system', `Mode changed to ${event.data.to}`);
          break;
        case 'warning':
          pushMessage('system', `[warning] ${event.data.message}`);
          break;
        case 'error':
          pushMessage('system', `[error] ${event.data.message || event.data.error}`);
          setThinking(false);
          break;
        default:
          break;
      }
    };

    agent.on('event', handler);
    return () => {
      agent.off('event', handler as any);
    };
  }, [agent]);
  // Animated thinking indicator (spinner-like)
  useEffect(() => {
    if (!thinking) return;
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    const id = setInterval(() => {
      setThinkingFrame(prev => (prev + 1) % frames.length);
    }, 120);
    return () => clearInterval(id);
  }, [thinking]);

  const handleSubmit = async (forcedInput?: string) => {
    const raw = forcedInput !== undefined ? forcedInput : input;
    const trimmed = raw.trim();
    if (!trimmed) return;

    pushMessage('user', trimmed);
    setInput('');
    setSuggestions([]);
    setSelectedSuggestion(null);

    if (trimmed === '/exit' || trimmed === '/quit') {
      const stats = agent.getStats();
      await sessionManager.saveMessagesAndStats({
        id: session.id,
        messages: agent.getMessages(),
        stats,
      });
      pushMessage('system', 'Goodbye!');
      exit();
      return;
    }

    if (trimmed === '/help') {
      pushMessage(
        'system',
        'Commands: /help, /new, /sessions, /mode, /themes, /models, /export, /compact, /details, /thinking, /exit',
      );
      return;
    }

    if (trimmed === '/new') {
      const newSession = await sessionManager.createSession({ model, cwd });
      setSession(newSession);
      agent.setMessages([]);
      pushMessage('system', `Started new session: ${newSession.title}`);
      return;
    }

    if (trimmed === '/sessions') {
      const sessions = await sessionManager.listSessions();
      if (!sessions.length) {
        pushMessage('system', 'No saved sessions.');
        return;
      }
      const list = sessions
        .map(
          (s: SessionMetadata) =>
            `- ${s.id} - ${s.title} [${s.model}] (${s.updated})${
              s.id === session.id ? '  (current)' : ''
            }`,
        )
        .join('\n');
      pushMessage('system', `Sessions:\n${list}\nUse /session <id> to switch in a future version.`);
      return;
    }

    if (trimmed === '/details') {
      const next = !config.getShowDetails();
      config.set('showDetails', next);
      pushMessage('system', `Details ${next ? 'enabled' : 'disabled'} (affects classic chat UI).`);
      return;
    }

    if (trimmed === '/thinking') {
      const next = !config.getShowThinking();
      config.set('showThinking', next);
      pushMessage('system', `Thinking display ${next ? 'enabled' : 'disabled'} (affects classic chat UI).`);
      return;
    }

    if (trimmed === '/mode') {
      const list = allModes.map((m: AgentMode) => (m === mode ? `- ${m} (current)` : `- ${m}`)).join('\n');
      pushMessage('system', `Available modes:\n${list}\nPress Tab to cycle modes.`);
      return;
    }

    // !command: run shell
    if (trimmed.startsWith('!')) {
      const cmd = trimmed.slice(1).trim();
      if (!cmd) {
        pushMessage('system', 'No command provided after "!". Example: !ls -la');
        return;
      }
      pushMessage('system', `Running command: ${cmd}`);
      const result = await toolExecutor.execute('run_command', { command: cmd, cwd, timeout: 300 });
      const stdout = result.stdout || '';
      const stderr = result.stderr || '';
      if (stdout) pushMessage('system', stdout);
      if (stderr) pushMessage('system', `STDERR:\n${stderr}`);
      const summary = [`Shell command: ${cmd}`, '', stdout, stderr ? `STDERR:\n${stderr}` : ''].join('\n');
      const tools = toolsEnabled ? toolExecutor.getTools() : [];
      await agent.run(summary, tools, toolExecutor);
      const stats = agent.getStats();
      await sessionManager.saveMessagesAndStats({
        id: session.id,
        messages: agent.getMessages(),
        stats,
      });
      return;
    }

    // @path: fuzzy file suggestions via context manager
    if (trimmed.startsWith('@')) {
      const pattern = trimmed.slice(1).trim();
      const glob = pattern ? `**/*${pattern}*` : '**/*';
      try {
        const files = await contextManager.searchFiles(glob, { maxResults: 50 });
        if (!files.length) {
          pushMessage('system', `No files match ${glob}`);
        } else {
          setSuggestions(files);
          pushMessage('system', `Files:\n${files.map((f: string) => `- ${f}`).join('\n')}`);
        }
      } catch (err: any) {
        pushMessage('system', `Error searching files: ${err.message}`);
      }
      return;
    }

    // Normal chat message
    const tools = toolsEnabled ? toolExecutor.getTools() : [];
    try {
      await agent.run(trimmed, tools, toolExecutor);
      const stats = agent.getStats();
      await sessionManager.saveMessagesAndStats({
        id: session.id,
        messages: agent.getMessages(),
        stats,
      });
    } catch (err: any) {
      pushMessage('system', `[error] Failed to process message: ${err.message}`);
    }
  };

  // Input + key handling (Tab for mode, Ctrl+C to exit)
  useInput((inputKey, key) => {
    if (key.ctrl && inputKey === 'c') {
      exit();
    }

    // Scrollback inside the messages box
    if (key.pageUp) {
      setScrollOffset(current => {
        const maxOffset = Math.max(0, messages.length - 40);
        return Math.min(maxOffset, current + 5);
      });
      return;
    }
    if (key.pageDown) {
      setScrollOffset(current => Math.max(0, current - 5));
      return;
    }

    if (key.tab) {
      const idx = allModes.indexOf(mode);
      const next = allModes[(idx + 1 + allModes.length) % allModes.length];
      setMode(next);
      if (typeof (agent as any).setModeFromUser === 'function') {
        (agent as any).setModeFromUser(next, 'User pressed Tab to cycle mode in Ink TUI');
      }
      pushMessage('system', `Mode: ${next} (Tab to cycle)`);
      return;
    }

    // Navigate suggestion list with up/down when typing slash commands
    if (suggestions.length > 0 && input.startsWith('/')) {
      if (key.upArrow) {
        setSelectedSuggestion(current => {
          if (current === null) return 0;
          return current <= 0 ? suggestions.length - 1 : current - 1;
        });
        return;
      }
      if (key.downArrow) {
        setSelectedSuggestion(current => {
          if (current === null) return 0;
          return current >= suggestions.length - 1 ? 0 : current + 1;
        });
        return;
      }
      if (key.return) {
        const index = selectedSuggestion ?? 0;
        const choice = suggestions[index];
        void handleSubmit(choice);
        return;
      }
    }

    // Default Enter handling when no suggestion is active
    if (key.return) {
      void handleSubmit();
    }
  });

  // Suggestion hints for slash commands
  useEffect(() => {
    const trimmed = input.trim();
    if (trimmed.startsWith('/')) {
      const all = [
        '/help',
        '/new',
        '/sessions',
        '/mode',
        '/themes',
        '/models',
        '/export',
        '/compact',
        '/details',
        '/thinking',
        '/exit',
      ];
      const filtered = all.filter((cmd: string) => cmd.startsWith(trimmed));
      setSuggestions(filtered);
      setSelectedSuggestion(filtered.length ? 0 : null);
    } else if (trimmed.startsWith('@')) {
      // suggestions for @ are populated after search
    } else {
      setSuggestions([]);
      setSelectedSuggestion(null);
    }
  }, [input]);
  const visibleCount = 40;
  const maxOffset = Math.max(0, messages.length - visibleCount);
  const statusThinking = thinking ? `thinking ${['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'][thinkingFrame]}` : 'idle';
  const scrollInfo =
    maxOffset === 0 ? 'scroll: end' : `scroll: ${Math.min(scrollOffset, maxOffset)}/${maxOffset}`;

  const statusLine = `model: ${model} | mode: ${mode} | session: ${session.title} | theme: ${themeName} | tools: ${
    toolsEnabled ? 'on' : 'off'
  } | ${statusThinking} | ${scrollInfo}`;

  const renderMessages = () => {
    const total = messages.length;
    const offset = Math.min(scrollOffset, Math.max(0, total - visibleCount));
    const start = Math.max(0, total - visibleCount - offset);
    const end = total - offset;
    const windowMessages = messages.slice(start, end);

    return windowMessages.map((msg: Message) => {
      const label =
        msg.role === 'user'
          ? 'You'
          : msg.role === 'assistant'
          ? 'XibeCode'
          : msg.role === 'tool'
          ? 'Tool'
          : 'System';

      if (msg.role === 'assistant') {
        // Very lightweight markdown-style rendering without external deps
        const lines = msg.text.split('\n');
        const renderedLines = lines.map((line, idx) => {
          const trimmed = line.trim();
          if (trimmed.startsWith('```')) {
            // Fence line: just draw a separator-style line
            return React.createElement(
              Text,
              { key: `code-fence-${msg.id}-${idx}`, color: 'gray' },
              '────────────────',
            );
          }
          if (/^#{1,6}\s+/.test(trimmed)) {
            const content = trimmed.replace(/^#{1,6}\s+/, '');
            return React.createElement(
              Text,
              { key: `h-${msg.id}-${idx}`, color: 'cyanBright', bold: true as any },
              content,
            );
          }
          if (/^[-*]\s+/.test(trimmed)) {
            const content = trimmed.replace(/^[-*]\s+/, '');
            return React.createElement(
              Text,
              { key: `li-${msg.id}-${idx}`, color: 'white' },
              `• ${content}`,
            );
          }
          return React.createElement(
            Text,
            { key: `p-${msg.id}-${idx}`, color: 'white' },
            line,
          );
        });

        return React.createElement(
          Box,
          { key: msg.id, flexDirection: 'column' },
          React.createElement(
            Text,
            { color: 'cyanBright' },
            `${label}:`,
          ),
          ...renderedLines,
        );
      }

      return React.createElement(
        Text,
        { key: msg.id },
        React.createElement(
          Text,
          {
            color:
              msg.role === 'user'
                ? 'greenBright'
                : msg.role === 'tool'
                ? 'magentaBright'
                : 'yellow',
          },
          `${label}: `,
        ),
        React.createElement(Text, null, msg.text),
      );
    });
  };

  const renderSuggestions = () =>
    suggestions.length > 0
      ? React.createElement(
          Box,
          { flexDirection: 'column', paddingX: 1 },
          suggestions.map((s: string, i: number) =>
            React.createElement(
              Text,
              {
                key: i,
                color: i === selectedSuggestion ? 'white' : 'gray',
              },
              `${i === selectedSuggestion ? '› ' : '  '}${s}`,
            ),
          ),
        )
      : null;

  return React.createElement(
    Box,
    { flexDirection: 'column', padding: 1 },
    React.createElement(
      Box,
      null,
      React.createElement(Text, { color: 'cyanBright' }, '⚡ XibeCode'),
      React.createElement(Text, null, ' — Ink TUI '),
      React.createElement(
        Text,
        { color: 'gray' },
        'Press Tab to change mode, /help for commands, Ctrl+C to exit',
      ),
    ),
    React.createElement(
      Box,
      { flexDirection: 'column', flexGrow: 1, marginTop: 1, borderStyle: 'round', borderColor: 'gray' },
      React.createElement(
        Box,
        { flexDirection: 'column', paddingX: 1, paddingY: 0, flexGrow: 1 },
        renderMessages(),
      ),
      React.createElement(
        Box,
        { borderStyle: 'single', borderColor: 'gray', flexDirection: 'column' },
        React.createElement(
          Box,
          { paddingX: 1 },
          React.createElement(Text, { color: 'gray' }, statusLine),
        ),
        renderSuggestions(),
        React.createElement(
          Box,
          { paddingX: 1 },
          React.createElement(Text, { color: 'greenBright' }, '> '),
          React.createElement(TextInput, {
            value: input,
            onChange: setInput,
            // TextInput's onSubmit passes the value, but we already track via state
            onSubmit: () => {
              void handleSubmit();
            },
          }),
        ),
      ),
    ),
  );
};

export default InkApp;

