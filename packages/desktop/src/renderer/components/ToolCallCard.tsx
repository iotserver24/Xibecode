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
    <div className="animate-fade-in py-1 group flex flex-col ml-11">
      <div className="flex items-center gap-2 w-full">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-xibe-text-dim hover:text-xibe-text transition-colors w-max text-[13px]"
        >
          <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-90")} />
          <div className="flex items-center gap-2 min-w-0">
            <Wrench className="h-3.5 w-3.5 shrink-0" />
            <span className="font-mono text-[13px] font-medium text-xibe-brand-blue truncate">{toolName}</span>
          </div>
        </button>

        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {done ? (
            <div className="text-[10px] font-mono text-xibe-text-dim shrink-0 mt-0.5">
              [done]
            </div>
          ) : (
            <div className="text-[10px] font-mono text-xibe-text-dim shrink-0 mt-0.5">
              [running]
            </div>
          )}
        </div>
      </div>

      {open && (
        <div className="border-l-2 border-xibe-border-subtle pl-4 ml-1.5 mt-2 space-y-3 animate-fade-in">
          {inputStr && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-xibe-text-dim">Input</span>
              </div>
              <pre className="overflow-x-auto text-[12px] font-mono text-xibe-text-dim leading-relaxed bg-transparent">{inputStr}</pre>
            </div>
          )}
          {outputStr && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-xibe-text-dim">Output</span>
              </div>
              <pre className="overflow-x-auto text-[12px] font-mono text-xibe-text-dim leading-relaxed max-h-64 bg-transparent">{outputStr.length > 5000 ? outputStr.slice(0, 5000) + '\n\n...[Output truncated]...' : outputStr}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default ToolCallCard;
