# XibeCode — VS Code Extension

AI-powered autonomous coding assistant, right inside VS Code.

## Features

- **Sidebar Chat** — Interactive chat panel in the activity bar, powered by `xibecode-core`
- **Run Task** — One-shot autonomous coding via command palette
- **Context Menu** — Right-click to explain, refactor, generate tests, or fix diagnostics
- **Multi-Model** — Anthropic, OpenAI, DeepSeek, Google, OpenRouter
- **Tool Execution** — File editing, shell commands, MCP servers, and more
- **Streaming** — Real-time token streaming with tool call indicators
- **Session History** — Conversation history preserved across panel toggles

## Getting Started

1. Install the extension
2. Run **XibeCode: Set API Key** from the command palette
3. Click the XibeCode icon in the activity bar to open the chat

## Commands

| Command | Description |
|---------|-------------|
| `XibeCode: Open Chat` | Focus the chat sidebar |
| `XibeCode: Run Task` | Enter a one-shot coding task |
| `XibeCode: Set API Key` | Configure your API key |
| `XibeCode: Select Model` | Pick a model to use |
| `XibeCode: Clear Chat History` | Wipe the current session |
| `XibeCode: Explain Selection` | Explain selected code |
| `XibeCode: Refactor Selection` | Refactor selected code |
| `XibeCode: Generate Tests for Selection` | Generate tests for selected code |
| `XibeCode: Fix Diagnostics in File` | Fix lint/type errors |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `xibecode.apiKey` | `""` | API key for the AI provider |
| `xibecode.model` | `claude-sonnet-4-20250514` | Model to use |
| `xibecode.provider` | `anthropic` | API provider format |
| `xibecode.baseUrl` | `""` | Custom API base URL |
| `xibecode.maxIterations` | `150` | Max agent iterations per task |
| `xibecode.autoApproveTools` | `false` | Auto-approve safe tool calls |

## Development

```bash
# From the monorepo root:
pnpm install
pnpm run build           # builds all packages including ext

# Or just the extension:
cd packages/ext
pnpm run build
```

To test in VS Code, press **F5** to launch the Extension Development Host.

## Architecture

```
packages/ext/
├── src/
│   ├── extension.ts              # Activation / commands / wiring
│   ├── services/
│   │   ├── agent-service.ts      # xibecode-core bridge (EnhancedAgent + tools)
│   │   └── config-service.ts     # VS Code settings wrapper
│   ├── providers/
│   │   └── chat-view-provider.ts # Sidebar webview provider
│   ├── ui/
│   │   └── status-bar.ts         # Status bar indicator
│   └── webview/
│       └── webview-html.ts       # Inline HTML/CSS/JS for the chat panel
├── media/
│   └── icon.svg                  # Activity bar icon
├── package.json                  # VS Code extension manifest
└── tsconfig.json
```

## License

Apache-2.0
