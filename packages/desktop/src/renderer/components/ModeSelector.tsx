interface Props {
  currentMode: string;
  onModeSwitch: (mode: string, reason: string) => void;
}

const MODES = [
  { id: 'agent', label: 'Agent', desc: 'Full autonomous coding', color: 'bg-emerald-400' },
  { id: 'plan', label: 'Plan', desc: 'Interactive planning', color: 'bg-amber-400' },
  { id: 'review', label: 'Review', desc: 'Code review & analysis', color: 'bg-violet-400' },
] as const;

export default function ModeSelector({ currentMode, onModeSwitch }: Props) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-xibe-text-dim/40">Mode</div>
      <div className="space-y-0.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => onModeSwitch(m.id, `Switched to ${m.label}`)}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-all ${
              currentMode === m.id
                ? 'bg-xibe-accent-muted border border-xibe-brand-blue/20'
                : 'border border-transparent hover:bg-xibe-surface-hover'
            }`}
          >
            <span className={`h-2 w-2 rounded-full shrink-0 ${m.color}`} />
            <div>
              <div className={`text-xs font-medium ${currentMode === m.id ? 'text-xibe-brand-blue' : 'text-xibe-text-secondary'}`}>{m.label}</div>
              <div className="text-[10px] text-xibe-text-dim/50">{m.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
