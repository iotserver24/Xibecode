'use client';

import { Monitor, Settings, GitBranch, TestTube, MessageSquare, Palette } from 'lucide-react';

export default function WebUIPage() {
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold mb-4">WebUI</h1>
        <p className="text-xl text-zinc-400">
          A browser-based interface for XibeCode with dashboard, visual diff, chat, and configuration management.
        </p>
      </div>

      {/* Quick Start */}
      <div className="p-6 rounded-xl border border-violet-500/20 bg-violet-500/5">
        <h2 className="text-xl font-bold text-white mb-4">Quick Start</h2>
        <div className="bg-zinc-900/50 rounded-lg p-4 font-mono text-sm">
          <div className="text-zinc-500"># Start the WebUI</div>
          <div className="text-emerald-400">xibecode ui --open</div>
          <div className="text-zinc-500 mt-2"># Server runs at http://localhost:3847</div>
        </div>
      </div>

      {/* Features Grid */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Features</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <FeatureCard
            icon={Monitor}
            title="Dashboard"
            description="View project stats, git status, test runner info, and dependency counts at a glance."
          />
          <FeatureCard
            icon={MessageSquare}
            title="Chat Interface"
            description="Real-time streaming chat with the AI agent. Full tool use support with live progress updates."
          />
          <FeatureCard
            icon={GitBranch}
            title="Visual Diff"
            description="Colorized git diff viewer with syntax highlighting. Green for additions, red for deletions."
          />
          <FeatureCard
            icon={TestTube}
            title="AI Test Generator"
            description="Generate comprehensive test suites with one click. Supports Vitest, Jest, Mocha, pytest."
          />
          <FeatureCard
            icon={Settings}
            title="Configuration Panel"
            description="Manage API keys, select models, and configure settings directly in the browser."
          />
          <FeatureCard
            icon={Palette}
            title="Multi-Model Selector"
            description="Switch between Claude, GPT-4, and other models instantly from the UI."
          />
        </div>
      </div>

      {/* CLI Options */}
      <div>
        <h2 className="text-2xl font-bold mb-6">CLI Options</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-3 px-4 font-semibold">Option</th>
                <th className="text-left py-3 px-4 font-semibold">Default</th>
                <th className="text-left py-3 px-4 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">-p, --port</td>
                <td className="py-3 px-4">3847</td>
                <td className="py-3 px-4">Port to run the server on</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">-h, --host</td>
                <td className="py-3 px-4">localhost</td>
                <td className="py-3 px-4">Host to bind to</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">--open</td>
                <td className="py-3 px-4">false</td>
                <td className="py-3 px-4">Automatically open browser</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Dashboard Section */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Dashboard</h2>
        <p className="text-zinc-400 mb-4">
          The dashboard provides an overview of your project:
        </p>
        <ul className="list-disc list-inside text-zinc-400 space-y-2">
          <li><strong className="text-white">Project Name</strong> - From package.json or directory name</li>
          <li><strong className="text-white">Git Branch</strong> - Current branch name</li>
          <li><strong className="text-white">Git Status</strong> - Clean or dirty (uncommitted changes)</li>
          <li><strong className="text-white">Test Runner</strong> - Detected test framework (Vitest, Jest, etc.)</li>
          <li><strong className="text-white">Dependencies</strong> - Count of production and dev dependencies</li>
        </ul>
      </div>

      {/* Chat Interface */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Chat Interface</h2>
        <p className="text-zinc-400 mb-4">
          The chat interface provides real-time communication with the AI agent:
        </p>
        <ul className="list-disc list-inside text-zinc-400 space-y-2">
          <li><strong className="text-white">Streaming responses</strong> - See the AI thinking in real-time</li>
          <li><strong className="text-white">Tool execution</strong> - Watch file edits, commands, and more</li>
          <li><strong className="text-white">WebSocket connection</strong> - Persistent, low-latency communication</li>
          <li><strong className="text-white">Session persistence</strong> - Continue conversations across refreshes</li>
        </ul>
      </div>

      {/* Visual Diff */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Visual Diff</h2>
        <p className="text-zinc-400 mb-4">
          Review your git changes with syntax-highlighted diffs:
        </p>
        <div className="bg-zinc-900/50 rounded-lg p-4 font-mono text-sm">
          <div className="text-zinc-500">--- a/src/app.ts</div>
          <div className="text-zinc-500">+++ b/src/app.ts</div>
          <div className="text-zinc-500">@@ -10,3 +10,5 @@</div>
          <div className="text-red-400">- const old = 1;</div>
          <div className="text-emerald-400">+ const new = 2;</div>
          <div className="text-emerald-400">+ const added = 3;</div>
        </div>
      </div>

      {/* Multi-Model Support */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Multi-Model Support</h2>
        <p className="text-zinc-400 mb-4">
          Switch between models directly in the WebUI:
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg border border-white/5 bg-white/[0.02]">
            <h3 className="font-semibold text-violet-400 mb-2">Anthropic Models</h3>
            <ul className="text-sm text-zinc-400 space-y-1">
              <li>Claude Sonnet 4.5 (default)</li>
              <li>Claude Opus 4.5 (premium)</li>
              <li>Claude Haiku 4.5 (fast)</li>
            </ul>
          </div>
          <div className="p-4 rounded-lg border border-white/5 bg-white/[0.02]">
            <h3 className="font-semibold text-violet-400 mb-2">OpenAI Models</h3>
            <ul className="text-sm text-zinc-400 space-y-1">
              <li>GPT-4o</li>
              <li>GPT-4o Mini (fast)</li>
              <li>O1 Preview/Mini (reasoning)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* API Reference */}
      <div>
        <h2 className="text-2xl font-bold mb-6">API Reference</h2>
        <p className="text-zinc-400 mb-4">
          The WebUI server exposes REST endpoints for programmatic access:
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
                <td className="py-3 px-4 font-mono text-violet-400">/api/health</td>
                <td className="py-3 px-4">GET</td>
                <td className="py-3 px-4">Health check</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/api/config</td>
                <td className="py-3 px-4">GET/PUT</td>
                <td className="py-3 px-4">Configuration management</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/api/models</td>
                <td className="py-3 px-4">GET</td>
                <td className="py-3 px-4">Available models list</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/api/project</td>
                <td className="py-3 px-4">GET</td>
                <td className="py-3 px-4">Project information</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/api/git/status</td>
                <td className="py-3 px-4">GET</td>
                <td className="py-3 px-4">Git status</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/api/git/diff</td>
                <td className="py-3 px-4">GET</td>
                <td className="py-3 px-4">Git diff</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/api/session/create</td>
                <td className="py-3 px-4">POST</td>
                <td className="py-3 px-4">Create chat session</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">/api/tests/generate</td>
                <td className="py-3 px-4">POST</td>
                <td className="py-3 px-4">Generate tests for file</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* WebSocket */}
      <div>
        <h2 className="text-2xl font-bold mb-6">WebSocket Connection</h2>
        <p className="text-zinc-400 mb-4">
          Connect via WebSocket for real-time updates:
        </p>
        <div className="bg-zinc-900/50 rounded-lg p-4 font-mono text-sm">
          <div className="text-zinc-500">// Connect with session ID</div>
          <div className="text-emerald-400">{`const ws = new WebSocket('ws://localhost:3847?session=SESSION_ID');`}</div>
          <div className="text-zinc-500 mt-2">// Send message</div>
          <div className="text-emerald-400">{`ws.send(JSON.stringify({ type: 'message', sessionId, content: 'Hello' }));`}</div>
          <div className="text-zinc-500 mt-2">// Receive events</div>
          <div className="text-emerald-400">{`ws.onmessage = (event) => { /* stream_text, tool_call, response, etc. */ };`}</div>
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
