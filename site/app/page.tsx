'use client';

import Hero from '@/components/Hero';
import Features from '@/components/Features';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Check, X, Minus } from 'lucide-react';

const comparisonData = [
  { feature: 'Open Source', xibecode: true, claude: false, aider: true },
  { feature: 'Free to Use', xibecode: true, claude: false, aider: true },
  { feature: 'Custom API Endpoint', xibecode: true, claude: false, aider: true },
  { feature: '13 Agent Modes (Personas)', xibecode: true, claude: false, aider: false },
  { feature: '95+ Built-in Tools', xibecode: true, claude: true, aider: 'partial' },
  { feature: 'Smart Context Discovery', xibecode: true, claude: true, aider: 'partial' },
  { feature: 'Advanced File Editing (4 methods)', xibecode: true, claude: false, aider: false },
  { feature: 'Cross-Platform', xibecode: true, claude: true, aider: true },
  { feature: 'Loop Detection', xibecode: true, claude: true, aider: false },
  { feature: 'Automatic Backups & Revert', xibecode: true, claude: 'partial', aider: false },
  { feature: 'Neural Memory System', xibecode: true, claude: false, aider: false },
  { feature: 'Test Integration', xibecode: true, claude: false, aider: false },
  { feature: 'Git Awareness', xibecode: true, claude: false, aider: 'partial' },
  { feature: 'MCP Protocol Support', xibecode: true, claude: false, aider: false },
  { feature: 'Plugin System', xibecode: true, claude: false, aider: false },
  { feature: 'Skills System', xibecode: true, claude: false, aider: false },
  { feature: 'Dry-Run Mode', xibecode: true, claude: false, aider: false },
  { feature: 'Risk Assessment', xibecode: true, claude: false, aider: false },
];

function CellIcon({ value }: { value: boolean | string }) {
  if (value === true) return <Check className="h-4 w-4 text-emerald-400 mx-auto" />;
  if (value === false) return <X className="h-4 w-4 text-zinc-700 mx-auto" />;
  return <Minus className="h-4 w-4 text-zinc-500 mx-auto" />;
}

