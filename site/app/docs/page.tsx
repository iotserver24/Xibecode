import Link from 'next/link';
import { ArrowRight, Book, Code, Rocket, Settings, Puzzle, FileText, Users, Wrench, Shield } from 'lucide-react';

export default function DocsPage() {
  const sections = [
    {
      icon: Rocket,
      title: 'Installation',
      description: 'Install XibeCode and set up your API key in under a minute.',
      href: '/docs/installation',
    },
    {
      icon: Book,
      title: 'Quick Start',
      description: 'Run your first autonomous coding task with XibeCode.',
      href: '/docs/quickstart',
    },
    {
      icon: Users,
      title: 'Agent Modes',
      description: 'Discover 13 specialized AI personas for different tasks.',
      href: '/docs/modes',
    },
    {
      icon: Wrench,
      title: 'Tools Reference',
      description: 'Explore 95+ built-in tools for autonomous coding.',
      href: '/docs/tools',
    },
    {
      icon: Settings,
      title: 'Configuration',
      description: 'Customize models, API endpoints, package managers, and more.',
      href: '/docs/configuration',
    },
    {
      icon: Code,
      title: 'MCP Integration',
      description: 'Connect to external servers via the Model Context Protocol.',
      href: '/docs/mcp',
    },
    {
      icon: Puzzle,
      title: 'Plugins',
      description: 'Extend XibeCode with custom tools and domain-specific logic.',
      href: '/docs/plugins',
    },
    {
      icon: FileText,
      title: 'Examples',
      description: 'Real-world use cases, workflows, and tips for getting the most out of XibeCode.',
      href: '/docs/examples',
    },
  ];

  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold mb-4">Documentation</h1>
        <p className="text-xl text-zinc-400">
          Everything you need to know about using XibeCode — the autonomous AI coding assistant.
        </p>
      </div>

      {/* Feature highlights */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] text-center">
          <div className="text-2xl font-bold text-violet-400">13</div>
          <div className="text-sm text-zinc-500">Agent Modes</div>
        </div>
        <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] text-center">
          <div className="text-2xl font-bold text-violet-400">95+</div>
          <div className="text-sm text-zinc-500">Built-in Tools</div>
        </div>
        <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] text-center">
          <div className="text-2xl font-bold text-violet-400">MCP</div>
          <div className="text-sm text-zinc-500">Protocol Support</div>
        </div>
        <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] text-center">
          <div className="text-2xl font-bold text-violet-400">Open</div>
          <div className="text-sm text-zinc-500">Source (Apache 2.0)</div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group p-6 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-violet-500/20 transition-all"
          >
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-lg bg-violet-500/10 text-violet-400">
                <section.icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-1 group-hover:text-violet-400 transition-colors">
                  {section.title}
                </h3>
                <p className="text-sm text-zinc-500 mb-3">{section.description}</p>
                <div className="flex items-center text-violet-400 text-sm font-medium">
                  Read more
                  <ArrowRight className="ml-1 h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="p-6 rounded-xl border border-white/5 bg-white/[0.02]">
        <h2 className="text-xl font-bold text-white mb-4">Quick Links</h2>
        <ul className="space-y-2 text-sm">
          <li>
            <a href="https://github.com/iotserver24/Xibecode" className="text-violet-400 hover:underline">
              GitHub Repository →
            </a>
          </li>
          <li>
            <Link href="/docs/installation" className="text-violet-400 hover:underline">
              Installation Guide →
            </Link>
          </li>
          <li>
            <Link href="/docs/modes" className="text-violet-400 hover:underline">
              Agent Modes (13 Personas) →
            </Link>
          </li>
          <li>
            <Link href="/docs/tools" className="text-violet-400 hover:underline">
              Tools Reference (95+ Tools) →
            </Link>
          </li>
          <li>
            <Link href="/docs/examples" className="text-violet-400 hover:underline">
              Example Use Cases →
            </Link>
          </li>
          <li>
            <Link href="/updates" className="text-violet-400 hover:underline">
              Roadmap & Upcoming Features →
            </Link>
          </li>
        </ul>
      </div>

      <div className="p-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
        <h2 className="text-xl font-bold text-white mb-2">New to XibeCode?</h2>
        <p className="text-zinc-400 mb-4">
          Start with the Quick Start guide to run your first autonomous coding task, then explore
          the Agent Modes to discover the 13 specialized AI personas.
        </p>
        <div className="flex gap-3">
          <Link
            href="/docs/quickstart"
            className="inline-flex items-center px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors text-sm font-medium"
          >
            Quick Start →
          </Link>
          <Link
            href="/docs/modes"
            className="inline-flex items-center px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 transition-colors text-sm font-medium"
          >
            Agent Modes →
          </Link>
        </div>
      </div>
    </div>
  );
}
