import { useState, useRef, useEffect, useMemo, memo } from 'react';
import { Send, Terminal, Zap, BookOpen } from 'lucide-react';
import type { ChatMessage } from '../App';
import type { ModeState } from '../../preload/index';
import MessageBubble from './MessageBubble';
import ToolCallCard from './ToolCallCard';
import { cn } from '../lib/utils';
import { useRunElapsed } from '../hooks/useRunElapsed';

const ChatPanelTimer = memo(function ChatPanelTimer({ isRunning }: { isRunning: boolean }) {
  const runElapsed = useRunElapsed(isRunning);
  if (runElapsed <= 0) return null;
  return <span className="text-xibe-text-dim/40 tabular-nums">({(runElapsed / 1000).toFixed(1)}s)</span>;
});

const CHAT_COMMANDS = [
  { name: '/help', description: 'Show available shortcuts' },
  { name: '/mode', description: 'Switch agent mode' },
  { name: '/clear', description: 'Clear chat transcript' },
  { name: '/format', description: 'Switch wire format' },
  { name: '/model', description: 'Switch model' },
  { name: '/setup', description: 'Guided setup' },
  { name: '/config', description: 'Open settings' },
  { name: '/donate', description: 'Open donation page' },
  { name: '/sponsor', description: 'Open sponsorship page' },
  { name: '/exit', description: 'Exit application' },
];

const MODES = [
  { id: 'agent', label: 'Agent' },
  { id: 'plan', label: 'Plan' },
  { id: 'review', label: 'Review' },
];

/** Center column: outer row centers the inner max-width block (reliable inside nested flex). */
const CHAT_GUTTER = 'flex w-full justify-center px-4 sm:px-6';
const CHAT_WIDTH = 'w-full min-w-0 max-w-3xl';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  onCommand: (cmd: string, arg?: string) => void;
  isRunning: boolean;
  spinnerVerb: string;
  activeModel: string;
  activeProvider: string;
  wireFormat: string;
  appVersion: string;
  needsSetup: boolean;
  onOpenSetup: () => void;
  onOpenCommandPalette: () => void;
  modeState: ModeState;
  onModeSwitch: (mode: string, reason: string) => void;
}

