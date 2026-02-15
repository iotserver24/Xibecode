import {
  MessageSquare, Palette, GitBranch, Link2,
  Variable, LayoutTemplate, Settings
} from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface ActivityBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isChatCollapsed: boolean;
  onToggleChat: () => void;
}

const TABS = [
  { id: 'chat', icon: MessageSquare, label: 'Chat' },
  { id: 'design', icon: Palette, label: 'Design', disabled: true },
  { id: 'git', icon: GitBranch, label: 'Git' },
  { id: 'connect', icon: Link2, label: 'Connect', disabled: true },
  { id: 'vars', icon: Variable, label: 'Vars', disabled: true },
  { id: 'template', icon: LayoutTemplate, label: 'Template', disabled: true },
  { id: 'settings', icon: Settings, label: 'Settings' },
];

export function ActivityBar({ activeTab, onTabChange, isChatCollapsed, onToggleChat }: ActivityBarProps) {
  const { isSettingsOpen, setIsSettingsOpen } = useUIStore();

  return (
    <div className="w-14 bg-[#0a0a0a] border-r border-zinc-800/60 flex flex-col items-center py-3 flex-shrink-0 select-none">
      <div className="flex flex-col gap-1 items-center w-full">
        {TABS.map((tab) => {
          const isActive = tab.id === 'settings' ? isSettingsOpen : activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              disabled={tab.disabled}
              className={cn(
                "flex flex-col items-center gap-0.5 w-12 py-2 rounded-lg transition-all duration-150 relative group",
                tab.disabled && "opacity-30 cursor-not-allowed",
                isActive
                  ? "text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
              onClick={() => {
                if (tab.disabled) return;
                // Settings opens as a modal instead of sidebar
                if (tab.id === 'settings') {
                  setIsSettingsOpen(!isSettingsOpen);
                  return;
                }
                if (tab.id === 'chat' && isChatCollapsed) {
                  onToggleChat();
                }
                onTabChange(tab.id);
              }}
              title={tab.label}
            >
              {/* Active indicator bar */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-zinc-100 rounded-r-full" />
              )}

              <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
              <span className={cn(
                "text-[9px] font-medium leading-none",
                isActive ? "text-zinc-100" : "text-zinc-600"
              )}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
