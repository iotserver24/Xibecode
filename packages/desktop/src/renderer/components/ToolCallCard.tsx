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
    <div className="animate-fade-in my-2 group w-full flex gap-4">
      {/* Align with avatars */}
      <div className="h-6 w-6 rounded flex items-center justify-center shrink-0 mt-0.5">
        <Wrench className="h-4 w-4 text-xibe-text-dim/70" />
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-2 py-1 text-left transition-colors group/btn"
        >
          <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform text-xibe-text-dim group-hover/btn:text-xibe-text", open && "rotate-90")} />

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-mono text-[13px] font-medium text-xibe-brand-blue truncate group-hover/btn:underline">{toolName}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {done ? (
              <div className="flex items-center gap-1 text-xibe-brand-green/80 bg-xibe-brand-green/10 px-2 py-0.5 rounded border border-xibe-brand-green/20">
                <CheckCircle2 className="h-3 w-3" />
                <span className="text-[10px] font-medium uppercase tracking-wider">Done</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xibe-accent bg-xibe-accent/10 px-2 py-0.5 rounded border border-xibe-accent/20">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-[10px] font-medium uppercase tracking-wider">Running</span>
              </div>
            )}
          </div>
        </button>

        {open && (
          <div className="pl-6 py-2 space-y-4 animate-fade-in bg-transparent border-l border-xibe-border-subtle ml-1.5 mt-1">
            {inputStr && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-xibe-text-dim">Input</span>
                </div>
                <pre className="overflow-x-auto rounded bg-transparent p-0 text-[12px] font-mono text-xibe-text leading-relaxed">{inputStr}</pre>
              </div>
            )}
            {outputStr && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-xibe-text-dim">Output</span>
                </div>
                <pre className="overflow-x-auto rounded bg-transparent p-0 text-[12px] font-mono text-xibe-text-secondary leading-relaxed max-h-64">{outputStr.length > 5000 ? outputStr.slice(0, 5000) + '\n\n...[Output truncated]...' : outputStr}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default ToolCallCard;
