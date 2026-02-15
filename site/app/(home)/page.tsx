'use client';

import Link from 'next/link';
import { ArrowRight, Check, X, Minus, Terminal, Bot, Zap, Code2, Shield, GitBranch, TestTube, Settings, Layers, Globe, Puzzle, Brain, Sparkles, Monitor, Heart, Bug, Eye, Wrench, Crown, Layout, BookOpen, Copy, Check as CheckIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ElementType } from 'react';

// ─── Hooks ───────────────────────────────────────────────────

function useTypewriter(text: string, speed = 60, delay = 0) {
  const [displayText, setDisplayText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  useEffect(() => {
    const timeout = setTimeout(() => {
      let i = 0;
      setDisplayText('');
      setIsComplete(false);
      const timer = setInterval(() => {
        if (i < text.length) { setDisplayText(text.slice(0, i + 1)); i++; }
        else { setIsComplete(true); clearInterval(timer); }
      }, speed);
      return () => clearInterval(timer);
    }, delay);
    return () => clearTimeout(timeout);
  }, [text, speed, delay]);
  return { displayText, isComplete };
}

function useScrollAnimation(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setIsVisible(true); }, { threshold });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold]);
  return { ref, isVisible };
}

function AnimatedCounter({ end, suffix = '' }: { end: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const { ref, isVisible } = useScrollAnimation();
  useEffect(() => {
    if (!isVisible) return;
    let start: number;
    const animate = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / 1200, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.floor(eased * end));
      if (p < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [isVisible, end]);
  return <span ref={ref}>{count}{suffix}</span>;
}

// ─── Tabbed Installer ────────────────────────────────────────

const installCommands = [
  { tab: 'npm', cmd: 'npm install -g xibecode' },
  { tab: 'pnpm', cmd: 'pnpm add -g xibecode' },
  { tab: 'bun', cmd: 'bun add -g xibecode' },
  { tab: 'curl', cmd: 'curl -fsSL https://raw.githubusercontent.com/iotserver24/Xibecode/main/install.sh | bash' },
];

function InstallBox() {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(installCommands[active].cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-xl mx-auto rounded-xl border border-zinc-800 bg-zinc-950/80 overflow-hidden backdrop-blur-sm">
      <div className="flex border-b border-zinc-800">
        {installCommands.map((c, i) => (
          <button
            key={c.tab}
            onClick={() => { setActive(i); setCopied(false); }}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
              active === i
                ? 'text-white bg-zinc-900 border-b-2 border-violet-500'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
            }`}
          >
            {c.tab}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between px-5 py-4">
        <code className="text-violet-400 font-mono text-sm md:text-base truncate pr-4">
          {installCommands[active].cmd}
        </code>
        <button onClick={handleCopy} className="flex-none p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all" title="Copy">
          {copied ? <CheckIcon className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ─── Terminal Demo ───────────────────────────────────────────

const terminalLines = [
  { text: '$ xibecode run "Add JWT auth to the Express API"', type: 'cmd' as const },
  { text: '', type: 'blank' as const },
  { text: 'Reading project structure...', type: 'info' as const },
  { text: 'Found: src/app.ts, src/routes/, package.json', type: 'dim' as const },
  { text: 'Planning implementation...', type: 'info' as const },
  { text: 'Creating src/middleware/auth.ts', type: 'success' as const },
  { text: 'Creating src/routes/auth.ts', type: 'success' as const },
  { text: 'Installing jsonwebtoken, bcrypt...', type: 'info' as const },
  { text: 'Running tests... 4/4 passed', type: 'success' as const },
  { text: 'Done in 12s', type: 'success' as const },
];

function TerminalDemo() {
  const { ref, isVisible } = useScrollAnimation(0.3);
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    if (!isVisible) return;
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setVisibleLines(i);
      if (i >= terminalLines.length) clearInterval(timer);
    }, 400);
    return () => clearInterval(timer);
  }, [isVisible]);

  const lineColor = (type: string) => {
    switch (type) {
      case 'cmd': return 'text-white';
      case 'success': return 'text-emerald-400';
      case 'info': return 'text-violet-400';
      case 'dim': return 'text-zinc-500';
      default: return 'text-zinc-400';
    }
  };

  return (
    <div ref={ref} className="w-full max-w-2xl mx-auto rounded-xl border border-zinc-800 bg-zinc-950/90 overflow-hidden backdrop-blur-sm">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/50">
        <div className="w-3 h-3 rounded-full bg-zinc-700" />
        <div className="w-3 h-3 rounded-full bg-zinc-700" />
        <div className="w-3 h-3 rounded-full bg-zinc-700" />
        <span className="ml-2 text-xs text-zinc-500 font-mono">terminal</span>
      </div>
      <div className="p-5 font-mono text-sm leading-relaxed min-h-[260px]">
        {terminalLines.slice(0, visibleLines).map((line, i) => (
          <div
            key={i}
            className={`${lineColor(line.type)} animate-fade-up`}
            style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'both' }}
          >
            {line.text || '\u00A0'}
          </div>
        ))}
        {visibleLines < terminalLines.length && isVisible && (
          <span className="inline-block w-2 h-4 bg-violet-400 animate-pulse" />
        )}
      </div>
    </div>
  );
}

// ─── Data ────────────────────────────────────────────────────

const comparisonData = [
  { feature: 'Open Source', xibecode: true, claude: false, aider: true },
  { feature: 'Free to Use', xibecode: true, claude: false, aider: true },
  { feature: 'Custom API Endpoint', xibecode: true, claude: false, aider: true },
  { feature: '13 Agent Modes', xibecode: true, claude: false, aider: false },
  { feature: '40+ Built-in Tools', xibecode: true, claude: true, aider: 'partial' as const },
  { feature: 'Smart Context Discovery', xibecode: true, claude: true, aider: 'partial' as const },
  { feature: 'Advanced File Editing', xibecode: true, claude: false, aider: false },
  { feature: 'Cross-Platform', xibecode: true, claude: true, aider: true },
  { feature: 'Loop Detection', xibecode: true, claude: true, aider: false },
  { feature: 'Automatic Backups', xibecode: true, claude: 'partial' as const, aider: false },
  { feature: 'Neural Memory System', xibecode: true, claude: false, aider: false },
  { feature: 'Test Integration', xibecode: true, claude: false, aider: false },
  { feature: 'Git Awareness', xibecode: true, claude: false, aider: 'partial' as const },
  { feature: 'MCP Protocol Support', xibecode: true, claude: false, aider: false },
  { feature: 'Plugin System', xibecode: true, claude: false, aider: false },
  { feature: 'Skills System', xibecode: true, claude: false, aider: false },
  { feature: 'WebUI (Browser IDE)', xibecode: true, claude: false, aider: false },
  { feature: 'Risk Assessment', xibecode: true, claude: false, aider: false },
];

function CellIcon({ value }: { value: boolean | string }) {
  if (value === true) return <Check className="h-4 w-4 text-emerald-400 mx-auto" />;
  if (value === false) return <X className="h-4 w-4 text-zinc-700 mx-auto" />;
  return <Minus className="h-4 w-4 text-zinc-500 mx-auto" />;
}

const personas: { name: string; role: string; icon: ElementType; desc: string }[] = [
  { name: 'Agent', role: 'Default Mode', icon: Bot, desc: 'Full-stack development' },
  { name: 'Aria', role: 'Architect', icon: Layout, desc: 'Planning & analysis' },
  { name: 'Dex', role: 'Detective', icon: Bug, desc: 'Bug hunting' },
  { name: 'Tess', role: 'QA Engineer', icon: TestTube, desc: 'Testing & quality' },
  { name: 'Sentinel', role: 'Guardian', icon: Shield, desc: 'Security audits' },
  { name: 'Nova', role: 'Critic', icon: Eye, desc: 'Code reviews' },
  { name: 'Alex', role: 'Implementer', icon: Wrench, desc: 'Feature building' },
  { name: 'Arya', role: 'Leader', icon: Crown, desc: 'Task orchestration' },
];

const features: { icon: ElementType; title: string; desc: string }[] = [
  { icon: Brain, title: 'Smart Context', desc: 'Automatically discovers relevant code, dependencies, and project structure.' },
  { icon: Code2, title: 'Advanced Editing', desc: '4 editing methods: write, edit, insert, and verified edit with rollback.' },
  { icon: TestTube, title: 'Test Integration', desc: 'AI-generated tests for Vitest, Jest, Mocha, pytest, Go test, and more.' },
  { icon: GitBranch, title: 'Git Awareness', desc: 'Automatic checkpoints, diffs, status tracking, and safe rollbacks.' },
  { icon: Globe, title: 'MCP Integration', desc: 'Connect to external services via the Model Context Protocol.' },
  { icon: Puzzle, title: 'Plugin System', desc: 'Extend with custom tools, domain logic, and automation scripts.' },
  { icon: Shield, title: 'Safety Controls', desc: 'Dry-run mode, risk assessment, command blocking, and backups.' },
  { icon: Bot, title: 'Autonomous Loop', desc: 'Read, plan, execute, verify, and iterate until tasks are complete.' },
  { icon: Monitor, title: 'Modern WebUI', desc: 'v0.dev-inspired browser interface with Monaco editor and terminal.' },
  { icon: Layers, title: 'Multi-Model', desc: 'Anthropic, OpenAI, and any OpenAI-compatible API or local LLM.' },
  { icon: Settings, title: 'Configurable', desc: '20+ settings, environment variables, and project-level config.' },
  { icon: Sparkles, title: 'Neural Memory', desc: 'Remembers patterns, preferences, and lessons across sessions.' },
];

// ─── Page ────────────────────────────────────────────────────

export default function HomePage() {
  const { displayText, isComplete } = useTypewriter('You ship.', 80);
  const heroRef = useRef<HTMLDivElement>(null);
  const statsSection = useScrollAnimation();
  const terminalSection = useScrollAnimation(0.2);
  const screenshotsSection = useScrollAnimation();
  const modesSection = useScrollAnimation();
  const featuresSection = useScrollAnimation();
  const comparisonSection = useScrollAnimation();
  const sponsorsSection = useScrollAnimation();

  const [sponsorsData, setSponsorsData] = useState<{ sponsors: any[]; reviews: any[]; stats: { totalSponsors: number; totalRaisedINR: number; totalRaisedUSD: number } } | null>(null);
  useEffect(() => {
    fetch('/api/sponsors').then(r => r.json()).then(setSponsorsData).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col items-center w-full overflow-hidden text-zinc-100">
      <style jsx global>{`
        @keyframes float-1 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(30px, -30px); } }
        @keyframes float-2 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-40px, 30px); } }
        @keyframes glow-pulse { 0%, 100% { box-shadow: 0 0 20px rgba(139,92,246,0.3); } 50% { box-shadow: 0 0 40px rgba(139,92,246,0.5); } }
        @keyframes text-glow { 0%, 100% { text-shadow: 0 0 20px rgba(139,92,246,0.5); } 50% { text-shadow: 0 0 40px rgba(139,92,246,0.8); } }
        @keyframes fade-up { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scale-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes slide-in-left { from { opacity: 0; transform: translateX(-30px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slide-in-right { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
        .animate-float-1 { animation: float-1 20s ease-in-out infinite; }
        .animate-float-2 { animation: float-2 25s ease-in-out infinite; }
        .animate-glow-pulse { animation: glow-pulse 2s ease-in-out infinite; }
        .animate-text-glow { animation: text-glow 2s ease-in-out infinite; }
        .animate-fade-up { animation: fade-up 0.6s ease-out both; }
        .animate-scale-in { animation: scale-in 0.5s ease-out both; }
        .animate-slide-left { animation: slide-in-left 0.6s ease-out both; }
        .animate-slide-right { animation: slide-in-right 0.6s ease-out both; }
        .card-hover { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        .card-hover:hover { transform: translateY(-4px); box-shadow: 0 8px 30px rgba(139,92,246,0.08); border-color: rgba(139,92,246,0.3); }
      `}</style>

      {/* ── Hero ── */}
      <div ref={heroRef} className="relative w-full max-w-7xl mx-auto px-4 pt-24 pb-16 md:pt-36 md:pb-24 flex flex-col items-center text-center z-10">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-[15%] w-72 h-72 bg-violet-500/10 rounded-full blur-3xl animate-float-1" />
          <div className="absolute top-40 right-[10%] w-96 h-96 bg-fuchsia-500/8 rounded-full blur-3xl animate-float-2" />
          <div className="absolute bottom-20 left-[30%] w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl animate-float-1" />
        </div>

        <div className="mb-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 text-sm text-violet-300 animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <Terminal className="w-4 h-4" />
          <span>Open-Source AI Coding Agent</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>

        <h1 className="text-5xl md:text-8xl font-bold tracking-tight mb-6 animate-fade-up" style={{ animationDelay: '0.25s' }}>
          <span className="bg-gradient-to-b from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
            XibeCode writes code.
          </span>
          <br />
          <span className="text-violet-400 animate-text-glow inline-block">
            {displayText}
            {!isComplete && <span className="animate-pulse">|</span>}
          </span>
        </h1>

        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-up opacity-0" style={{ animationDelay: '0.45s', animationFillMode: 'forwards' }}>
          AI-powered autonomous coding assistant for your terminal and browser.
          {' '}<span className="text-violet-300 font-medium">13 agent modes</span>, 40+ tools, MCP protocol, and a modern WebUI.
        </p>

        {/* Tabbed Install Box */}
        <div className="w-full mb-8 animate-fade-up opacity-0" style={{ animationDelay: '0.6s', animationFillMode: 'forwards' }}>
          <InstallBox />
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 animate-fade-up opacity-0" style={{ animationDelay: '0.75s', animationFillMode: 'forwards' }}>
          <Link href="/docs" className="group flex items-center gap-2 px-8 py-4 bg-violet-600 hover:bg-violet-500 text-white rounded-full font-semibold transition-all duration-300 hover:scale-105 animate-glow-pulse">
            Get Started
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
          <a href="https://github.com/iotserver24/Xibecode" target="_blank" rel="noopener noreferrer" className="group flex items-center gap-2 px-8 py-4 bg-zinc-900/80 border border-zinc-700 hover:border-violet-500/50 text-zinc-300 rounded-full font-semibold transition-all backdrop-blur-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            Star on GitHub
          </a>
        </div>
      </div>

      {/* ── Terminal Demo ── */}
      <div ref={terminalSection.ref} className={`w-full max-w-7xl mx-auto px-4 pb-16 transition-all duration-700 ${terminalSection.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        <TerminalDemo />
      </div>

      {/* ── Stats ── */}
      <div ref={statsSection.ref} className={`w-full max-w-5xl mx-auto px-4 py-16 transition-all duration-700 ${statsSection.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { value: 13, label: 'Agent Modes' },
            { value: 40, suffix: '+', label: 'Built-in Tools' },
            { value: 8, label: 'Tool Categories' },
            { value: 100, suffix: '%', label: 'Open Source' },
          ].map((s, i) => (
            <div
              key={i}
              className={`text-center p-6 rounded-2xl border border-zinc-800 bg-zinc-900/30 card-hover ${statsSection.isVisible ? 'animate-scale-in' : 'opacity-0'}`}
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="text-4xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent mb-2">
                <AnimatedCounter end={s.value} suffix={s.suffix || ''} />
              </div>
              <div className="text-zinc-400 text-sm">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Screenshots ── */}
      <div ref={screenshotsSection.ref} className={`w-full max-w-6xl mx-auto px-4 py-16 transition-all duration-700 ${screenshotsSection.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        <div className="text-center mb-10">
          <p className="text-sm font-medium text-violet-400 tracking-wider uppercase mb-3">See It In Action</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Modern WebUI for Developers</h2>
          <p className="text-zinc-400 max-w-xl mx-auto">A v0.dev-inspired interface with Monaco editor, multi-terminal, Git integration, and real-time AI chat.</p>
        </div>
        <div className="space-y-6">
          <div className={`rounded-2xl border border-zinc-800 overflow-hidden card-hover ${screenshotsSection.isVisible ? 'animate-scale-in' : 'opacity-0'}`} style={{ animationDelay: '0.1s' }}>
            <img src="/screenshots/01-main-interface.png" alt="XibeCode Main Interface" className="w-full" />
            <div className="p-4 bg-zinc-900/50 border-t border-zinc-800">
              <h3 className="font-semibold text-white mb-1">Main Interface</h3>
              <p className="text-sm text-zinc-400">Activity bar, resizable panels, code editor, and integrated terminal</p>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className={`rounded-xl border border-zinc-800 overflow-hidden card-hover ${screenshotsSection.isVisible ? 'animate-slide-left' : 'opacity-0'}`} style={{ animationDelay: '0.3s' }}>
              <img src="/screenshots/06-ai-provider-settings.png" alt="AI Provider Settings" className="w-full" />
              <div className="p-3 bg-zinc-900/50 border-t border-zinc-800">
                <h3 className="font-semibold text-white text-sm">AI Provider Settings</h3>
                <p className="text-xs text-zinc-400">Configure models, API keys, and endpoints</p>
              </div>
            </div>
            <div className={`rounded-xl border border-zinc-800 overflow-hidden card-hover ${screenshotsSection.isVisible ? 'animate-slide-right' : 'opacity-0'}`} style={{ animationDelay: '0.3s' }}>
              <img src="/screenshots/07-mcp-servers-editor.png" alt="MCP Servers Editor" className="w-full" />
              <div className="p-3 bg-zinc-900/50 border-t border-zinc-800">
                <h3 className="font-semibold text-white text-sm">MCP Servers Editor</h3>
                <p className="text-xs text-zinc-400">Monaco editor with JSON syntax highlighting</p>
              </div>
            </div>
          </div>
          <div className="text-center">
            <Link href="/docs/webui" className="inline-flex items-center text-violet-400 hover:text-violet-300 font-medium transition-colors">
              View all screenshots and WebUI features <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Agent Modes ── */}
      <div ref={modesSection.ref} className={`w-full max-w-5xl mx-auto px-4 py-16 transition-all duration-700 ${modesSection.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        <div className="text-center mb-10">
          <p className="text-sm font-medium text-violet-400 tracking-wider uppercase mb-3">13 Specialized Personas</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Agent Modes for Every Task</h2>
          <p className="text-zinc-400 max-w-xl mx-auto">Switch between specialized AI personas optimized for different development tasks.</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {personas.map((p, i) => (
            <div
              key={i}
              className={`p-4 rounded-xl border border-zinc-800 bg-zinc-900/30 card-hover ${modesSection.isVisible ? 'animate-scale-in' : 'opacity-0'}`}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400 mb-3">
                <p.icon className="w-5 h-5" />
              </div>
              <div className="text-sm font-semibold text-white">{p.name}</div>
              <div className="text-xs text-violet-400">{p.role}</div>
              <div className="text-xs text-zinc-500 mt-1">{p.desc}</div>
            </div>
          ))}
        </div>
        <div className="text-center mt-6">
          <Link href="/docs/modes" className="inline-flex items-center text-violet-400 hover:text-violet-300 font-medium transition-colors">
            View all 13 modes <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* ── Features ── */}
      <div ref={featuresSection.ref} className={`w-full max-w-6xl mx-auto px-4 py-16 transition-all duration-700 ${featuresSection.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        <div className="text-center mb-10">
          <p className="text-sm font-medium text-violet-400 tracking-wider uppercase mb-3">Capabilities</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything You Need</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <div
              key={i}
              className={`p-5 rounded-xl border border-zinc-800 bg-zinc-900/30 card-hover group ${featuresSection.isVisible ? 'animate-fade-up' : 'opacity-0'}`}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-violet-500/10 text-violet-400 group-hover:scale-110 group-hover:bg-violet-500/20 transition-all duration-300">
                  <f.icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1 group-hover:text-violet-300 transition-colors">{f.title}</h3>
                  <p className="text-sm text-zinc-400">{f.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Comparison ── */}
      <div ref={comparisonSection.ref} className={`w-full max-w-5xl mx-auto px-4 py-16 transition-all duration-700 ${comparisonSection.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        <div className="text-center mb-10">
          <p className="text-sm font-medium text-violet-400 tracking-wider uppercase mb-3">Comparison</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">How XibeCode Stacks Up</h2>
          <p className="text-zinc-400 max-w-xl mx-auto">Feature-by-feature comparison with other AI coding assistants.</p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="text-left py-4 px-4 text-sm font-medium text-zinc-400">Feature</th>
                <th className="text-center py-4 px-4 text-sm font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">XibeCode</th>
                <th className="text-center py-4 px-4 text-sm text-zinc-500">Claude Code</th>
                <th className="text-center py-4 px-4 text-sm text-zinc-500">Aider</th>
              </tr>
            </thead>
            <tbody>
              {comparisonData.map((row, i) => (
                <tr
                  key={i}
                  className={`border-b border-zinc-800/50 hover:bg-zinc-900/30 transition-colors ${comparisonSection.isVisible ? 'animate-fade-up' : 'opacity-0'}`}
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <td className="py-3 px-4 text-sm text-zinc-300">{row.feature}</td>
                  <td className="text-center py-3 px-4"><CellIcon value={row.xibecode} /></td>
                  <td className="text-center py-3 px-4"><CellIcon value={row.claude} /></td>
                  <td className="text-center py-3 px-4"><CellIcon value={row.aider} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Sponsors ── */}
      <div ref={sponsorsSection.ref} className={`w-full max-w-5xl mx-auto px-4 py-16 transition-all duration-700 ${sponsorsSection.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        <div className="text-center mb-10">
          <p className="text-sm font-medium text-violet-400 tracking-wider uppercase mb-3">Community</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Our Sponsors</h2>
          <p className="text-zinc-400 max-w-xl mx-auto">XibeCode is free and open-source. These amazing people help keep the project alive.</p>
        </div>

        {sponsorsData && sponsorsData.stats.totalSponsors > 0 ? (
          <>
            <div className="grid grid-cols-3 gap-4 mb-8">
              {[
                { label: 'Sponsors', value: String(sponsorsData.stats.totalSponsors) },
                { label: 'Raised (INR)', value: `\u20B9${sponsorsData.stats.totalRaisedINR.toLocaleString()}` },
                { label: 'Raised (USD)', value: `$${sponsorsData.stats.totalRaisedUSD.toLocaleString()}` },
              ].map((s, i) => (
                <div key={i} className={`text-center p-4 rounded-xl border border-zinc-800 bg-zinc-900/30 card-hover ${sponsorsSection.isVisible ? 'animate-scale-in' : 'opacity-0'}`} style={{ animationDelay: `${i * 100}ms` }}>
                  <div className="text-2xl font-bold text-white">{s.value}</div>
                  <div className="text-zinc-500 text-sm">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap justify-center gap-3 mb-8">
              {sponsorsData.sponsors.slice(0, 10).map((s: any, i: number) => (
                <div key={i} className={`flex items-center gap-2 px-4 py-2 rounded-full border border-zinc-800 bg-zinc-900/30 card-hover ${sponsorsSection.isVisible ? 'animate-fade-up' : 'opacity-0'}`} style={{ animationDelay: `${i * 60}ms` }}>
                  {s.avatarUrl ? (
                    <img src={s.avatarUrl} alt={s.name} className="w-6 h-6 rounded-full object-cover border border-zinc-700" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 text-xs font-bold">
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-zinc-300 text-sm">{s.name}</span>
                  <span className="text-emerald-400 text-sm font-semibold">{s.currency === 'INR' ? '\u20B9' : '$'}{s.amount}</span>
                </div>
              ))}
            </div>
            {sponsorsData.reviews && sponsorsData.reviews.length > 0 && (
              <div className="mb-8">
                <div className="grid md:grid-cols-3 gap-4">
                  {sponsorsData.reviews.slice(0, 3).map((r: any, i: number) => (
                    <div key={i} className={`p-4 rounded-xl border border-zinc-800 bg-zinc-900/20 text-left card-hover ${sponsorsSection.isVisible ? 'animate-fade-up' : 'opacity-0'}`} style={{ animationDelay: `${(i + 3) * 80}ms` }}>
                      <p className="text-zinc-300 text-sm mb-3 leading-relaxed line-clamp-3">&ldquo;{r.description}&rdquo;</p>
                      <div className="flex items-center gap-2">
                        {r.avatarUrl ? (
                          <img src={r.avatarUrl} alt={r.name} className="w-6 h-6 rounded-full object-cover border border-zinc-700" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 text-xs font-bold">
                            {r.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="text-white text-xs font-medium">{r.name}</span>
                        <span className="text-emerald-400 text-xs">{r.currency === 'INR' ? '\u20B9' : '$'}{r.amount}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-10 rounded-xl border border-zinc-800 bg-zinc-900/20 mb-8">
            <Terminal className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm">No sponsors yet. Be the first to support XibeCode.</p>
          </div>
        )}

        <div className="flex justify-center gap-4">
          <Link href="/donate" className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-full font-semibold transition-all duration-300 hover:scale-105">
            <Heart className="w-4 h-4" /> Become a Sponsor
          </Link>
          {sponsorsData && sponsorsData.stats.totalSponsors > 0 && (
            <Link href="/sponsors" className="px-6 py-3 text-zinc-400 hover:text-violet-300 font-medium transition-colors">
              View all sponsors
            </Link>
          )}
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="w-full max-w-4xl mx-auto px-4 py-20 text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to let AI write your code?</h2>
        <p className="text-zinc-400 mb-8 max-w-lg mx-auto">Install XibeCode and start building in seconds. Open-source, free, and powerful.</p>
        <div className="mb-8">
          <InstallBox />
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/docs" className="group flex items-center gap-2 px-8 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-full font-semibold transition-all">
            Get Started <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link href="/docs/webui" className="px-8 py-3 text-zinc-400 hover:text-violet-300 font-medium transition-colors">
            View WebUI Documentation
          </Link>
        </div>
      </div>
    </div>
  );
}
