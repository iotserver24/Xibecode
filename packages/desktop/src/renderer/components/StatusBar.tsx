import { memo } from 'react';
import { useRunElapsed } from '../hooks/useRunElapsed';
import SpinnerVerbDisplay from './SpinnerVerbDisplay';

const StatusBarTimer = memo(function StatusBarTimer({ isRunning }: { isRunning: boolean }) {
  const runElapsed = useRunElapsed(isRunning);
  if (!isRunning) return null;
  return (
    <>
      <span className="text-xibe-border">|</span>
      <span className="tabular-nums">{(runElapsed / 1000).toFixed(1)}s</span>
    </>
  );
});

interface Props {
  mode: string;
  workingDir: string;
  isRunning: boolean;
  activeModel: string;
  activeProvider: string;
  wireFormat: string;
  costMode: string;
  onToggleSidebar: () => void;
  onTogglePreview: () => void;
}

const MODE_COLORS: Record<string, string> = {
  agent: 'bg-emerald-400', plan: 'bg-amber-400', review: 'bg-violet-400',
  tester: 'bg-pink-400', debugger: 'bg-yellow-400', security: 'bg-red-400',
  pentest: 'bg-rose-400', team_leader: 'bg-yellow-300',
  seo: 'bg-sky-400', product: 'bg-orange-400', architect: 'bg-purple-400',
  engineer: 'bg-green-400', data: 'bg-cyan-400', researcher: 'bg-pink-300',
};

export default function StatusBar({ mode, workingDir, isRunning, activeModel, activeProvider, wireFormat, costMode, onToggleSidebar, onTogglePreview }: Props) {
  const dot = MODE_COLORS[mode] ?? 'bg-zinc-400';

  return (
    <footer className="flex h-7 items-center justify-between bg-xibe-bg border-t border-transparent px-3 text-[10px] text-xibe-text-dim font-mono">
      <div className="flex items-center gap-2">
        <button onClick={onToggleSidebar} className="hover:text-xibe-text transition-colors" title="Toggle sidebar">
          <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" /></svg>
        </button>
        <div className="flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${dot} ${isRunning ? 'animate-pulse' : ''}`} />
          <span className="capitalize">{mode}</span>
        </div>
        <span className="text-xibe-border">|</span>
        <span className="truncate max-w-[120px]">{activeModel.split('/').pop()}</span>
        <span className="text-xibe-border">|</span>
        <span>{wireFormat}</span>
        {activeProvider && <><span className="text-xibe-border">|</span><span className="uppercase">{activeProvider}</span></>}
        {costMode === 'economy' && <><span className="text-xibe-border">|</span><span className="text-xibe-warning">economy</span></>}
        {isRunning && (
          <>
            <span className="text-xibe-border">|</span>
            <SpinnerVerbDisplay isRunning={isRunning} className="text-xibe-brand-blue" />
            <StatusBarTimer isRunning={isRunning} />
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xibe-text-dim/30 truncate max-w-[140px]" title={workingDir}>{workingDir.split('/').slice(-2).join('/')}</span>
        <button onClick={onTogglePreview} className="hover:text-xibe-text transition-colors" title="Toggle web preview">
          <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582" /></svg>
        </button>
      </div>
    </footer>
  );
}
