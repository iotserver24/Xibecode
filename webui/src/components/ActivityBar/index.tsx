import {
  GitBranch, FileKey, Settings, Heart
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
}

const TABS = [
  { id: 'git', icon: GitBranch, label: 'Git' },
  { id: 'env', icon: FileKey, label: 'Env' },
  { id: 'settings', icon: Settings, label: 'Settings' },
];

export function ActivityBar({ activeTab, onTabChange }: ActivityBarProps) {
  const { isSettingsOpen, setIsSettingsOpen } = useUIStore();

  return (
    <div className="w-14 bg-[#0a0a0a] border-r border-zinc-800/60 flex flex-col items-center py-3 flex-shrink-0 select-none">
      {/* Main tabs */}
      <div className="flex flex-col gap-1 items-center w-full flex-1">
        {TABS.map((tab) => {
          const isActive = tab.id === 'settings' ? isSettingsOpen : activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              className={cn(
                "flex flex-col items-center gap-0.5 w-12 py-2 rounded-lg transition-all duration-150 relative group",
                isActive
                  ? "text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
              onClick={() => {
                if (tab.id === 'settings') {
                  setIsSettingsOpen(!isSettingsOpen);
                  return;
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

      {/* Donate button pinned to bottom */}
      <div className="flex flex-col items-center w-full pt-2 border-t border-zinc-800/40 mt-1">
        <a
          href="https://xibeai.in/donate"
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center gap-0.5 w-12 py-2 rounded-lg transition-all duration-150 text-pink-500/70 hover:text-pink-400 group"
          title="Donate to support XibeCode"
        >
          <Heart size={18} strokeWidth={1.5} className="group-hover:fill-pink-400/30 transition-all" />
          <span className="text-[9px] font-medium leading-none text-zinc-600 group-hover:text-pink-400/80">
            Donate
          </span>
        </a>
      </div>
    </div>
  );
}
