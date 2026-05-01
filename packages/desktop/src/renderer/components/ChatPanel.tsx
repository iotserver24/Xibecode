import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../App';
import type { ModeState } from '../../preload/index';
import MessageBubble from './MessageBubble';
import ToolCallCard from './ToolCallCard';

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

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  onCommand: (cmd: string, arg?: string) => void;
  isRunning: boolean;
  spinnerVerb: string;
  runElapsed: number;
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
  messages, onSendMessage, onCommand, isRunning, spinnerVerb, runElapsed,
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

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4">
            <div className="text-center max-w-sm animate-fade-in">
              <div className="mb-6">
                <h1 className="text-2xl font-semibold text-xibe-text tracking-tight">XibeCode</h1>
                <p className="text-sm text-xibe-text-dim mt-1">Your AI coding assistant</p>
              </div>

              {needsSetup ? (
                <button onClick={onOpenSetup} className="rounded-full bg-xibe-accent px-6 py-2 text-sm font-medium text-xibe-bg hover:bg-xibe-accent-hover transition-colors">
                  Get Started
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-center gap-1.5 mb-4">
                    {MODES.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => onModeSwitch(m.id, `Switched to ${m.label}`)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                          modeState.current === m.id
                            ? 'bg-xibe-accent/15 text-xibe-accent border border-xibe-accent/20'
                            : 'text-xibe-text-dim hover:text-xibe-text hover:bg-xibe-surface-hover border border-transparent'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {['Build a REST API', 'Fix a bug', 'Set up a project', 'Write unit tests'].map((q) => (
                      <button key={q} onClick={() => onSendMessage(q)} className="rounded-xl border border-xibe-border-subtle bg-xibe-surface px-3 py-2 text-xs text-xibe-text-secondary hover:bg-xibe-surface-hover hover:text-xibe-text transition-all text-left">
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
            {messages.map((msg) =>
              msg.role === 'tool' && msg.toolName ? (
                <ToolCallCard key={msg.id} toolName={msg.toolName} toolInput={msg.toolInput} toolOutput={msg.toolOutput} timestamp={msg.timestamp} />
              ) : msg.role === 'info' ? (
                <div key={msg.id} className="text-xs text-xibe-text-dim/60 text-center py-1">{msg.content}</div>
              ) : msg.role === 'error' ? (
                <div key={msg.id} className="text-xs text-xibe-error bg-xibe-error/5 rounded-lg px-3 py-2">{msg.content}</div>
              ) : (
                <MessageBubble key={msg.id} role={msg.role as 'user' | 'assistant'} content={msg.content} isStreaming={msg.isStreaming} timestamp={msg.timestamp} />
              ),
            )}
            {isRunning && (
              <div className="flex items-center gap-2 text-xs text-xibe-text-dim animate-fade-in">
                <span className="inline-block h-1 w-1 rounded-full bg-xibe-brand-blue animate-pulse" />
                <span>{spinnerVerb}</span>
                {runElapsed > 0 && <span className="ml-1 tabular-nums">{(runElapsed / 1000).toFixed(1)}s</span>}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 px-4 pb-4 pt-2">
        <div className="mx-auto max-w-2xl">
          {/* Command dropdown below input */}
          {isSlashMode && filteredCmds.length > 0 && (
            <div className="mb-2 rounded-xl border border-xibe-border bg-xibe-surface overflow-hidden animate-fade-in">
              {filteredCmds.slice(0, 6).map((cmd, i) => (
                <button key={cmd.name} onClick={() => { setInput(cmd.name + ' '); inputRef.current?.focus(); }} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${i === selectedCmd ? 'bg-xibe-accent-muted text-xibe-text' : 'text-xibe-text-secondary hover:bg-xibe-surface-hover'}`}>
                  <span className="font-mono font-medium text-xibe-accent">{cmd.name}</span>
                  <span className="text-xibe-text-dim truncate">{cmd.description}</span>
                </button>
              ))}
            </div>
          )}

          {/* Pill input with send button inside */}
          <div className="relative flex items-end rounded-2xl border border-xibe-border bg-xibe-surface focus-within:border-xibe-border-focus transition-colors">
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
              placeholder={isRunning ? 'Thinking...' : 'Message XibeCode...'}
              disabled={isRunning}
              rows={1}
              className="flex-1 resize-none bg-transparent pl-4 pr-12 py-3 text-sm text-xibe-text placeholder-xibe-text-dim/40 focus:outline-none disabled:opacity-40"
              style={{ minHeight: '44px', maxHeight: '200px' }}
              onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 200) + 'px'; }}
            />
            <button
              onClick={submit}
              disabled={isRunning || !input.trim()}
              className="absolute right-2 bottom-2 h-7 w-7 rounded-lg bg-xibe-accent flex items-center justify-center hover:bg-xibe-accent-hover disabled:opacity-20 disabled:cursor-not-allowed transition-all"
            >
              <svg className="h-3.5 w-3.5 text-xibe-bg" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" /></svg>
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-xibe-text-dim/25">Enter to send &middot; Shift+Enter for new line &middot; / for commands</p>
        </div>
      </div>
    </div>
  );
}
