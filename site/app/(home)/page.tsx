'use client';

import Link from 'next/link';
import { ArrowRight, Check, X, Minus, Terminal, Bot, Zap, Code2, Shield, GitBranch, TestTube, Settings, Layers, Globe, Puzzle, Brain, Sparkles, Monitor, Heart } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

function useTypewriter(text: string, speed = 80) {
  const [displayText, setDisplayText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  useEffect(() => {
    let i = 0;
    setDisplayText('');
    setIsComplete(false);
    const timer = setInterval(() => {
      if (i < text.length) { setDisplayText(text.slice(0, i + 1)); i++; }
      else { setIsComplete(true); clearInterval(timer); }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);
  return { displayText, isComplete };
}

function useScrollAnimation() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setIsVisible(true); }, { threshold: 0.1 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
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
      const p = Math.min((ts - start) / 1500, 1);
      setCount(Math.floor(p * end));
      if (p < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [isVisible, end]);
  return <span ref={ref}>{count}{suffix}</span>;
}

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

const personas = [
  { name: 'Agent', role: 'Default Mode', icon: '🤖', desc: 'Full-stack development' },
  { name: 'Aria', role: 'Architect', icon: '📋', desc: 'Planning & analysis' },
  { name: 'Dex', role: 'Detective', icon: '🐛', desc: 'Bug hunting' },
  { name: 'Tess', role: 'QA Engineer', icon: '🧪', desc: 'Testing & quality' },
  { name: 'Sentinel', role: 'Guardian', icon: '🔒', desc: 'Security audits' },
  { name: 'Nova', role: 'Critic', icon: '👀', desc: 'Code reviews' },
  { name: 'Alex', role: 'Implementer', icon: '🛠️', desc: 'Feature building' },
  { name: 'Arya', role: 'Leader', icon: '👑', desc: 'Task orchestration' },
];

const features = [
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

export default function HomePage() {
  const { displayText, isComplete } = useTypewriter('You ship.', 100);
  const heroRef = useRef<HTMLDivElement>(null);
  const statsSection = useScrollAnimation();
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
        @keyframes float-1 { 0%, 100% { transform: translate(0, 0) rotate(0deg); } 25% { transform: translate(30px, -30px) rotate(5deg); } 50% { transform: translate(-20px, 20px) rotate(-5deg); } 75% { transform: translate(40px, 10px) rotate(3deg); } }
        @keyframes float-2 { 0%, 100% { transform: translate(0, 0); } 33% { transform: translate(-40px, 30px) rotate(-3deg); } 66% { transform: translate(30px, -20px) rotate(3deg); } }
        @keyframes float-3 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-30px, 30px) scale(1.1); } }
        @keyframes glow-pulse { 0%, 100% { box-shadow: 0 0 20px rgba(139,92,246,0.3), 0 0 40px rgba(139,92,246,0.1); } 50% { box-shadow: 0 0 30px rgba(139,92,246,0.5), 0 0 60px rgba(139,92,246,0.2); } }
        @keyframes text-glow { 0%, 100% { text-shadow: 0 0 20px rgba(139,92,246,0.5), 0 0 40px rgba(139,92,246,0.3); } 50% { text-shadow: 0 0 30px rgba(139,92,246,0.8), 0 0 60px rgba(139,92,246,0.5); } }
        @keyframes fade-up { 0% { opacity: 0; transform: translateY(40px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes scale-in { 0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes slide-left { 0% { opacity: 0; transform: translateX(40px); } 100% { opacity: 1; transform: translateX(0); } }
        @keyframes slide-right { 0% { opacity: 0; transform: translateX(-40px); } 100% { opacity: 1; transform: translateX(0); } }
        @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
        @keyframes pulse-ring { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }
        @keyframes border-glow { 0%, 100% { border-color: rgba(139,92,246,0.2); } 50% { border-color: rgba(139,92,246,0.5); } }
        .animate-float-1 { animation: float-1 20s ease-in-out infinite; }
        .animate-float-2 { animation: float-2 25s ease-in-out infinite; }
        .animate-float-3 { animation: float-3 18s ease-in-out infinite; }
        .animate-glow-pulse { animation: glow-pulse 2s ease-in-out infinite; }
        .animate-text-glow { animation: text-glow 2s ease-in-out infinite; }
        .animate-fade-up { animation: fade-up 0.8s ease-out forwards; }
        .animate-fade-in { animation: fade-in 0.6s ease-out forwards; }
        .animate-scale-in { animation: scale-in 0.6s ease-out forwards; }
        .animate-slide-left { animation: slide-left 0.7s ease-out forwards; }
        .animate-slide-right { animation: slide-right 0.7s ease-out forwards; }
        .animate-shimmer { background: linear-gradient(90deg, transparent, rgba(139,92,246,0.1), transparent); background-size: 200% 100%; animation: shimmer 2s infinite; }
        .animate-border-glow { animation: border-glow 3s ease-in-out infinite; }
        .hover-lift { transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .hover-lift:hover { transform: translateY(-4px); box-shadow: 0 12px 40px rgba(139,92,246,0.15); }
        .hover-glow:hover { box-shadow: 0 0 20px rgba(139,92,246,0.2); }
        .stagger-1 { animation-delay: 0.1s; }
        .stagger-2 { animation-delay: 0.2s; }
        .stagger-3 { animation-delay: 0.3s; }
        .stagger-4 { animation-delay: 0.4s; }
        .stagger-5 { animation-delay: 0.5s; }
        .stagger-6 { animation-delay: 0.6s; }
      `}</style>

      {/* Hero */}
      <div ref={heroRef} className="relative w-full max-w-7xl mx-auto px-4 pt-24 pb-20 md:pt-36 md:pb-28 flex flex-col items-center text-center z-10">
        {/* Background orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-violet-600/15 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '4s' }} />
          <div className="absolute top-20 left-[15%] w-72 h-72 bg-violet-500/10 rounded-full blur-3xl animate-float-1" />
          <div className="absolute top-40 right-[10%] w-96 h-96 bg-fuchsia-500/10 rounded-full blur-3xl animate-float-2" />
          <div className="absolute bottom-20 left-[30%] w-64 h-64 bg-cyan-500/8 rounded-full blur-3xl animate-float-3" />
          <div className="absolute bottom-40 right-[20%] w-80 h-80 bg-violet-400/5 rounded-full blur-3xl animate-float-1" style={{ animationDelay: '5s' }} />
        </div>

        <div className="mb-8 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 text-sm text-violet-300 animate-fade-up animate-border-glow opacity-0" style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}>
          <Terminal className="w-4 h-4" />
          <span>Open-Source AI Coding Agent</span>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </span>
        </div>

        <h1 className="text-5xl md:text-8xl font-bold tracking-tight mb-8 animate-fade-up opacity-0" style={{ animationDelay: '0.3s', animationFillMode: 'forwards' }}>
          <span className="bg-gradient-to-b from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
            XibeCode writes code.
          </span>
          <br />
          <span className="text-violet-400 animate-text-glow inline-block">
            {displayText}
            {!isComplete && <span className="animate-pulse">|</span>}
          </span>
        </h1>

        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-up opacity-0" style={{ animationDelay: '0.5s', animationFillMode: 'forwards' }}>
          AI-powered autonomous coding assistant for your terminal and browser.
          {' '}<span className="text-violet-300 font-medium">13 agent modes</span>, 40+ tools, MCP protocol, and a modern WebUI.
        </p>

        {/* Install command */}
        <div className="mb-8 animate-scale-in opacity-0" style={{ animationDelay: '0.65s', animationFillMode: 'forwards' }}>
          <code className="relative px-6 py-3 bg-zinc-900/80 border border-zinc-800 rounded-xl text-violet-400 font-mono text-sm md:text-base hover-glow transition-all duration-300 overflow-hidden">
            <span className="absolute inset-0 animate-shimmer" />
            <span className="relative">npm install -g xibecode</span>
          </code>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 animate-fade-up opacity-0" style={{ animationDelay: '0.8s', animationFillMode: 'forwards' }}>
          <Link href="/docs" className="group relative flex items-center gap-2 px-8 py-4 bg-violet-600 hover:bg-violet-500 text-white rounded-full font-semibold transition-all duration-300 hover:scale-105 animate-glow-pulse overflow-hidden">
            <span className="relative z-10">Get Started</span>
            <ArrowRight className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform" />
            <span className="absolute inset-0 animate-shimmer" />
          </Link>
          <a href="https://github.com/iotserver24/Xibecode" target="_blank" rel="noopener noreferrer" className="group flex items-center gap-2 px-8 py-4 bg-zinc-900/80 border border-zinc-700 hover:border-violet-500/50 hover:bg-zinc-800/80 text-zinc-300 rounded-full font-semibold transition-all duration-300 backdrop-blur-sm hover:scale-105">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="group-hover:rotate-12 transition-transform duration-300"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            Star on GitHub
          </a>
        </div>
      </div>

      {/* Stats */}
      <div ref={statsSection.ref} className={`w-full max-w-5xl mx-auto px-4 py-16 transition-all duration-700 ${statsSection.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { value: 13, label: 'Agent Modes' },
            { value: 40, suffix: '+', label: 'Built-in Tools' },
            { value: 8, label: 'Tool Categories' },
            { value: 100, suffix: '%', label: 'Open Source' },
          ].map((s, i) => (
            <div key={i} className="text-center p-6 rounded-2xl border border-zinc-800 bg-zinc-900/30 hover-lift hover:border-violet-500/30 transition-all duration-300" style={{ transitionDelay: `${i * 50}ms` }}>
              <div className="text-4xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent mb-2">
                <AnimatedCounter end={s.value} suffix={s.suffix || ''} />
              </div>
              <div className="text-zinc-400 text-sm">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Screenshots */}
      <div ref={screenshotsSection.ref} className={`w-full max-w-6xl mx-auto px-4 py-16 transition-all duration-700 ${screenshotsSection.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        <div className="text-center mb-10">
          <p className="text-sm font-medium text-violet-400 tracking-wider uppercase mb-3">See It In Action</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Modern WebUI for Developers</h2>
          <p className="text-zinc-400 max-w-xl mx-auto">A v0.dev-inspired interface with Monaco editor, multi-terminal, Git integration, and real-time AI chat.</p>
        </div>
        <div className="space-y-6">
          <div className="rounded-2xl border border-zinc-800 overflow-hidden hover:border-violet-500/30 transition-all duration-500 hover-lift group">
            <div className="overflow-hidden">
              <img src="/screenshots/01-main-interface.png" alt="XibeCode Main Interface" className="w-full group-hover:scale-[1.02] transition-transform duration-700" />
            </div>
            <div className="p-4 bg-zinc-900/50 border-t border-zinc-800">
              <h3 className="font-semibold text-white mb-1">Main Interface</h3>
              <p className="text-sm text-zinc-400">Activity bar, resizable panels, code editor, and integrated terminal</p>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
              <div className="rounded-xl border border-zinc-800 overflow-hidden hover:border-violet-500/30 transition-all duration-500 hover-lift group">
              <div className="overflow-hidden">
                <img src="/screenshots/06-ai-provider-settings.png" alt="AI Provider Settings" className="w-full group-hover:scale-[1.02] transition-transform duration-700" />
              </div>
              <div className="p-3 bg-zinc-900/50 border-t border-zinc-800">
                <h3 className="font-semibold text-white text-sm">AI Provider Settings</h3>
                <p className="text-xs text-zinc-400">Configure models, API keys, and endpoints</p>
              </div>
            </div>
            <div className="rounded-xl border border-zinc-800 overflow-hidden hover:border-violet-500/30 transition-all duration-500 hover-lift group">
              <div className="overflow-hidden">
                <img src="/screenshots/07-mcp-servers-editor.png" alt="MCP Servers Editor" className="w-full group-hover:scale-[1.02] transition-transform duration-700" />
              </div>
              <div className="p-3 bg-zinc-900/50 border-t border-zinc-800">
                <h3 className="font-semibold text-white text-sm">MCP Servers Editor</h3>
                <p className="text-xs text-zinc-400">Monaco editor with JSON syntax highlighting</p>
              </div>
            </div>
          </div>
          <div className="text-center">
            <Link href="/docs/webui" className="inline-flex items-center text-violet-400 hover:text-violet-300 font-medium">
              View all screenshots and WebUI features <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Agent Modes */}
      <div ref={modesSection.ref} className={`w-full max-w-5xl mx-auto px-4 py-16 transition-all duration-700 ${modesSection.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        <div className="text-center mb-10">
          <p className="text-sm font-medium text-violet-400 tracking-wider uppercase mb-3">13 Specialized Personas</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Agent Modes for Every Task</h2>
          <p className="text-zinc-400 max-w-xl mx-auto">Switch between specialized AI personas optimized for different development tasks.</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {personas.map((p, i) => (
            <div key={i} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900/60 hover:border-violet-500/30 hover-lift transition-all duration-300 group" style={{ transitionDelay: `${i * 50}ms` }}>
              <div className="text-2xl mb-2 group-hover:scale-110 transition-transform duration-300">{p.icon}</div>
              <div className="text-sm font-semibold text-white group-hover:text-violet-300 transition-colors">{p.name}</div>
              <div className="text-xs text-violet-400">{p.role}</div>
              <div className="text-xs text-zinc-500 mt-1">{p.desc}</div>
            </div>
          ))}
        </div>
        <div className="text-center mt-6">
          <Link href="/docs/modes" className="inline-flex items-center text-violet-400 hover:text-violet-300 font-medium">
            View all 13 modes <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Features */}
      <div ref={featuresSection.ref} className={`w-full max-w-6xl mx-auto px-4 py-16 transition-all duration-700 ${featuresSection.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        <div className="text-center mb-10">
          <p className="text-sm font-medium text-violet-400 tracking-wider uppercase mb-3">Capabilities</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything You Need</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <div key={i} className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/30 hover:border-violet-500/30 hover-lift transition-all duration-300 group overflow-hidden relative" style={{ transitionDelay: `${(i % 3) * 80}ms` }}>
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="flex items-start gap-3 relative z-10">
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

      {/* Comparison */}
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
                <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-900/30 transition-colors">
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

      {/* Sponsors */}
      <div ref={sponsorsSection.ref} className={`w-full max-w-5xl mx-auto px-4 py-16 transition-all duration-700 ${sponsorsSection.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        <div className="text-center mb-10">
          <p className="text-sm font-medium text-violet-400 tracking-wider uppercase mb-3">Community</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Our Sponsors</h2>
          <p className="text-zinc-400 max-w-xl mx-auto">XibeCode is free and open-source. These amazing people help keep the project alive.</p>
        </div>

        {sponsorsData && sponsorsData.stats.totalSponsors > 0 ? (
          <>
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="text-center p-4 rounded-xl border border-zinc-800 bg-zinc-900/30">
                <div className="text-2xl font-bold text-white">{sponsorsData.stats.totalSponsors}</div>
                <div className="text-zinc-500 text-sm">Sponsors</div>
              </div>
              <div className="text-center p-4 rounded-xl border border-zinc-800 bg-zinc-900/30">
                <div className="text-2xl font-bold text-white">{'\u20B9'}{sponsorsData.stats.totalRaisedINR.toLocaleString()}</div>
                <div className="text-zinc-500 text-sm">Raised (INR)</div>
              </div>
              <div className="text-center p-4 rounded-xl border border-zinc-800 bg-zinc-900/30">
                <div className="text-2xl font-bold text-white">${sponsorsData.stats.totalRaisedUSD.toLocaleString()}</div>
                <div className="text-zinc-500 text-sm">Raised (USD)</div>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-3 mb-8">
              {sponsorsData.sponsors.slice(0, 10).map((s: any, i: number) => (
                <div key={i} className="flex items-center gap-2 px-4 py-2 rounded-full border border-zinc-800 bg-zinc-900/30">
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
            {/* Reviews carousel */}
            {sponsorsData.reviews && sponsorsData.reviews.length > 0 && (
              <div className="mb-8">
                <div className="grid md:grid-cols-3 gap-4">
                  {sponsorsData.reviews.slice(0, 3).map((r: any, i: number) => (
                    <div key={i} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/20 text-left">
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
          <div className="text-center py-8 rounded-xl border border-zinc-800 bg-zinc-900/20 mb-8">
            <Heart className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-500">No sponsors yet. Be the first to support XibeCode!</p>
          </div>
        )}

        <div className="flex justify-center gap-4">
          <Link href="/donate" className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-full font-semibold transition-all">
            <Heart className="w-4 h-4" /> Become a Sponsor
          </Link>
          {sponsorsData && sponsorsData.stats.totalSponsors > 0 && (
            <Link href="/sponsors" className="px-6 py-3 text-zinc-400 hover:text-violet-300 font-medium transition-colors">
              View all sponsors
            </Link>
          )}
        </div>
      </div>

      {/* CTA */}
      <div className="w-full max-w-4xl mx-auto px-4 py-20 text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to let AI write your code?</h2>
        <p className="text-zinc-400 mb-8 max-w-lg mx-auto">Install XibeCode and start building in seconds. Open-source, free, and powerful.</p>
        <code className="block px-6 py-3 bg-zinc-900/80 border border-zinc-800 rounded-xl text-violet-400 font-mono mx-auto max-w-md mb-8">
          npm install -g xibecode
        </code>
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
