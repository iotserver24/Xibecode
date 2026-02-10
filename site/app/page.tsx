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
  { feature: 'Smart Context Discovery', xibecode: true, claude: true, aider: 'partial' },
  { feature: 'Advanced File Editing (4 methods)', xibecode: true, claude: false, aider: false },
  { feature: 'Cross-Platform', xibecode: true, claude: true, aider: true },
  { feature: 'Loop Detection', xibecode: true, claude: true, aider: false },
  { feature: 'Automatic Backups & Revert', xibecode: true, claude: 'partial', aider: false },
  { feature: 'Test Integration', xibecode: true, claude: false, aider: false },
  { feature: 'Git Awareness', xibecode: true, claude: false, aider: 'partial' },
  { feature: 'MCP Protocol Support', xibecode: true, claude: false, aider: false },
  { feature: 'Plugin System', xibecode: true, claude: false, aider: false },
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
              Free and open-source under MIT License.
            </p>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
