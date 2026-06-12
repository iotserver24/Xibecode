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
    <div className="animate-fade-in my-1 group py-1">
      <div className="flex w-full items-center pl-10 pr-2 py-0.5">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity min-w-0"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform text-xibe-text-dim", open && "rotate-90")} />

          <div className="flex items-center gap-2 min-w-0">
            <Wrench className="h-3 w-3 text-xibe-text-dim/70 shrink-0" />
            <span className="font-mono text-[12px] font-medium text-xibe-text-dim truncate">{toolName}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {done ? (
              <CheckCircle2 className="h-3 w-3 text-xibe-text-dim/50" />
            ) : (
              <Loader2 className="h-3 w-3 animate-spin text-xibe-text-dim/50" />
            )}
          </div>
        </button>
      </div>

      {open && (
        <div className="pl-14 pr-4 py-2 space-y-4 animate-fade-in bg-transparent border-l-2 border-xibe-border-subtle ml-[22px] my-2">
          {inputStr && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-xibe-text-dim/60">Input</span>
              </div>
              <pre className="overflow-x-auto text-[12px] font-mono text-xibe-text-dim leading-relaxed bg-transparent">{inputStr}</pre>
            </div>
          )}
          {outputStr && (
            <div className="pt-2">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-xibe-text-dim/60">Output</span>
              </div>
              <pre className="overflow-x-auto text-[12px] font-mono text-xibe-text-dim leading-relaxed bg-transparent max-h-64">{outputStr.length > 5000 ? outputStr.slice(0, 5000) + '\n\n...[Output truncated]...' : outputStr}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default ToolCallCard;
