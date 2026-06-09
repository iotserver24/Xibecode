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
    <div className="flex flex-col border-l-2 border-xibe-border/40 pl-3 ml-3 my-1 animate-fade-in group">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-2.5 py-1 text-left transition-colors"
      >
        <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform text-xibe-text-dim", open && "rotate-90")} />

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Wrench className="h-3.5 w-3.5 text-xibe-text-dim/70 shrink-0" />
          <span className="font-mono text-[13px] font-medium text-xibe-brand-blue truncate">{toolName}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {done ? (
            <div className="flex items-center gap-1 text-xibe-text-dim/80 px-2 py-0.5">
              <CheckCircle2 className="h-3 w-3" />
              <span className="text-[10px] font-medium uppercase tracking-wider">Done</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xibe-text-dim px-2 py-0.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-[10px] font-medium uppercase tracking-wider">Running</span>
            </div>
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-xibe-border-subtle px-4 py-3 space-y-4 animate-fade-in bg-transparent">
          {inputStr && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-xibe-text-dim">Input</span>
                <div className="h-px flex-1 bg-xibe-border-subtle/50" />
              </div>
              <pre className="overflow-x-auto text-[12px] font-mono text-xibe-text leading-relaxed">{inputStr}</pre>
            </div>
          )}
          {outputStr && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-xibe-text-dim">Output</span>
                <div className="h-px flex-1 bg-xibe-border-subtle/50" />
              </div>
              <pre className="overflow-x-auto text-[12px] font-mono text-xibe-text-secondary leading-relaxed max-h-64">{outputStr.length > 5000 ? outputStr.slice(0, 5000) + '\n\n...[Output truncated]...' : outputStr}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default ToolCallCard;
