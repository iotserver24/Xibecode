import { useState, useCallback } from 'react';
import { Terminal } from '../Terminal';
import { Terminal as TerminalIcon, Plus, X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface BottomPanelProps {
  isCollapsed: boolean;
}

interface TerminalTab {
  id: string;
  label: string;
}

let terminalCounter = 1;

export function BottomPanel({ isCollapsed }: BottomPanelProps) {
  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>([
    { id: `term_${terminalCounter}`, label: `Terminal ${terminalCounter}` },
  ]);
  const [activeTerminalId, setActiveTerminalId] = useState<string>(terminalTabs[0].id);

  const addTerminal = useCallback(() => {
    terminalCounter++;
    const newTab: TerminalTab = {
      id: `term_${terminalCounter}`,
      label: `Terminal ${terminalCounter}`,
    };
    setTerminalTabs((prev) => [...prev, newTab]);
    setActiveTerminalId(newTab.id);
  }, []);

  const removeTerminal = useCallback((id: string) => {
    setTerminalTabs((prev) => {
      const filtered = prev.filter((t) => t.id !== id);
      if (filtered.length === 0) {
        terminalCounter++;
        const newTab: TerminalTab = {
          id: `term_${terminalCounter}`,
          label: `Terminal ${terminalCounter}`,
        };
        setActiveTerminalId(newTab.id);
        return [newTab];
      }
      if (id === activeTerminalId) {
        setActiveTerminalId(filtered[filtered.length - 1].id);
      }
      return filtered;
    });
  }, [activeTerminalId]);

  if (isCollapsed) {
    return null;
  }

  return (
    <div className="h-[220px] flex flex-col border-t border-zinc-800/80 bg-[#0a0a0a] flex-shrink-0">
      {/* Terminal tab bar */}
      <div className="flex items-center h-8 select-none flex-shrink-0 border-b border-zinc-800/60 px-2">
        <div className="flex items-center gap-0.5 overflow-x-auto flex-1">
          {terminalTabs.map((tab) => {
            const isActive = activeTerminalId === tab.id;
            return (
              <div
                key={tab.id}
                className={cn(
                  "flex items-center gap-1 px-2.5 h-6 rounded text-[11px] cursor-pointer transition-colors group",
                  isActive
                    ? "bg-zinc-800 text-zinc-200"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                )}
                onClick={() => setActiveTerminalId(tab.id)}
              >
                <TerminalIcon size={11} />
                <span>{tab.label}</span>
                <button
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-all ml-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTerminal(tab.id);
                  }}
                  title="Close terminal"
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>
        <button
          onClick={addTerminal}
          className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors flex-shrink-0 ml-1"
          title="New terminal"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Terminal content */}
      <div className="flex-1 overflow-hidden relative">
        {terminalTabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              "absolute inset-0",
              activeTerminalId === tab.id ? "z-10 visible" : "z-0 invisible"
            )}
          >
            <Terminal />
          </div>
        ))}
      </div>
    </div>
  );
}
