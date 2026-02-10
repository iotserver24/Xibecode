import Hero from '@/components/Hero';
import Features from '@/components/Features';
import Link from 'next/link';
import { ArrowRight, Check, X } from 'lucide-react';

export default function HomePage() {
  return (
    <div>
      <Hero />
      <Features />

      {/* Comparison Section */}
      <section className="py-20 md:py-32">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              How We Compare
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              See how Xoding AI Tool stacks up against other AI coding assistants
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-border">
                  <th className="text-left py-4 px-4 font-semibold">Feature</th>
                  <th className="text-center py-4 px-4 font-semibold">Xoding AI Tool</th>
                  <th className="text-center py-4 px-4 font-semibold text-muted-foreground">Claude Code</th>
                  <th className="text-center py-4 px-4 font-semibold text-muted-foreground">Aider</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: 'Open Source', xoding: true, claude: false, aider: true },
                  { feature: 'Custom API URL', xoding: true, claude: false, aider: true },
                  { feature: 'Smart Context', xoding: true, claude: true, aider: 'partial' },
                  { feature: 'File Editing', xoding: 'advanced', claude: true, aider: true },
                  { feature: 'Cross-Platform', xoding: true, claude: true, aider: true },
                  { feature: 'Loop Detection', xoding: true, claude: true, aider: false },
                  { feature: 'Auto Backups', xoding: true, claude: 'partial', aider: false },
                  { feature: 'Test Integration', xoding: true, claude: false, aider: false },
                  { feature: 'Git Awareness', xoding: true, claude: false, aider: 'partial' },
                  { feature: 'MCP Support', xoding: true, claude: false, aider: false },
                  { feature: 'Plugin System', xoding: true, claude: false, aider: false },
                  { feature: 'Beautiful TUI', xoding: true, claude: true, aider: 'partial' },
                ].map((row, idx) => (
                  <tr key={idx} className="border-b border-border hover:bg-muted/50 transition-colors">
                    <td className="py-4 px-4">{row.feature}</td>
                    <td className="text-center py-4 px-4">
                      {row.xoding === true ? (
                        <Check className="h-5 w-5 text-green-500 mx-auto" />
                      ) : row.xoding === false ? (
                        <X className="h-5 w-5 text-gray-400 mx-auto" />
                      ) : (
                        <span className="text-sm font-medium text-blue-600">{row.xoding}</span>
                      )}
                    </td>
                    <td className="text-center py-4 px-4 text-muted-foreground">
                      {row.claude === true ? (
                        <Check className="h-5 w-5 text-gray-400 mx-auto" />
                      ) : row.claude === false ? (
                        <X className="h-5 w-5 text-gray-400 mx-auto" />
                      ) : (
                        <span className="text-sm text-gray-500">{row.claude}</span>
                      )}
                    </td>
                    <td className="text-center py-4 px-4 text-muted-foreground">
                      {row.aider === true ? (
                        <Check className="h-5 w-5 text-gray-400 mx-auto" />
                      ) : row.aider === false ? (
                        <X className="h-5 w-5 text-gray-400 mx-auto" />
                      ) : (
                        <span className="text-sm text-gray-500">{row.aider}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-32 bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            Ready to Transform Your Coding Workflow?
          </h2>
          <p className="text-lg md:text-xl mb-8 max-w-2xl mx-auto opacity-90">
            Join developers who are using AI to write better code, faster.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/docs/installation"
              className="inline-flex items-center justify-center px-8 py-3 rounded-lg bg-white text-purple-600 font-medium hover:bg-gray-100 transition-colors"
            >
              Get Started Now
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center justify-center px-8 py-3 rounded-lg border-2 border-white text-white hover:bg-white/10 font-medium transition-colors"
            >
              View Documentation
            </Link>
          </div>
          <p className="mt-8 text-sm opacity-75">
            Free and open-source. No credit card required.
          </p>
        </div>
      </section>
    </div>
  );
}
