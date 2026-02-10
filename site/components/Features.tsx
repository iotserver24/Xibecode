'use client';

import { motion } from 'framer-motion';
import {
  Code2,
  Brain,
  Zap,
  Shield,
  GitBranch,
  TestTube,
  Plug,
  FileSearch,
  Layers,
  Sparkles,
  Terminal,
  Lock,
} from 'lucide-react';

const features = [
  {
    icon: Brain,
    title: 'Smart Context Management',
    description: 'Automatically discovers and loads related files — imports, tests, and configs — for intelligent coding decisions.',
    accent: 'violet',
  },
  {
    icon: Code2,
    title: 'Advanced File Editing',
    description: 'Four edit methods: search/replace, line-range edits, insert, and revert. Automatic backups on every change.',
    accent: 'fuchsia',
  },
  {
    icon: TestTube,
    title: 'Test Integration',
    description: 'Auto-detects and runs tests with Vitest, Jest, pytest, or Go test. Iterates until all tests pass.',
    accent: 'emerald',
  },
  {
    icon: GitBranch,
    title: 'Git Awareness',
    description: 'Check status, create checkpoints, focus on changed files, and revert changes safely with stash or commit strategies.',
    accent: 'cyan',
  },
  {
    icon: Plug,
    title: 'MCP Integration',
    description: 'Connect to external MCP servers for extended capabilities — file systems, GitHub, databases, and more.',
    accent: 'violet',
  },
  {
    icon: FileSearch,
    title: 'Plugin System',
    description: 'Extend functionality with custom tools and domain-specific logic through a powerful plugin API.',
    accent: 'fuchsia',
  },
  {
    icon: Shield,
    title: 'Safety Controls',
    description: 'Built-in dry-run mode, risk assessment, and automatic blocking of dangerous commands and operations.',
    accent: 'amber',
  },
  {
    icon: Zap,
    title: 'Autonomous Agent Loop',
    description: 'AI iteratively works on tasks until completion with intelligent loop detection and configurable iteration limits.',
    accent: 'rose',
  },
  {
    icon: Layers,
    title: 'Cross-Platform',
    description: 'Works identically on Windows, macOS, and Linux with automatic OS detection and command adaptation.',
    accent: 'cyan',
  },
  {
    icon: Terminal,
    title: 'Beautiful TUI',
    description: 'Real-time progress bars, colored output, spinners, and clear visualization of every operation.',
    accent: 'violet',
  },
  {
    icon: Sparkles,
    title: 'Enhanced Reasoning',
    description: 'Systematic problem solving, pattern recognition, root cause analysis, and multi-step planning.',
    accent: 'fuchsia',
  },
  {
    icon: Lock,
    title: 'Production Ready',
    description: 'Battle-tested with comprehensive error handling, automatic backups, and full revert capabilities.',
    accent: 'emerald',
  },
];

const accentColors: Record<string, string> = {
  violet: 'from-violet-500 to-violet-600',
  fuchsia: 'from-fuchsia-500 to-fuchsia-600',
  emerald: 'from-emerald-500 to-emerald-600',
  cyan: 'from-cyan-500 to-cyan-600',
  amber: 'from-amber-500 to-amber-600',
  rose: 'from-rose-500 to-rose-600',
};

const accentBorder: Record<string, string> = {
  violet: 'group-hover:border-violet-500/30',
  fuchsia: 'group-hover:border-fuchsia-500/30',
  emerald: 'group-hover:border-emerald-500/30',
  cyan: 'group-hover:border-cyan-500/30',
  amber: 'group-hover:border-amber-500/30',
  rose: 'group-hover:border-rose-500/30',
};

const accentGlow: Record<string, string> = {
  violet: 'group-hover:shadow-violet-500/5',
  fuchsia: 'group-hover:shadow-fuchsia-500/5',
  emerald: 'group-hover:shadow-emerald-500/5',
  cyan: 'group-hover:shadow-cyan-500/5',
  amber: 'group-hover:shadow-amber-500/5',
  rose: 'group-hover:shadow-rose-500/5',
};

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function Features() {
  return (
    <section className="relative py-24 md:py-36">
      {/* Subtle divider */}
      <div className="absolute top-0 inset-x-0 glow-line" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="text-center mb-20"
        >
          <p className="text-sm font-medium text-violet-400 tracking-wider uppercase mb-4">
            Capabilities
          </p>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 tracking-tight">
            Everything you need.
            <br />
            <span className="text-zinc-500">Nothing you don&apos;t.</span>
          </h2>
          <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
            From smart context management to autonomous test execution — XibeCode handles the heavy lifting so you can focus on shipping.
          </p>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              variants={item}
              className={`group relative rounded-xl border border-white/5 bg-white/[0.02] p-6 hover:bg-white/[0.04] ${accentBorder[feature.accent]} ${accentGlow[feature.accent]} shadow-lg shadow-transparent transition-all duration-300`}
            >
              <div className={`inline-flex p-2.5 rounded-lg bg-gradient-to-br ${accentColors[feature.accent]} mb-4 shadow-lg`}>
                <feature.icon className="h-5 w-5 text-white" />
              </div>

              <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
