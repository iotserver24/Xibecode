import Link from 'next/link';

export function Footer() {
  return (
    <footer className="w-full border-t border-zinc-800 bg-zinc-950 py-10 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M4 4L12 20L20 4" stroke="url(#xibe-footer)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                <defs>
                  <linearGradient id="xibe-footer" x1="4" y1="4" x2="20" y2="20">
                    <stop stopColor="#8b5cf6"/>
                    <stop offset="1" stopColor="#d946ef"/>
                  </linearGradient>
                </defs>
              </svg>
              XibeCode
            </h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              AI-powered autonomous coding assistant for your terminal and browser.
            </p>
            <p className="text-xs text-zinc-500 mt-2">
              Created by <a href="https://github.com/iotserver24" className="text-violet-400 hover:text-violet-300 transition-colors">Anish Kumar (R3AP3R editz)</a>
            </p>
          </div>

          {/* Documentation */}
          <div>
            <h4 className="text-sm font-semibold text-zinc-200 mb-3">Documentation</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/docs" className="text-zinc-400 hover:text-violet-400 transition-colors">Getting Started</Link></li>
              <li><Link href="/docs/installation" className="text-zinc-400 hover:text-violet-400 transition-colors">Installation</Link></li>
              <li><Link href="/docs/quickstart" className="text-zinc-400 hover:text-violet-400 transition-colors">Quick Start</Link></li>
              <li><Link href="/docs/webui" className="text-zinc-400 hover:text-violet-400 transition-colors">WebUI</Link></li>
            </ul>
          </div>

          {/* Features */}
          <div>
            <h4 className="text-sm font-semibold text-zinc-200 mb-3">Features</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/docs/modes" className="text-zinc-400 hover:text-violet-400 transition-colors">Agent Modes</Link></li>
              <li><Link href="/docs/tools" className="text-zinc-400 hover:text-violet-400 transition-colors">Tools Reference</Link></li>
              <li><Link href="/docs/mcp" className="text-zinc-400 hover:text-violet-400 transition-colors">MCP Integration</Link></li>
              <li><Link href="/docs/plugins" className="text-zinc-400 hover:text-violet-400 transition-colors">Plugins</Link></li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-sm font-semibold text-zinc-200 mb-3">Resources</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="https://github.com/iotserver24/Xibecode" className="text-zinc-400 hover:text-violet-400 transition-colors">GitHub</a></li>
              <li><a href="https://www.npmjs.com/package/xibecode" className="text-zinc-400 hover:text-violet-400 transition-colors">npm Package</a></li>
              <li><Link href="/docs/examples" className="text-zinc-400 hover:text-violet-400 transition-colors">Examples</Link></li>
              <li><Link href="/docs/configuration" className="text-zinc-400 hover:text-violet-400 transition-colors">Configuration</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-6 border-t border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-zinc-500">
            &copy; {new Date().getFullYear()} XibeCode. Apache 2.0 License.
          </p>
          <div className="flex items-center gap-4">
            <a href="https://github.com/iotserver24/Xibecode" className="text-zinc-500 hover:text-violet-400 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            </a>
            <a href="https://www.npmjs.com/package/xibecode" className="text-zinc-500 hover:text-violet-400 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323h13.837v13.229h-3.502v-9.727h-3.502v9.727H5.13z"/>
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
