# xibecode-core

Programmable **agent engine** for [XibeCode](https://www.npmjs.com/package/xibecode): multi-model chat, tool execution, MCP, sessions, permissions, skills, and related utilities. The [`xibecode`](https://www.npmjs.com/package/xibecode) CLI consumes this package; you can also embed it in servers, gateways, or custom tooling.

## Requirements

- Node.js **18+**

## Install

```bash
pnpm add xibecode-core
```

## Usage

Import the APIs you need from `xibecode-core` (ESM). Typical entry points:

| Area | Examples |
|------|----------|
| Agent | `EnhancedAgent`, `AgentStream` |
| Tools | `CodingToolExecutor`, remote execution clients |
| Modes | `MODE_CONFIG`, `AgentMode`, question/plan helpers |
| MCP | `MCPClientManager`, MCP config helpers |
| Session | `SessionManager`, transcript loaders |
| Memory / skills | `NeuralMemory`, `SkillManager`, `AutoMemoryManager` |

```js
import { EnhancedAgent, MODE_CONFIG } from 'xibecode-core';
```

See [`src/index.ts`](https://github.com/iotserver24/Xibecode/blob/main/packages/core/src/index.ts) for the full public export surface.

## Development

This package lives in the XibeCode monorepo under `packages/core/`. Build produces type declarations and JavaScript in `dist/`.

```bash
pnpm install
pnpm --filter xibecode-core build
pnpm --filter xibecode-core test
```

## License

Apache-2.0
