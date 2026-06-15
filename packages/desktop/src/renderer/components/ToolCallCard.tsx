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
    <div className="flex w-full group py-1.5 animate-fade-in pl-11">
      <div className="flex flex-col w-full min-w-0">
        <button
          onClick={() => setOpen(!open)}
          className="flex w-fit items-center gap-2 px-1 py-0.5 text-left rounded hover:bg-xibe-surface-hover/50 transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5 text-xibe-text-dim/70 shrink-0" />
            <span className="font-mono text-[13px] text-xibe-text-dim hover:text-xibe-text-secondary transition-colors truncate">
              {toolName}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-1">
            {done ? (
              <CheckCircle2 className="h-3 w-3 text-xibe-text-dim/50" />
            ) : (
              <Loader2 className="h-3 w-3 text-xibe-text-dim animate-spin" />
            )}
          </div>
          <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform text-xibe-text-dim/50", open && "rotate-90")} />
        </button>

        {open && (
          <div className="pl-5 pt-2 pb-1 space-y-3 animate-fade-in">
            {inputStr && (
              <div className="relative group/block">
                <div className="absolute -left-3 top-0 bottom-0 w-[1px] bg-xibe-border-subtle group-hover/block:bg-xibe-border-focus/50 transition-colors" />
                <pre className="overflow-x-auto text-[12px] font-mono text-xibe-text-secondary leading-relaxed bg-transparent">{inputStr}</pre>
              </div>
            )}
            {outputStr && (
              <div className="relative group/block mt-2">
                <div className="absolute -left-3 top-0 bottom-0 w-[1px] bg-xibe-border-subtle group-hover/block:bg-xibe-border-focus/50 transition-colors" />
                <pre className="overflow-x-auto text-[12px] font-mono text-xibe-text-dim leading-relaxed bg-transparent max-h-[400px]">{outputStr.length > 5000 ? outputStr.slice(0, 5000) + '\n\n...[Output truncated]...' : outputStr}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default ToolCallCard;
