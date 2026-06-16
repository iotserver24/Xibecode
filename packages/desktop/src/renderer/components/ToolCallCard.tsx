import { useState, memo } from 'react';
import { ChevronRight, Wrench, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  toolName: string;
  toolInput?: any;
  toolOutput?: any;
  timestamp: number;
}

const ToolCallCard = memo(function ToolCallCard({ toolName, toolInput, toolOutput }: Props) {
  const [open, setOpen] = useState(false);
  const done = toolOutput !== undefined;
  const inputStr = toolInput ? (typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput, null, 2)) : '';
  const outputStr = toolOutput ? (typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput, null, 2)) : '';

  return (
    <div className="flex flex-col w-full animate-fade-in my-1 group ml-10">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-2 py-1 rounded text-left hover:bg-xibe-surface-hover transition-colors"
      >
        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform text-xibe-text-dim", open && "rotate-90")} />

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Wrench className="h-3 w-3 text-xibe-text-dim/70 shrink-0" />
          <span className="font-mono text-[12px] font-medium text-xibe-text-secondary truncate">{toolName}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {done ? (
            <div className="flex items-center gap-1 text-xibe-brand-green/80 hover:text-xibe-brand-green px-2 py-0.5 rounded transition-colors">
              <CheckCircle2 className="h-3 w-3" />
              <span className="text-[10px] font-medium uppercase tracking-wider">Done</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xibe-accent hover:text-xibe-text px-2 py-0.5 rounded transition-colors">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-[10px] font-medium uppercase tracking-wider">Running</span>
            </div>
          )}
        </div>
      </button>

      {open && (
        <div className="px-4 py-2 space-y-3 animate-fade-in bg-transparent ml-2 border-l border-xibe-border-subtle">
          {inputStr && (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-xibe-text-dim">Input</span>
              </div>
              <pre className="overflow-x-auto rounded border border-xibe-border-subtle/50 p-2 text-[12px] font-mono text-xibe-text-secondary leading-relaxed bg-transparent">{inputStr}</pre>
            </div>
          )}
          {outputStr && (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-xibe-text-dim">Output</span>
              </div>
              <pre className="overflow-x-auto rounded border border-xibe-border-subtle/50 p-2 text-[12px] font-mono text-xibe-text-secondary leading-relaxed max-h-64 bg-transparent">{outputStr.length > 5000 ? outputStr.slice(0, 5000) + '\n\n...[Output truncated]...' : outputStr}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default ToolCallCard;
