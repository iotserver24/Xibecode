import Link from 'next/link';
import { Github } from 'lucide-react';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-white/5 bg-zinc-950/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* About */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center space-x-3 mb-4">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                <span className="text-white font-bold text-lg">X</span>
              </div>
              <span className="text-lg font-bold text-gradient">XibeCode</span>
            </div>
            <p className="text-sm text-zinc-500 max-w-md mb-4 leading-relaxed">
              Production-ready autonomous coding agent for your terminal.
              Open-source, free, and fully customizable with smart context management and MCP support.
            </p>
            <p className="text-xs text-zinc-600">
              Created by{' '}
              <a
                href="https://github.com/iotserver24"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 hover:text-white transition-colors underline underline-offset-2"
              >
                iotserver24
              </a>
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold text-zinc-300 mb-4 text-sm uppercase tracking-wider">Navigate</h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/" className="text-zinc-500 hover:text-white transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/docs" className="text-zinc-500 hover:text-white transition-colors">
                  Documentation
                </Link>
              </li>
              <li>
                <Link href="/updates" className="text-zinc-500 hover:text-white transition-colors">
                  Updates
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/iotserver24/Xibecode"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-500 hover:text-white transition-colors"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="font-semibold text-zinc-300 mb-4 text-sm uppercase tracking-wider">Resources</h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/docs/installation" className="text-zinc-500 hover:text-white transition-colors">
                  Installation
                </Link>
              </li>
              <li>
                <Link href="/docs/quickstart" className="text-zinc-500 hover:text-white transition-colors">
                  Quick Start
                </Link>
              </li>
              <li>
                <Link href="/docs/mcp" className="text-zinc-500 hover:text-white transition-colors">
                  MCP Integration
                </Link>
              </li>
              <li>
                <Link href="/docs/plugins" className="text-zinc-500 hover:text-white transition-colors">
                  Plugins
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-10 pt-8 border-t border-white/5">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs text-zinc-600">
              © {currentYear} XibeCode. Built with ❤️ by{' '}
              <a
                href="https://github.com/iotserver24"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 hover:text-white transition-colors"
              >
                iotserver24
              </a>
            </p>
            <a
              href="https://github.com/iotserver24/Xibecode"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-600 hover:text-white transition-colors"
              aria-label="GitHub"
            >
              <Github className="h-5 w-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
