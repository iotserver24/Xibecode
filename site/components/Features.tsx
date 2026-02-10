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
    description: 'Automatically loads related files, imports, tests, and configs for intelligent coding decisions.',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: Code2,
    title: 'Advanced File Editing',
    description: 'Multiple edit methods: search/replace, line-range edits, and automatic backups with revert capability.',
    color: 'from-purple-500 to-pink-500',
  },
  {
    icon: TestTube,
    title: 'Test Integration',
    description: 'Auto-detect and run tests with Vitest, Jest, pytest, or Go test. Ensures all tests pass.',
    color: 'from-green-500 to-emerald-500',
  },
  {
    icon: GitBranch,
    title: 'Git Awareness',
    description: 'Check status, create checkpoints, focus on changed files, and revert changes safely.',
    color: 'from-orange-500 to-red-500',
  },
  {
    icon: Plug,
    title: 'MCP Integration',
    description: 'Connect to external MCP servers for extended capabilities like file systems, GitHub, databases.',
    color: 'from-indigo-500 to-purple-500',
  },
  {
    icon: FileSearch,
    title: 'Plugin System',
    description: 'Extend functionality with custom tools and domain-specific logic through a powerful plugin API.',
    color: 'from-teal-500 to-green-500',
  },
  {
    icon: Shield,
    title: 'Safety Controls',
    description: 'Dry-run mode, risk assessment, and command blocking for dangerous operations.',
    color: 'from-yellow-500 to-orange-500',
  },
  {
    icon: Zap,
    title: 'Autonomous Loop',
    description: 'AI iteratively works on tasks until completion with loop detection and max iteration limits.',
    color: 'from-pink-500 to-rose-500',
  },
  {
    icon: Layers,
    title: 'Cross-Platform',
    description: 'Works identically on Windows, macOS, and Linux with automatic command adaptation.',
    color: 'from-violet-500 to-purple-500',
  },
  {
    icon: Terminal,
    title: 'Beautiful TUI',
    description: 'Real-time progress tracking, colored output, and clear visualization of all operations.',
    color: 'from-cyan-500 to-blue-500',
  },
  {
    icon: Sparkles,
    title: 'Enhanced Reasoning',
    description: 'Advanced problem-solving, pattern recognition, and systematic error handling.',
    color: 'from-fuchsia-500 to-pink-500',
  },
  {
    icon: Lock,
    title: 'Production Ready',
    description: 'Battle-tested with comprehensive error handling, automatic backups, and revert capabilities.',
    color: 'from-red-500 to-orange-500',
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export default function Features() {
  return (
    <section className="py-20 md:py-32 bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            Powerful Features for
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              {' '}
              Modern Development
            </span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Everything you need for autonomous AI-assisted coding, from context management to test integration.
          </p>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              variants={item}
              whileHover={{
                scale: 1.05,
                transition: { type: 'spring', stiffness: 300 },
              }}
              className="group relative overflow-hidden rounded-xl bg-card border border-border p-6 hover:shadow-lg transition-shadow"
            >
              {/* Gradient Background on Hover */}
              <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-5 transition-opacity`} />

              <div className="relative">
                <div className={`inline-flex p-3 rounded-lg bg-gradient-to-br ${feature.color} mb-4`}>
                  <feature.icon className="h-6 w-6 text-white" />
                </div>

                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
