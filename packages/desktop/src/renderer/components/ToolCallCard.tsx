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
    <div className="flex animate-fade-in w-full group py-1.5 ml-10">
      <div className="flex-1 border-l-2 border-xibe-border-subtle pl-4 min-w-0">
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-3 py-1 text-left hover:text-xibe-text transition-colors text-xibe-text-dim group/btn"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform text-xibe-text-dim/50 group-hover/btn:text-xibe-text-dim", open && "rotate-90")} />

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-mono text-[13px] text-xibe-text-secondary truncate">{toolName}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {done ? (
              <div className="flex items-center gap-1 text-xibe-text-dim">
                <span className="text-[11px] font-medium tracking-wide">Done</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xibe-text-secondary">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-[11px] font-medium tracking-wide">Running</span>
              </div>
            )}
          </div>
        </button>

        {open && (
          <div className="mt-2 space-y-4 animate-fade-in">
            {inputStr && (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-widest text-xibe-text-dim/70 mb-1.5">Input</div>
                <pre className="overflow-x-auto rounded-md bg-transparent border border-xibe-border-subtle p-2.5 text-[12px] font-mono text-xibe-text-secondary leading-relaxed">{inputStr}</pre>
              </div>
            )}
            {outputStr && (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-widest text-xibe-text-dim/70 mb-1.5">Output</div>
                <pre className="overflow-x-auto rounded-md bg-transparent border border-xibe-border-subtle p-2.5 text-[12px] font-mono text-xibe-text-dim leading-relaxed max-h-64">{outputStr.length > 5000 ? outputStr.slice(0, 5000) + '\n\n...[Output truncated]...' : outputStr}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default ToolCallCard;
