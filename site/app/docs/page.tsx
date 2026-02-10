import Link from 'next/link';
import { ArrowRight, Book, Code, Rocket, Settings, Puzzle, FileText } from 'lucide-react';

export default function DocsPage() {
  const sections = [
    {
      icon: Rocket,
      title: 'Installation',
      description: 'Get started with Xoding AI Tool in minutes',
      href: '/docs/installation',
    },
    {
      icon: Book,
      title: 'Quick Start',
      description: 'Your first autonomous coding session',
      href: '/docs/quickstart',
    },
    {
      icon: Settings,
      title: 'Configuration',
      description: 'Customize Xoding for your workflow',
      href: '/docs/configuration',
    },
    {
      icon: Code,
      title: 'MCP Integration',
      description: 'Connect to external MCP servers',
      href: '/docs/mcp',
    },
    {
      icon: Puzzle,
      title: 'Plugins',
      description: 'Extend functionality with custom plugins',
      href: '/docs/plugins',
    },
    {
      icon: FileText,
      title: 'Examples',
      description: 'Real-world use cases and tutorials',
      href: '/docs/examples',
    },
  ];

  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold mb-4">Documentation</h1>
        <p className="text-xl text-muted-foreground">
          Everything you need to know about using Xoding AI Tool
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group p-6 rounded-lg border border-border hover:border-primary hover:shadow-lg transition-all"
          >
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <section.icon className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">
                  {section.title}
                </h3>
                <p className="text-muted-foreground text-sm mb-3">{section.description}</p>
                <div className="flex items-center text-primary text-sm font-medium">
                  Learn more
                  <ArrowRight className="ml-1 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-12 p-6 rounded-lg bg-muted">
        <h2 className="text-2xl font-bold mb-4">Quick Links</h2>
        <ul className="space-y-2 text-muted-foreground">
          <li>
            <a href="https://github.com/iotserver24/Xibecode" className="hover:text-foreground underline">
              GitHub Repository
            </a>
          </li>
          <li>
            <Link href="/docs/installation" className="hover:text-foreground underline">
              Installation Guide
            </Link>
          </li>
          <li>
            <Link href="/docs/examples" className="hover:text-foreground underline">
              Example Use Cases
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
