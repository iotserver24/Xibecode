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
    <div className="animate-fade-in my-2 group ml-10">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-left hover:text-xibe-text transition-colors text-xibe-text-secondary group-hover:text-xibe-text-secondary/80 py-0.5"
      >
        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-90")} />

        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Wrench className="h-3 w-3 shrink-0" />
          <span className="font-mono text-[12px] font-medium truncate">{toolName}</span>
        </div>

        <div className="flex items-center shrink-0 ml-2">
          {done ? (
            <CheckCircle2 className="h-3 w-3 text-xibe-brand-green/80" />
          ) : (
            <Loader2 className="h-3 w-3 text-xibe-text-dim animate-spin" />
          )}
        </div>
      </button>

      {open && (
        <div className="pl-6 space-y-3 mt-1 animate-fade-in bg-transparent border-l border-xibe-border/30 ml-2 py-1">
          {inputStr && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-xibe-text-dim/60 mb-1">Input</div>
              <pre className="overflow-x-auto text-[11px] font-mono text-xibe-text-dim leading-relaxed bg-transparent p-0 m-0">{inputStr}</pre>
            </div>
          )}
          {outputStr && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-xibe-text-dim/60 mb-1 mt-2">Output</div>
              <pre className="overflow-x-auto text-[11px] font-mono text-xibe-text-dim leading-relaxed bg-transparent p-0 m-0 max-h-48">{outputStr.length > 5000 ? outputStr.slice(0, 5000) + '\n\n...[Output truncated]...' : outputStr}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default ToolCallCard;