export default function HomePage() {
  return (
    <div>
      <Hero />
      <Features />

      {/* Stats Section */}
      <section className="relative py-16 md:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-6"
          >
            <div className="text-center p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
              <div className="text-4xl font-bold text-gradient mb-2">13</div>
              <div className="text-zinc-400">Agent Modes</div>
            </div>
            <div className="text-center p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
              <div className="text-4xl font-bold text-gradient mb-2">95+</div>
              <div className="text-zinc-400">Built-in Tools</div>
            </div>
            <div className="text-center p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
              <div className="text-4xl font-bold text-gradient mb-2">8</div>
              <div className="text-zinc-400">Tool Categories</div>
            </div>
            <div className="text-center p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
              <div className="text-4xl font-bold text-gradient mb-2">100%</div>
              <div className="text-zinc-400">Open Source</div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Agent Modes Section */}
      <section className="relative py-16 md:py-24">
        <div className="absolute top-0 inset-x-0 glow-line" />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="text-center mb-12"
          >
            <p className="text-sm font-medium text-violet-400 tracking-wider uppercase mb-4">
              13 Specialized Personas
            </p>
            <h2 className="text-3xl md:text-4xl font-bold mb-6 tracking-tight">
              Agent Modes for
              <span className="text-zinc-500"> Every Task</span>
            </h2>
            <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
              Switch between specialized AI personas optimized for different development tasks.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          >
            {[
              { mode: 'agent', name: 'Blaze', role: 'Builder', icon: '🤖', desc: 'Full-stack development' },
              { mode: 'plan', name: 'Aria', role: 'Architect', icon: '📋', desc: 'Planning & analysis' },
              { mode: 'debugger', name: 'Dex', role: 'Detective', icon: '🐛', desc: 'Bug hunting' },
              { mode: 'tester', name: 'Tess', role: 'QA Engineer', icon: '🧪', desc: 'Testing & quality' },
              { mode: 'security', name: 'Sentinel', role: 'Guardian', icon: '🔒', desc: 'Security audits' },
              { mode: 'review', name: 'Nova', role: 'Critic', icon: '👀', desc: 'Code reviews' },
              { mode: 'engineer', name: 'Alex', role: 'Implementer', icon: '🛠️', desc: 'Feature building' },
              { mode: 'team_leader', name: 'Arya', role: 'Leader', icon: '👑', desc: 'Task orchestration' },
            ].map((persona, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
              >
                <div className="text-2xl mb-2">{persona.icon}</div>
                <div className="text-sm font-semibold text-white">{persona.name}</div>
                <div className="text-xs text-violet-400">{persona.role}</div>
                <div className="text-xs text-zinc-500 mt-1">{persona.desc}</div>
              </div>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="text-center mt-8"
          >
            <Link
              href="/docs/modes"
              className="inline-flex items-center text-violet-400 hover:text-violet-300 font-medium"
            >
              View all 13 modes
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Screenshots Section */}
      <section className="relative py-16 md:py-24">
        <div className="absolute top-0 inset-x-0 glow-line" />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="text-center mb-12"
          >
            <p className="text-sm font-medium text-violet-400 tracking-wider uppercase mb-4">
              See It In Action
            </p>
            <h2 className="text-3xl md:text-4xl font-bold mb-6 tracking-tight">
              Modern WebUI
              <span className="text-zinc-500"> Built for Developers</span>
            </h2>
            <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
              A v0.dev-inspired interface with Monaco editor, multi-terminal support, Git integration, and real-time AI chat.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="space-y-8"
          >
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <img src="/screenshots/01-main-interface.png" alt="XibeCode Main Interface" className="w-full" />
              <div className="p-4 bg-white/[0.02] border-t border-white/5">
                <h3 className="font-semibold text-white mb-1">Main Interface</h3>
                <p className="text-sm text-zinc-400">Activity bar, resizable panels, code editor, and integrated terminal</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="rounded-xl border border-white/10 overflow-hidden">
                <img src="/screenshots/06-ai-provider-settings.png" alt="AI Provider Settings" className="w-full" />
                <div className="p-3 bg-white/[0.02] border-t border-white/5">
                  <h3 className="font-semibold text-white text-sm mb-1">AI Provider Settings</h3>
                  <p className="text-xs text-zinc-400">Configure models, API keys, and endpoints</p>
                </div>
              </div>
              
              <div className="rounded-xl border border-white/10 overflow-hidden">
                <img src="/screenshots/04-git-panel.png" alt="Git Panel" className="w-full" />
                <div className="p-3 bg-white/[0.02] border-t border-white/5">
                  <h3 className="font-semibold text-white text-sm mb-1">Git Integration</h3>
                  <p className="text-xs text-zinc-400">Visual commit history and staging</p>
                </div>
              </div>
            </div>

            <div className="text-center">
              <Link
                href="/docs/webui"
                className="inline-flex items-center text-violet-400 hover:text-violet-300 font-medium"
              >
                View more screenshots and features
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Comparison Section */}
      <section className="relative py-24 md:py-36">
        <div className="absolute top-0 inset-x-0 glow-line" />

        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="text-center mb-16"
          >
            <p className="text-sm font-medium text-violet-400 tracking-wider uppercase mb-4">
              Comparison
            </p>
            <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">
              How XibeCode
              <span className="text-zinc-500"> stacks up</span>
            </h2>
            <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
              Feature-by-feature comparison with other AI coding assistants.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="overflow-x-auto"
          >
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-4 px-4 text-sm font-medium text-zinc-400 uppercase tracking-wider">Feature</th>
                  <th className="text-center py-4 px-4">
                    <span className="text-sm font-bold text-gradient">XibeCode</span>
                  </th>
                  <th className="text-center py-4 px-4 text-sm font-medium text-zinc-500">Claude Code</th>
                  <th className="text-center py-4 px-4 text-sm font-medium text-zinc-500">Aider</th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.map((row, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-3.5 px-4 text-sm text-zinc-300">{row.feature}</td>
                    <td className="text-center py-3.5 px-4">
                      <CellIcon value={row.xibecode} />
                    </td>
                    <td className="text-center py-3.5 px-4">
                      <CellIcon value={row.claude} />
                    </td>
                    <td className="text-center py-3.5 px-4">
                      <CellIcon value={row.aider} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 md:py-36 overflow-hidden">
        <div className="absolute top-0 inset-x-0 glow-line" />

        {/* Background glow */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-violet-600/10 blur-[120px]" />
        </div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="text-center max-w-3xl mx-auto"
          >
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 tracking-tight">
              Ready to let AI
              <br />
              <span className="text-gradient">write your code?</span>
            </h2>
            <p className="text-lg md:text-xl text-zinc-400 mb-10 max-w-xl mx-auto">
              Install XibeCode in seconds. Free, open-source, no credit card required.
            </p>

            {/* Install command */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="inline-flex items-center gap-3 px-6 py-3 rounded-xl bg-zinc-900 border border-white/10 font-mono text-sm mb-10"
            >
              <span className="text-emerald-400">$</span>
              <span className="text-white">npm install -g xibecode</span>
            </motion.div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/docs/installation"
                className="group inline-flex items-center justify-center px-8 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-medium shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:from-violet-500 hover:to-fuchsia-500 transition-all"
              >
                Get Started Now
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="/docs"
                className="inline-flex items-center justify-center px-8 py-3.5 rounded-xl border border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 hover:border-white/20 font-medium transition-all"
              >
                View Documentation
              </Link>
            </div>

            <p className="mt-8 text-sm text-zinc-600">
              Free and open-source under Apache 2.0 License.
            </p>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
