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
    <div className="animate-fade-in my-1 group pl-10">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 py-1 text-left w-auto hover:opacity-80 transition-opacity"
      >
        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform text-xibe-text-dim", open && "rotate-90")} />

        <div className="flex items-center gap-2 min-w-0">
          <Wrench className="h-3.5 w-3.5 text-xibe-text-dim shrink-0" />
          <span className="font-mono text-[12px] font-medium text-xibe-text-dim truncate">{toolName}</span>
        </div>

        <div className="flex items-center ml-2 shrink-0">
          {done ? (
            <div className="flex items-center text-xibe-text-dim/50">
              <CheckCircle2 className="h-3 w-3" />
            </div>
          ) : (
            <div className="flex items-center text-xibe-text-dim/80">
              <Loader2 className="h-3 w-3 animate-spin" />
            </div>
          )}
        </div>
      </button>

      {open && (
        <div className="pl-6 py-2 space-y-4 animate-fade-in">
          {inputStr && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-xibe-text-dim mb-1">Input</div>
              <pre className="overflow-x-auto border-l-2 border-xibe-border-subtle pl-3 py-1 text-[11px] font-mono text-xibe-text-secondary leading-relaxed">{inputStr}</pre>
            </div>
          )}
          {outputStr && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-xibe-text-dim mb-1">Output</div>
              <pre className="overflow-x-auto border-l-2 border-xibe-border-subtle pl-3 py-1 text-[11px] font-mono text-xibe-text-dim leading-relaxed max-h-64">{outputStr.length > 5000 ? outputStr.slice(0, 5000) + '\n\n...[Output truncated]...' : outputStr}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default ToolCallCard;
