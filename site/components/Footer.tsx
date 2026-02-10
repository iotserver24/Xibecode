import Link from 'next/link';
import { Github, Twitter, Linkedin } from 'lucide-react';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-muted/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* About */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center space-x-2 mb-4">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <span className="text-white font-bold text-lg">X</span>
              </div>
              <span className="text-lg font-bold">Xoding AI Tool</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-md mb-4">
              Production-ready autonomous coding agent powered by Claude AI. Open-source, customizable, with advanced context management.
            </p>
            <p className="text-xs text-muted-foreground">
              Created by{' '}
              <a
                href="https://github.com/iotserver24"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground underline"
              >
                iotserver24
              </a>
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              <strong>Note:</strong> Not yet open-source but planned to be made open-source
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/" className="hover:text-foreground">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/docs" className="hover:text-foreground">
                  Documentation
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/iotserver24/Xibecode"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="font-semibold mb-4">Resources</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/docs/installation" className="hover:text-foreground">
                  Installation
                </Link>
              </li>
              <li>
                <Link href="/docs/quickstart" className="hover:text-foreground">
                  Quick Start
                </Link>
              </li>
              <li>
                <Link href="/docs/mcp" className="hover:text-foreground">
                  MCP Integration
                </Link>
              </li>
              <li>
                <Link href="/docs/examples" className="hover:text-foreground">
                  Examples
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 pt-8 border-t">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <p className="text-sm text-muted-foreground">
              © {currentYear} Xoding AI Tool. Built with ❤️ by{' '}
              <a
                href="https://github.com/iotserver24"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground underline"
              >
                iotserver24
              </a>
            </p>
            <div className="flex items-center space-x-4">
              <a
                href="https://github.com/iotserver24"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
                aria-label="GitHub"
              >
                <Github className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
