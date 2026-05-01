import { useState, useEffect } from 'react';

interface Props {
  onClose: () => void;
  onCommand: (cmd: string, arg?: string) => void;
}

const COMMANDS = [
  { name: '/help', description: 'Show available shortcuts and usage hints' },
  { name: '/mode', description: 'Switch agent mode (agent, plan, review)' },
  { name: '/clear', description: 'Clear the current chat transcript' },
  { name: '/format', description: 'Switch wire format: auto | anthropic | openai' },
  { name: '/model', description: 'Fetch and switch available models for this provider' },
  { name: '/setup', description: 'Guided setup (set API key, then pick provider/model)' },
  { name: '/config', description: 'Show current config and quick config hints' },
  { name: '/donate', description: 'Open the donation page in your browser' },
  { name: '/sponsor', description: 'Open the sponsorship page in your browser' },
  { name: '/exit', description: 'Exit the application' },
];

const MODES = [
  { id: 'agent', label: 'Agent', description: 'Full autonomous coding with all tools' },
  { id: 'plan', label: 'Plan', description: 'Interactive planning with web research' },
  { id: 'review', label: 'Review', description: 'Code review and quality analysis' },
];

const FORMATS = [
  { id: 'auto', label: 'Auto', description: 'Follow provider default' },
  { id: 'openai', label: 'OpenAI', description: 'OpenAI Chat Completions format' },
  { id: 'anthropic', label: 'Anthropic', description: 'Anthropic Messages API format' },
];

export default function CommandPalette({ onClose, onCommand }: Props) {
  const [input, setInput] = useState('/');
  const [selected, setSelected] = useState(0);
  const [subMode, setSubMode] = useState<'commands' | 'mode' | 'format'>('commands');

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const filtered = (() => {
    if (subMode === 'mode') return MODES;
    if (subMode === 'format') return FORMATS;
    return COMMANDS.filter((c) => c.name.toLowerCase().startsWith(input.toLowerCase()) || c.description.toLowerCase().includes(input.toLowerCase().slice(1)));
  })();

  useEffect(() => { setSelected(0); }, [input, subMode]);

  const submit = () => {
    if (subMode === 'mode') {
      const m = MODES[selected];
      if (m) { onCommand('/mode', m.id); onClose(); }
      return;
    }
    if (subMode === 'format') {
      const f = FORMATS[selected];
      if (f) { onCommand('/format', f.id); onClose(); }
      return;
    }
    const cmd = filtered[selected];
    if (!cmd) return;
    const name = (cmd as any).name || (cmd as any).id;
    if (name === '/mode') { setSubMode('mode'); setInput('/mode '); return; }
    if (name === '/format') { setSubMode('format'); setInput('/format '); return; }
    onCommand(name);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-xl border border-xibe-border bg-xibe-surface shadow-2xl overflow-hidden animate-slide-up">
        <div className="flex items-center gap-2 border-b border-xibe-border-subtle px-4 py-3">
          <svg className="h-4 w-4 text-xibe-accent shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
          <input
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setSubMode('commands'); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, filtered.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
              if (e.key === 'Enter') submit();
            }}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-sm text-xibe-text placeholder-xibe-text-dim/40 focus:outline-none"
            autoFocus
          />
          <kbd className="rounded bg-xibe-surface-raised border border-xibe-border px-1.5 py-0.5 text-[10px] text-xibe-text-dim">Esc</kbd>
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-xibe-text-dim">No commands match "{input}"</div>
          ) : (
            filtered.map((item, i) => {
              const name = (item as any).name || (item as any).id;
              const desc = item.description;
              return (
                <button
                  key={name}
                  onClick={submit}
                  onMouseEnter={() => setSelected(i)}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${i === selected ? 'bg-xibe-accent-muted text-xibe-text' : 'text-xibe-text-secondary hover:bg-xibe-surface-hover'}`}
                >
                  {subMode !== 'commands' && (
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${i === selected ? 'bg-xibe-accent' : 'bg-xibe-text-dim/30'}`} />
                  )}
                  <span className="font-mono text-xs font-medium">{name}</span>
                  <span className="text-xs text-xibe-text-dim truncate">{desc}</span>
                </button>
              );
            })
          )}
        </div>
        <div className="border-t border-xibe-border-subtle px-4 py-2 text-[10px] text-xibe-text-dim/50 flex gap-3">
          <span>Up/Down navigate</span>
          <span>Enter select</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  );
}