export default function ChatPanel({
  messages, onSendMessage, onCommand, isRunning, spinnerVerb,
  activeModel, activeProvider, wireFormat, appVersion, needsSetup, onOpenSetup, onOpenCommandPalette,
  modeState, onModeSwitch,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [selectedCmd, setSelectedCmd] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const isSlashMode = input.startsWith('/');
  const filteredCmds = CHAT_COMMANDS.filter((c) => c.name.toLowerCase().startsWith(input.toLowerCase()));
  useEffect(() => { setSelectedCmd(0); }, [input]);

  const submit = () => {
    const t = input.trim();
    if (!t || isRunning) return;

    if (isSlashMode) {
      const exact = CHAT_COMMANDS.find((c) => c.name.toLowerCase() === t.toLowerCase());
      const match = exact || filteredCmds[selectedCmd];
      if (match) {
        const arg = t.includes(' ') ? t.split(' ').slice(1).join(' ') : undefined;
        onCommand(match.name, arg);
        setInput('');
        return;
      }
    }

    onSendMessage(t);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  // ⚡ Bolt: Memoize the mapping of messages to prevent O(N) VDOM recreation on frequent timer ticks (e.g. runElapsed)
  const renderedMessages = useMemo(() => {
    return messages.map((msg) =>
      msg.role === 'tool' && msg.toolName ? (
        <ToolCallCard key={msg.id} toolName={msg.toolName} toolInput={msg.toolInput} toolOutput={msg.toolOutput} timestamp={msg.timestamp} />
      ) : msg.role === 'info' ? (
        <div key={msg.id} className="flex justify-center py-2">
          <span className="text-[11px] font-medium text-xibe-text-dim bg-xibe-surface px-3 py-1 rounded-full border border-xibe-border-subtle">{msg.content}</span>
        </div>
      ) : msg.role === 'error' ? (
        <div key={msg.id} className="text-sm text-xibe-error bg-xibe-error/10 border border-xibe-error/20 rounded-xl px-4 py-3">{msg.content}</div>
      ) : (
        <MessageBubble key={msg.id} role={msg.role as 'user' | 'assistant'} content={msg.content} isStreaming={msg.isStreaming} timestamp={msg.timestamp} />
      ),
    );
  }, [messages]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Messages area — min-h-0 lets this shrink so the composer stays at the bottom without overlapping */}
      <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth">
        {messages.length === 0 ? (
          <div className={`min-h-full ${CHAT_GUTTER}`}>
            <div className={`${CHAT_WIDTH} animate-fade-in flex min-h-full flex-col items-center justify-center text-center`}>
              <div className="mb-8">
                <div className="mx-auto w-12 h-12 flex items-center justify-center mb-4">
                  <Terminal className="h-6 w-6 text-xibe-text" />
                </div>
                <h1 className="text-3xl font-semibold text-xibe-text tracking-tight">How can I help you today?</h1>
                <p className="text-sm text-xibe-text-dim mt-2 max-w-md mx-auto">I can write code, fix bugs, explain concepts, and help you navigate your codebase.</p>
              </div>

              {needsSetup ? (
                <button onClick={onOpenSetup} className="rounded-full bg-xibe-accent px-8 py-2.5 text-sm font-medium text-xibe-bg hover:bg-xibe-accent-hover transition-colors">
                  Complete Setup
                </button>
              ) : (
                <div className="w-full max-w-2xl space-y-4">
                  <div className="flex justify-center gap-2 mb-6">
                    {MODES.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => onModeSwitch(m.id, `Switched to ${m.label}`)}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200",
                          modeState.current === m.id
                            ? "bg-xibe-surface text-xibe-text"
                            : "text-xibe-text-dim hover:text-xibe-text hover:bg-xibe-surface"
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                    {[
                      { text: 'Build a REST API', icon: <Zap className="h-4 w-4 text-xibe-text-dim" /> },
                      { text: 'Fix a bug', icon: <BookOpen className="h-4 w-4 text-xibe-text-dim" /> },
                      { text: 'Set up a project', icon: <Terminal className="h-4 w-4 text-xibe-text-dim" /> },
                      { text: 'Write unit tests', icon: <BookOpen className="h-4 w-4 text-xibe-text-dim" /> }
                    ].map((q) => (
                      <button
                        key={q.text}
                        onClick={() => onSendMessage(q.text)}
                        className="group flex items-center gap-3 rounded-lg bg-xibe-surface px-4 py-3 text-sm text-xibe-text-secondary hover:bg-xibe-surface-hover hover:text-xibe-text transition-colors"
                      >
                        <div className="rounded-lg p-1.5 text-xibe-text-dim group-hover:text-xibe-text transition-colors">
                          {q.icon}
                        </div>
                        {q.text}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className={CHAT_GUTTER}>
            <div className={`${CHAT_WIDTH} space-y-6 py-8`}>
              {renderedMessages}
              {isRunning && (
                <div className="flex items-center gap-2 text-xs text-xibe-text-dim animate-fade-in pl-2">
                  <div className="flex gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-xibe-text-dim/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-xibe-text-dim/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-xibe-text-dim/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="ml-1">{spinnerVerb}</span>
                  <ChatPanelTimer isRunning={isRunning} />
                </div>
              )}
              <div ref={bottomRef} className="h-2" />
            </div>
          </div>
        )}
      </div>

      {/* Input area — same centered column as transcript */}
      <div className={`shrink-0 pb-6 pt-2 ${CHAT_GUTTER}`}>
        <div className={`relative ${CHAT_WIDTH}`}>
          {/* Command dropdown above input */}
          {isSlashMode && filteredCmds.length > 0 && (
            <div className="absolute bottom-full mb-2 w-full rounded-xl border border-xibe-border-subtle bg-xibe-surface/95 backdrop-blur-md overflow-hidden animate-slide-up z-20">
              {filteredCmds.slice(0, 6).map((cmd, i) => (
                <button key={cmd.name} onClick={() => { setInput(cmd.name + ' '); inputRef.current?.focus(); }} className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${i === selectedCmd ? 'bg-xibe-surface-hover text-xibe-text' : 'text-xibe-text-secondary hover:bg-xibe-surface-hover/50'}`}>
                  <span className="font-mono font-medium text-xibe-text">{cmd.name}</span>
                  <span className="text-xs text-xibe-text-dim truncate ml-4">{cmd.description}</span>
                </button>
              ))}
            </div>
          )}

          {/* Floating Pill input */}
          <div className="relative flex items-end rounded-lg bg-xibe-surface transition-colors duration-200">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
                if (e.key === 'ArrowUp' && isSlashMode && filteredCmds.length > 0) { e.preventDefault(); setSelectedCmd((s) => (s <= 0 ? filteredCmds.length - 1 : s - 1)); }
                if (e.key === 'ArrowDown' && isSlashMode && filteredCmds.length > 0) { e.preventDefault(); setSelectedCmd((s) => (s >= filteredCmds.length - 1 ? 0 : s + 1)); }
                if (e.key === 'Tab' && isSlashMode && filteredCmds[selectedCmd]) { e.preventDefault(); setInput(filteredCmds[selectedCmd].name + ' '); }
              }}
              placeholder={isRunning ? 'Thinking...' : 'Ask anything or type / for commands'}
              disabled={isRunning}
              rows={1}
              className="flex-1 resize-none bg-transparent pl-4 pr-12 py-3.5 text-[15px] leading-relaxed text-xibe-text placeholder-xibe-text-dim/50 focus:outline-none disabled:opacity-40"
              style={{ minHeight: '52px', maxHeight: '400px' }}
              onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 400) + 'px'; }}
            />
            <button
              onClick={submit}
              disabled={isRunning || !input.trim()}
              className="absolute right-2 bottom-2 h-9 w-9 rounded-lg bg-transparent flex items-center justify-center text-xibe-text hover:bg-xibe-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
            >
              <Send className="h-4 w-4 ml-0.5" />
            </button>
          </div>
          <div className="mt-2 text-center">
            <p className="text-[11px] font-medium text-xibe-text-dim/40">
              <span className="hidden sm:inline">Use <kbd className="font-sans px-1 rounded bg-xibe-surface-raised/50">Enter</kbd> to send, <kbd className="font-sans px-1 rounded bg-xibe-surface-raised/50">Shift + Enter</kbd> for new line</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
