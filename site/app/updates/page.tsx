'use client';

import { motion } from 'framer-motion';
import {
  Check,
  Clock,
  Sparkles,
  Brain,
  TestTube,
  GitBranch,
  Shield,
  Plug,
  Terminal,
  Zap,
  Code2,
  FileSearch,
  Layers,
  Lock,
  Rocket,
  Globe,
  Bot,
  Database,
  Eye,
  Workflow,
} from 'lucide-react';

const currentFeatures = [
  {
    category: 'Core',
    items: [
      { icon: Zap, name: 'Autonomous Agent Loop', description: 'AI iteratively works on tasks until completion with loop detection' },
      { icon: Brain, name: 'Smart Context Management', description: 'Automatically discovers imports, tests, and configs for full project understanding' },
      { icon: Code2, name: 'Advanced File Editing', description: '4 editing methods: search/replace, line-range, insert, and revert with automatic backups' },
      { icon: Terminal, name: 'Command Execution', description: 'Cross-platform shell commands with stdout/stderr capture and exit code handling' },
      { icon: Sparkles, name: 'Enhanced Reasoning', description: 'Problem decomposition, hypothesis-driven development, and root cause analysis' },
    ],
  },
  {
    category: 'Development Tools',
    items: [
      { icon: TestTube, name: 'Test Integration', description: 'Auto-detect and run Vitest, Jest, pytest, Go test — iterates until all tests pass' },
      { icon: GitBranch, name: 'Git Awareness', description: 'Status, checkpoints, changed-only mode, and safe revert with stash or commit strategies' },
      { icon: Shield, name: 'Safety Controls', description: 'Dry-run mode, risk assessment, dangerous command blocking, and safer alternatives' },
      { icon: Lock, name: 'Automatic Backups', description: 'Every file edit creates a timestamped backup with full revert capability' },
      { icon: FileSearch, name: 'Smart Package Manager', description: 'Auto-detects pnpm, bun, or npm from lock files' },
    ],
  },
  {
    category: 'Extensibility',
    items: [
      { icon: Plug, name: 'MCP Integration', description: 'Connect to external servers via Model Context Protocol for databases, APIs, and more' },
      { icon: Layers, name: 'Plugin System', description: 'Extend XibeCode with custom tools and domain-specific logic' },
      { icon: Globe, name: 'Custom API Endpoints', description: 'Compatible with Azure, AWS Bedrock, or any Claude-compatible API' },
      { icon: Terminal, name: 'Beautiful TUI', description: 'Real-time progress bars, colored output, spinners, and operation visualization' },
      { icon: Layers, name: 'Cross-Platform', description: 'Works identically on Windows, macOS, and Linux with automatic OS detection' },
    ],
  },
];

const upcomingFeatures = [
  {
    status: 'in-progress',
    name: 'Multi-Model Support',
    description: 'Support for OpenAI GPT, Google Gemini, and local models via Ollama alongside Claude.',
    icon: Bot,
  },
  {
    status: 'in-progress',
    name: 'Web Dashboard',
    description: 'Browser-based UI for managing tasks, viewing history, and monitoring agent progress.',
    icon: Eye,
  },
  {
    status: 'planned',
    name: 'Project Templates',
    description: 'Pre-built templates for common project types — Express API, React app, CLI tool, and more.',
    icon: Rocket,
  },
  {
    status: 'planned',
    name: 'Workflow Automation',
    description: 'Chain multiple tasks into automated workflows with conditional logic and scheduling.',
    icon: Workflow,
  },
  {
    status: 'planned',
    name: 'Team Collaboration',
    description: 'Shared configurations, task history, and plugin marketplace for teams.',
    icon: Globe,
  },
  {
    status: 'planned',
    name: 'Database-Aware Editing',
    description: 'Direct database schema understanding for smarter ORM code generation and migrations.',
    icon: Database,
  },
  {
    status: 'planned',
    name: 'VS Code Extension',
    description: 'Integrate XibeCode directly into VS Code with inline suggestions and task management.',
    icon: Code2,
  },
  {
    status: 'exploring',
    name: 'Voice Commands',
    description: 'Control XibeCode with natural speech for hands-free coding sessions.',
    icon: Sparkles,
  },
];

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  'in-progress': { bg: 'bg-violet-500/10 border-violet-500/20', text: 'text-violet-400', label: 'In Progress' },
  'planned': { bg: 'bg-cyan-500/10 border-cyan-500/20', text: 'text-cyan-400', label: 'Planned' },
  'exploring': { bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-400', label: 'Exploring' },
};

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function UpdatesPage() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <section className="relative py-20 md:py-28 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 grid-bg" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-violet-600/5 blur-[100px]" />
        </div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <p className="text-sm font-medium text-violet-400 tracking-wider uppercase mb-4">
              Updates & Roadmap
            </p>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 tracking-tight">
              What&apos;s in XibeCode
              <br />
              <span className="text-zinc-500">and what&apos;s coming next</span>
            </h1>
            <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
              A complete overview of current features and our roadmap for upcoming releases.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Current Features */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mb-12"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Check className="h-5 w-5 text-emerald-400" />
              </div>
              <h2 className="text-3xl font-bold text-white">Current Features</h2>
            </div>
            <p className="text-zinc-400 ml-12">
              Everything available in the latest version of XibeCode.
            </p>
          </motion.div>

          <div className="space-y-12">
            {currentFeatures.map((group) => (
              <div key={group.category}>
                <h3 className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-4 ml-1">
                  {group.category}
                </h3>
                <motion.div
                  variants={container}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true }}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
                >
                  {group.items.map((feature, idx) => (
                    <motion.div
                      key={idx}
                      variants={item}
                      className="flex items-start gap-4 p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                    >
                      <div className="p-2 rounded-lg bg-emerald-500/10 shrink-0 mt-0.5">
                        <feature.icon className="h-4 w-4 text-emerald-400" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white mb-1">{feature.name}</h4>
                        <p className="text-xs text-zinc-500 leading-relaxed">{feature.description}</p>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="glow-line" />
      </div>

      {/* Upcoming Features */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mb-12"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-violet-500/10">
                <Clock className="h-5 w-5 text-violet-400" />
              </div>
              <h2 className="text-3xl font-bold text-white">Upcoming Features</h2>
            </div>
            <p className="text-zinc-400 ml-12">
              What we&apos;re working on and planning for future releases.
            </p>
          </motion.div>

          <motion.div
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {upcomingFeatures.map((feature, idx) => {
              const status = statusColors[feature.status];
              return (
                <motion.div
                  key={idx}
                  variants={item}
                  className="flex items-start gap-4 p-5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                >
                  <div className={`p-2 rounded-lg ${status.bg} border shrink-0 mt-0.5`}>
                    <feature.icon className={`h-4 w-4 ${status.text}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-semibold text-white">{feature.name}</h4>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${status.bg} border ${status.text}`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 leading-relaxed">{feature.description}</p>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl font-bold mb-4">Want to contribute?</h2>
            <p className="text-zinc-400 mb-8 max-w-lg mx-auto">
              XibeCode is open-source. Help shape the future of AI-assisted coding by
              contributing on GitHub.
            </p>
            <a
              href="https://github.com/iotserver24/Xibecode"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all font-medium"
            >
              View on GitHub →
            </a>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
