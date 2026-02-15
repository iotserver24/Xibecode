'use client';

import { Monitor, Settings, GitBranch, TestTube, MessageSquare, Palette, Terminal, FileText, Zap, Layers, Keyboard, Globe } from 'lucide-react';

export default function WebUIPage() {
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold mb-4">WebUI</h1>
        <p className="text-xl text-zinc-400">
          A browser-based interface that syncs in real-time with the terminal. Chat, switch modes, reference files, and configure settings - all from your browser.
        </p>
      </div>

      {/* Quick Start */}
      <div className="p-6 rounded-xl border border-violet-500/20 bg-violet-500/5">
        <h2 className="text-xl font-bold text-white mb-4">Quick Start</h2>
        <div className="bg-zinc-900/50 rounded-lg p-4 font-mono text-sm">
          <div className="text-zinc-500"># Start chat with both TUI and WebUI</div>
          <div className="text-emerald-400">xibecode chat</div>
          <div className="text-zinc-500 mt-2"># WebUI opens at http://localhost:3847</div>
          <div className="text-zinc-500"># Both interfaces are synchronized in real-time</div>
        </div>
      </div>

      {/* Screenshots */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Screenshots</h2>
        <div className="space-y-8">
          <div>
            <h3 className="text-lg font-semibold text-emerald-400 mb-3">Main Interface</h3>
            <p className="text-zinc-400 mb-3">Modern v0.dev-inspired interface with activity bar, chat panel, code editor, and terminal</p>
            <img src="/screenshots/01-main-interface.png" alt="Main Interface" className="w-full rounded-lg border border-white/10" />
          </div>
          
          <div>
            <h3 className="text-lg font-semibold text-emerald-400 mb-3">File Explorer</h3>
            <p className="text-zinc-400 mb-3">Browse and open files with recursive directory tree</p>
            <img src="/screenshots/02-file-explorer.png" alt="File Explorer" className="w-full rounded-lg border border-white/10" />
          </div>
          
          <div>
            <h3 className="text-lg font-semibold text-emerald-400 mb-3">Chat Interface</h3>
            <p className="text-zinc-400 mb-3">Interactive AI chat with streaming responses and markdown rendering</p>
            <img src="/screenshots/03-chat-interface.png" alt="Chat Interface" className="w-full rounded-lg border border-white/10" />
          </div>
          
          <div>
            <h3 className="text-lg font-semibold text-emerald-400 mb-3">Git Panel</h3>
            <p className="text-zinc-400 mb-3">Git integration with commit history, staging, and diffs</p>
            <img src="/screenshots/04-git-panel.png" alt="Git Panel" className="w-full rounded-lg border border-white/10" />
          </div>
          
          <div>
            <h3 className="text-lg font-semibold text-emerald-400 mb-3">Settings Panel</h3>
            <p className="text-zinc-400 mb-3">Comprehensive settings modal with multiple configuration categories</p>
            <img src="/screenshots/05-settings-panel.png" alt="Settings Panel" className="w-full rounded-lg border border-white/10" />
          </div>
          
          <div>
            <h3 className="text-lg font-semibold text-emerald-400 mb-3">AI Provider Settings</h3>
            <p className="text-zinc-400 mb-3">Configure AI models, API keys, and provider settings</p>
            <img src="/screenshots/06-ai-provider-settings.png" alt="AI Provider Settings" className="w-full rounded-lg border border-white/10" />
          </div>
          
          <div>
            <h3 className="text-lg font-semibold text-emerald-400 mb-3">MCP Servers Editor</h3>
            <p className="text-zinc-400 mb-3">Edit MCP server configuration with Monaco editor and syntax highlighting</p>
            <img src="/screenshots/07-mcp-servers-editor.png" alt="MCP Servers Editor" className="w-full rounded-lg border border-white/10" />
          </div>
          
          <div>
            <h3 className="text-lg font-semibold text-emerald-400 mb-3">Terminal View</h3>
            <p className="text-zinc-400 mb-3">Fully interactive terminal with PTY support, colors, and tab completion</p>
            <img src="/screenshots/08-terminal-view.png" alt="Terminal View" className="w-full rounded-lg border border-white/10" />
          </div>
        </div>
      </div>

      {/* New in v0.4.0 */}
      <div className="p-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
        <h2 className="text-xl font-bold text-white mb-4">New in v0.4.0</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="flex items-center gap-2 text-zinc-300">
            <Zap className="h-4 w-4 text-emerald-400" />
            <span>TUI-WebUI bidirectional sync</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-300">
            <Keyboard className="h-4 w-4 text-emerald-400" />
            <span>Slash commands for mode switching</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-300">
            <FileText className="h-4 w-4 text-emerald-400" />
            <span>@ file references</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-300">
            <Globe className="h-4 w-4 text-emerald-400" />
            <span>Custom model/endpoint support</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-300">
            <Layers className="h-4 w-4 text-emerald-400" />
            <span>Tool execution display</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-300">
            <Terminal className="h-4 w-4 text-emerald-400" />
            <span>Minimalistic terminal design</span>
          </div>
        </div>
      </div>

      {/* TUI-WebUI Sync */}
      <div>
        <h2 className="text-2xl font-bold mb-6">TUI-WebUI Sync</h2>
        <p className="text-zinc-400 mb-4">
          When you run <code className="text-violet-400">xibecode chat</code>, both the terminal and browser interfaces are connected in real-time:
        </p>
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div className="p-4 rounded-lg border border-white/5 bg-white/[0.02]">
            <h3 className="font-semibold text-emerald-400 mb-2">From TUI → WebUI</h3>
            <ul className="text-sm text-zinc-400 space-y-1">
              <li>• Messages appear with "(TUI)" label</li>
              <li>• Streaming responses show live</li>
              <li>• Tool calls display in real-time</li>
            </ul>
          </div>
          <div className="p-4 rounded-lg border border-white/5 bg-white/[0.02]">
            <h3 className="font-semibold text-violet-400 mb-2">From WebUI → TUI</h3>
            <ul className="text-sm text-zinc-400 space-y-1">
              <li>• Messages processed by TUI agent</li>
              <li>• Full tool access and execution</li>
              <li>• Responses stream to both interfaces</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Slash Commands */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Slash Commands (<code className="text-violet-400">/</code>)</h2>
        <p className="text-zinc-400 mb-4">
          Type <code className="text-violet-400">/</code> in the input to open the command palette. Use arrow keys to navigate and Enter to select.
        </p>

        {/* Commands */}
        <h3 className="text-lg font-semibold text-emerald-400 mb-3">Commands</h3>
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-3 px-4 font-semibold">Command</th>
                <th className="text-left py-3 px-4 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/clear</td>
                <td className="py-3 px-4">Clear chat messages</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/help</td>
                <td className="py-3 px-4">Show available commands and tips</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/diff</td>
                <td className="py-3 px-4">Show git diff</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/status</td>
                <td className="py-3 px-4">Show git status</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/test</td>
                <td className="py-3 px-4">Run project tests</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/format</td>
                <td className="py-3 px-4">Format code in project</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/reset</td>
                <td className="py-3 px-4">Reset chat session</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/files</td>
                <td className="py-3 px-4">List project files</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Modes */}
        <h3 className="text-lg font-semibold text-emerald-400 mb-3">Agent Modes</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-3 px-4 font-semibold">Mode</th>
                <th className="text-left py-3 px-4 font-semibold">Icon</th>
                <th className="text-left py-3 px-4 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/mode agent</td>
                <td className="py-3 px-4">🤖</td>
                <td className="py-3 px-4">Autonomous coding (default)</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/mode plan</td>
                <td className="py-3 px-4">📋</td>
                <td className="py-3 px-4">Analyze without modifying code</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/mode tester</td>
                <td className="py-3 px-4">🧪</td>
                <td className="py-3 px-4">Testing and QA</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/mode debugger</td>
                <td className="py-3 px-4">🐛</td>
                <td className="py-3 px-4">Bug investigation</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/mode security</td>
                <td className="py-3 px-4">🔒</td>
                <td className="py-3 px-4">Security analysis</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/mode review</td>
                <td className="py-3 px-4">👀</td>
                <td className="py-3 px-4">Code review</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/mode team_leader</td>
                <td className="py-3 px-4">👑</td>
                <td className="py-3 px-4">Coordinate team of agents</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/mode architect</td>
                <td className="py-3 px-4">🏛️</td>
                <td className="py-3 px-4">System design</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/mode engineer</td>
                <td className="py-3 px-4">🛠️</td>
                <td className="py-3 px-4">Implementation</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/mode seo</td>
                <td className="py-3 px-4">🌐</td>
                <td className="py-3 px-4">SEO optimization</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/mode product</td>
                <td className="py-3 px-4">🔥</td>
                <td className="py-3 px-4">Product strategy</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/mode data</td>
                <td className="py-3 px-4">📊</td>
                <td className="py-3 px-4">Data analysis</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/mode researcher</td>
                <td className="py-3 px-4">📚</td>
                <td className="py-3 px-4">Deep research</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* File References */}
      <div>
        <h2 className="text-2xl font-bold mb-6">File References (<code className="text-violet-400">@</code>)</h2>
        <p className="text-zinc-400 mb-4">
          Type <code className="text-violet-400">@</code> in the input to browse and reference project files:
        </p>
        <ul className="list-disc list-inside text-zinc-400 space-y-2 mb-4">
          <li>Shows files and folders in your project</li>
          <li>Type after @ to filter (e.g., <code className="text-violet-400">@src/</code>)</li>
          <li>Use arrow keys to navigate, Enter to select</li>
          <li>Selected file path is inserted into your message</li>
        </ul>
        <div className="bg-zinc-900/50 rounded-lg p-4 font-mono text-sm">
          <div className="text-zinc-500"># Example usage</div>
          <div className="text-emerald-400">Fix the bug in @src/utils/helpers.ts</div>
        </div>
      </div>

      {/* Settings Panel */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Settings Panel</h2>
        <p className="text-zinc-400 mb-4">
          Click the ⚙️ Settings button in the header to configure:
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg border border-white/5 bg-white/[0.02]">
            <h3 className="font-semibold text-violet-400 mb-2">AI Provider</h3>
            <ul className="text-sm text-zinc-400 space-y-1">
              <li>• <strong className="text-white">Provider</strong> - Anthropic, OpenAI, or Custom</li>
              <li>• <strong className="text-white">Model</strong> - Select from available models</li>
              <li>• <strong className="text-white">Custom Model ID</strong> - For local/custom LLMs</li>
              <li>• <strong className="text-white">API Key</strong> - Your provider API key</li>
              <li>• <strong className="text-white">Base URL</strong> - Custom API endpoint</li>
            </ul>
          </div>
          <div className="p-4 rounded-lg border border-white/5 bg-white/[0.02]">
            <h3 className="font-semibold text-violet-400 mb-2">Session Info</h3>
            <ul className="text-sm text-zinc-400 space-y-1">
              <li>• <strong className="text-white">Working Directory</strong> - Current project path</li>
              <li>• <strong className="text-white">Git Branch</strong> - Current branch name</li>
              <li>• <strong className="text-white">Session ID</strong> - Current session identifier</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Features</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <FeatureCard
            icon={MessageSquare}
            title="Real-time Streaming"
            description="See AI responses as they're generated. No waiting for complete responses."
          />
          <FeatureCard
            icon={Layers}
            title="Tool Execution Display"
            description="Watch each tool call with live status indicators: running, done, or failed."
          />
          <FeatureCard
            icon={Terminal}
            title="Markdown Rendering"
            description="Rich text formatting with code blocks, bold, italic, lists, and links."
          />
          <FeatureCard
            icon={Monitor}
            title="Thinking Indicator"
            description="Spinner animation shows when the AI is processing your request."
          />
          <FeatureCard
            icon={Palette}
            title="Minimalistic Design"
            description="Clean, terminal-style interface with dark theme and monospace fonts."
          />
          <FeatureCard
            icon={Settings}
            title="Responsive Layout"
            description="Works on desktop and mobile. Adapts to any screen size."
          />
        </div>
      </div>

      {/* Header Info */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Header Display</h2>
        <p className="text-zinc-400 mb-4">
          The header shows key information at a glance:
        </p>
        <div className="bg-zinc-900/50 rounded-lg p-4">
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-zinc-500">Path:</span>
              <span className="text-emerald-400 ml-2">~/projects/myapp</span>
            </div>
            <div>
              <span className="text-zinc-500">Model:</span>
              <span className="text-emerald-400 ml-2">claude-sonnet</span>
            </div>
            <div>
              <span className="text-zinc-500">Mode:</span>
              <span className="text-emerald-400 ml-2">Agent</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span className="text-zinc-400">Connected</span>
            </div>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Keyboard Shortcuts</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-3 px-4 font-semibold">Shortcut</th>
                <th className="text-left py-3 px-4 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              <tr className="border-b border-white/5">
                <td className="py-3 px-4"><kbd className="px-2 py-1 bg-zinc-800 rounded text-xs">/</kbd></td>
                <td className="py-3 px-4">Open mode selector</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4"><kbd className="px-2 py-1 bg-zinc-800 rounded text-xs">@</kbd></td>
                <td className="py-3 px-4">Open file browser</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4"><kbd className="px-2 py-1 bg-zinc-800 rounded text-xs">Enter</kbd></td>
                <td className="py-3 px-4">Send message / Select item</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4"><kbd className="px-2 py-1 bg-zinc-800 rounded text-xs">Shift+Enter</kbd></td>
                <td className="py-3 px-4">New line in message</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4"><kbd className="px-2 py-1 bg-zinc-800 rounded text-xs">↑</kbd> <kbd className="px-2 py-1 bg-zinc-800 rounded text-xs">↓</kbd></td>
                <td className="py-3 px-4">Navigate popup options</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4"><kbd className="px-2 py-1 bg-zinc-800 rounded text-xs">Esc</kbd></td>
                <td className="py-3 px-4">Close popup</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Multi-Model Support */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Multi-Model Support</h2>
        <p className="text-zinc-400 mb-4">
          Switch between models in the Settings panel:
        </p>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border border-white/5 bg-white/[0.02]">
            <h3 className="font-semibold text-violet-400 mb-2">Anthropic</h3>
            <ul className="text-sm text-zinc-400 space-y-1">
              <li>Claude Sonnet 4.5</li>
              <li>Claude Opus 4.5</li>
              <li>Claude Haiku 4.5</li>
            </ul>
          </div>
          <div className="p-4 rounded-lg border border-white/5 bg-white/[0.02]">
            <h3 className="font-semibold text-violet-400 mb-2">OpenAI</h3>
            <ul className="text-sm text-zinc-400 space-y-1">
              <li>GPT-4o</li>
              <li>GPT-4o Mini</li>
              <li>GPT-4 Turbo</li>
              <li>GPT-3.5 Turbo</li>
            </ul>
          </div>
          <div className="p-4 rounded-lg border border-white/5 bg-white/[0.02]">
            <h3 className="font-semibold text-violet-400 mb-2">Custom</h3>
            <ul className="text-sm text-zinc-400 space-y-1">
              <li>Any OpenAI-compatible API</li>
              <li>Local LLMs (Ollama, LM Studio)</li>
              <li>Custom model IDs</li>
            </ul>
          </div>
        </div>
      </div>

      {/* API Reference */}
      <div>
        <h2 className="text-2xl font-bold mb-6">API Reference</h2>
        <p className="text-zinc-400 mb-4">
          The WebUI server exposes REST endpoints:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-3 px-4 font-semibold">Endpoint</th>
                <th className="text-left py-3 px-4 font-semibold">Method</th>
                <th className="text-left py-3 px-4 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/api/config</td>
                <td className="py-3 px-4">GET/PUT</td>
                <td className="py-3 px-4">Get or update configuration</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/api/project</td>
                <td className="py-3 px-4">GET</td>
                <td className="py-3 px-4">Project info (name, git, etc.)</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/api/files</td>
                <td className="py-3 px-4">GET</td>
                <td className="py-3 px-4">List project files (for @ command)</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/api/git/status</td>
                <td className="py-3 px-4">GET</td>
                <td className="py-3 px-4">Git status information</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/api/git/diff</td>
                <td className="py-3 px-4">GET</td>
                <td className="py-3 px-4">Git diff output</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/api/tests/generate</td>
                <td className="py-3 px-4">POST</td>
                <td className="py-3 px-4">Generate tests for a file</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* WebSocket */}
      <div>
        <h2 className="text-2xl font-bold mb-6">WebSocket Connection</h2>
        <p className="text-zinc-400 mb-4">
          Connect via WebSocket with bridge mode for TUI sync:
        </p>
        <div className="bg-zinc-900/50 rounded-lg p-4 font-mono text-sm">
          <div className="text-zinc-500">// Connect in bridge mode</div>
          <div className="text-emerald-400">{`const ws = new WebSocket('ws://localhost:3847?mode=bridge');`}</div>
          <div className="text-zinc-500 mt-2">// Send message to TUI</div>
          <div className="text-emerald-400">{`ws.send(JSON.stringify({ type: 'message', content: 'Hello' }));`}</div>
          <div className="text-zinc-500 mt-2">// Receive events</div>
          <div className="text-emerald-400">{`ws.onmessage = (e) => {`}</div>
          <div className="text-emerald-400 pl-4">{`const data = JSON.parse(e.data);`}</div>
          <div className="text-emerald-400 pl-4">{`// Types: user_message, stream_start, stream_text, stream_end,`}</div>
          <div className="text-emerald-400 pl-4">{`//        tool_call, tool_result, thinking, error`}</div>
          <div className="text-emerald-400">{`};`}</div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="p-4 rounded-lg border border-white/5 bg-white/[0.02]">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-violet-500/10 text-violet-400">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h3 className="font-semibold text-white mb-1">{title}</h3>
          <p className="text-sm text-zinc-400">{description}</p>
        </div>
      </div>
    </div>
  );
}
