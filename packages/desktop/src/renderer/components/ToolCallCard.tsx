import { useState } from 'react';

interface Props {
  toolName: string;
  toolInput?: any;
  toolOutput?: any;
  timestamp: number;
}

export default function ToolCallCard({ toolName, toolInput, toolOutput }: Props) {
  const [open, setOpen] = useState(false);
  const done = toolOutput !== undefined;
  const inputStr = toolInput ? (typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput, null, 2)) : '';
  const outputStr = toolOutput ? (typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput, null, 2)) : '';

  return (
    <div className="rounded-lg border border-xibe-border-subtle bg-xibe-surface/50 overflow-hidden animate-fade-in">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-xibe-surface-hover transition-colors">
        <svg className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-90' : ''} text-xibe-text-dim`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        <span className="font-mono text-xs text-xibe-brand-blue">{toolName}</span>
        {done ? (
          <span className="text-[10px] text-xibe-text-dim/40">done</span>
        ) : (
          <span className="text-[10px] text-xibe-accent/60">running</span>
        )}
      </button>
      {open && (
        <div className="border-t border-xibe-border-subtle px-3 py-2 space-y-2 animate-fade-in">
          {inputStr && (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-xibe-text-dim/30">Input</div>
              <pre className="overflow-x-auto rounded-md bg-xibe-bg border border-xibe-border-subtle p-2 text-[11px] font-mono text-xibe-text-dim leading-relaxed">{inputStr}</pre>
            </div>
          )}
          {outputStr && (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-xibe-text-dim/30">Output</div>
              <pre className="overflow-x-auto rounded-md bg-xibe-bg border border-xibe-border-subtle p-2 text-[11px] font-mono text-xibe-text-dim leading-relaxed max-h-48">{outputStr.length > 3000 ? outputStr.slice(0, 3000) + '\n...' : outputStr}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
