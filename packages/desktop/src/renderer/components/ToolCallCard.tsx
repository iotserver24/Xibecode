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
    <div className="animate-fade-in my-1.5 group pl-[30px]">
      <div className="border-l-2 border-xibe-border-subtle/50 pl-4 py-1">
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-2 text-left hover:bg-xibe-surface-hover/50 rounded px-1 -ml-1 transition-colors"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform text-xibe-text-dim", open && "rotate-90")} />

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-mono text-[12px] font-medium text-xibe-text-dim truncate">{toolName}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {done ? (
              <div className="flex items-center gap-1 text-xibe-text-dim">
                <CheckCircle2 className="h-3 w-3" />
                <span className="text-[10px] uppercase tracking-wider">Done</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xibe-text">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-[10px] uppercase tracking-wider">Running</span>
              </div>
            )}
          </div>
        </button>

        {open && (
          <div className="mt-2 space-y-3 animate-fade-in pl-1">
            {inputStr && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-xibe-text-dim mb-1 block">Input</span>
                <pre className="overflow-x-auto rounded-sm bg-transparent border-y border-xibe-border-subtle/30 py-2 px-0 text-[11px] font-mono text-xibe-text-secondary leading-relaxed">{inputStr}</pre>
              </div>
            )}
            {outputStr && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-xibe-text-dim mb-1 block">Output</span>
                <pre className="overflow-x-auto rounded-sm bg-transparent border-y border-xibe-border-subtle/30 py-2 px-0 text-[11px] font-mono text-xibe-text-dim leading-relaxed max-h-64">{outputStr.length > 5000 ? outputStr.slice(0, 5000) + '\n\n...[Output truncated]...' : outputStr}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default ToolCallCard;
