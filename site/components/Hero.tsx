'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Terminal, Sparkles, Zap, GitBranch, Shield } from 'lucide-react';

export default function Hero() {
  return (
    <section className="relative overflow-hidden min-h-[90vh] flex items-center">
      {/* Animated Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-violet-950/20 via-transparent to-transparent" />
        <div className="absolute inset-0 grid-bg" />

        {/* Floating orbs */}
        <motion.div
          className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-violet-600/8 blur-[100px]"
          animate={{
            y: [0, 40, 0],
            x: [0, 20, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-fuchsia-600/8 blur-[100px]"
          animate={{
            y: [0, -30, 0],
            x: [0, -20, 0],
            scale: [1, 1.15, 1],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute top-1/2 right-1/3 w-[300px] h-[300px] rounded-full bg-cyan-600/5 blur-[80px]"
          animate={{
            y: [0, 30, 0],
            x: [0, -15, 0],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Column */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="space-y-8"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-violet-500/20 bg-violet-500/5 text-violet-300 text-sm font-medium"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Open-Source AI Coding Agent
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.7 }}
              className="text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight"
            >
              <span className="text-gradient">XibeCode</span>
              <br />
              <span className="text-white/90">writes code.</span>
              <br />
              <span className="text-zinc-500">You ship.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.7 }}
              className="text-lg md:text-xl text-zinc-400 max-w-xl leading-relaxed"
            >
              Autonomous AI coding assistant that builds features, fixes bugs,
              refactors code, and runs tests — all from your terminal. Powered by Claude AI.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.7 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <Link
                href="/docs/installation"
                className="group inline-flex items-center justify-center px-8 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-medium shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:from-violet-500 hover:to-fuchsia-500 transition-all"
              >
                Get Started
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="/docs"
                className="inline-flex items-center justify-center px-8 py-3.5 rounded-xl border border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 hover:border-white/20 font-medium transition-all"
              >
                Read the Docs
              </Link>
            </motion.div>

            {/* Quick stats */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.7 }}
              className="flex flex-wrap gap-6 pt-4"
            >
              {[
                { icon: Terminal, label: 'CLI-First', color: 'text-violet-400' },
                { icon: Zap, label: 'Autonomous', color: 'text-fuchsia-400' },
                { icon: GitBranch, label: 'Git-Aware', color: 'text-cyan-400' },
                { icon: Shield, label: 'Safe by Default', color: 'text-emerald-400' },
              ].map((stat) => (
                <div key={stat.label} className="flex items-center gap-2 text-sm text-zinc-500">
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  <span>{stat.label}</span>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* Right Column — Terminal Demo */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5, duration: 0.9 }}
            className="relative"
          >
            {/* Glow behind terminal */}
            <div className="absolute -inset-4 bg-gradient-to-br from-violet-600/10 to-fuchsia-600/10 rounded-2xl blur-2xl" />

            <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/50">
              {/* Terminal header */}
              <div className="bg-zinc-900/80 px-4 py-3 flex items-center gap-3 border-b border-white/5">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <span className="text-xs text-zinc-500 font-mono ml-2">terminal — xibecode</span>
              </div>

              {/* Terminal body */}
              <div className="bg-zinc-950/90 p-6 font-mono text-sm leading-relaxed relative overflow-hidden">
                {/* Scan line effect */}
                <div className="absolute inset-x-0 h-8 bg-gradient-to-b from-violet-500/3 to-transparent animate-scan-line pointer-events-none" />

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1, duration: 0.3 }}
                >
                  <span className="text-emerald-400">❯</span>
                  <span className="text-white ml-2">npm install -g xibecode</span>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.5, duration: 0.3 }}
                  className="mt-1 text-zinc-600"
                >
                  ✓ installed xibecode@0.0.5
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 2, duration: 0.3 }}
                  className="mt-4"
                >
                  <span className="text-emerald-400">❯</span>
                  <span className="text-white ml-2">xibecode run &quot;Add user authentication&quot;</span>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 2.5, duration: 0.5 }}
                  className="mt-4 space-y-1.5"
                >
                  <div className="text-zinc-500">
                    <span className="text-violet-400">◆</span> Reading project structure...
                  </div>
                  <div className="text-zinc-500">
                    <span className="text-violet-400">◆</span> Analyzing dependencies...
                  </div>
                  <div className="text-zinc-500">
                    <span className="text-fuchsia-400">◆</span> Creating auth middleware...
                  </div>
                  <div className="text-zinc-500">
                    <span className="text-fuchsia-400">◆</span> Adding JWT token handling...
                  </div>
                  <div className="text-zinc-500">
                    <span className="text-cyan-400">◆</span> Writing tests...
                  </div>
                  <div className="text-zinc-500">
                    <span className="text-cyan-400">◆</span> Running test suite...
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 3.5, duration: 0.4 }}
                  className="mt-4 pt-3 border-t border-white/5"
                >
                  <span className="text-emerald-400">✓</span>
                  <span className="text-white ml-2">Done — 6 files created, all tests passing</span>
                </motion.div>
              </div>
            </div>

            {/* Floating accent elements */}
            <motion.div
              className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-violet-500/60 blur-sm"
              animate={{ y: [0, -8, 0], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute -bottom-2 -left-2 w-4 h-4 rounded-full bg-fuchsia-500/60 blur-sm"
              animate={{ y: [0, 6, 0], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
