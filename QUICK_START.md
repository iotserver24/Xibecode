# XibeCode Quick Start & Status Guide

## 📊 Project Snapshot

**XibeCode** - AI-powered autonomous coding assistant  
**Version:** 1.0.4  
**Status:** 🚧 Active Development  
**Monorepo:** 4 packages (core, cli, desktop, ext)  

---

## ⚠️ Critical Alert: Security Issues

**Security Score: 25/100** ⛔  

### Critical Vulnerabilities (3)
1. **Command Injection** - `/api/tests/run` allows arbitrary shell commands
2. **Arbitrary File Write** - `/api/env` can write any file in working directory
3. **MCP Configuration Hijack** - `/api/mcp/file` can inject malicious commands

### High Vulnerabilities (2)
4. **API Key Exposure** - `/api/config` reveals full API keys
5. **Configuration Tampering** - No auth on config changes

**IMMEDIATE ACTION REQUIRED:** Do NOT expose WebUI port (3847) to untrusted networks until fixed.

---

## 🎯 Current Priorities (Order of Execution)

### 1. 🔒 Security Hardening (CRITICAL - 2 weeks)
- [ ] Implement JWT authentication for WebUI
- [ ] Fix command injection in `/api/tests/run`
- [ ] Secure file write endpoints (`/api/env`, `/api/mcp/file`)
- [ ] Protect configuration endpoints
- [ ] Add security tests for all vulnerabilities

**Target:** Security score 90+/100

### 2. 🧪 Test Coverage (4 weeks)
- [ ] Core package tests (80%+ coverage)
- [ ] CLI tests (70%+ coverage)
- [ ] Integration tests for key workflows
- [ ] Security regression tests

**Target:** 75%+ overall coverage

### 3. 📦 Feature Completion (6 weeks)
- [ ] Browser extension (`packages/ext/`)
- [ ] Desktop application (`packages/desktop/`)
- [ ] Enable all 13 agent modes (currently only 3)
- [ ] Enhanced MCP integration
- [ ] Improved auto-memory

### 4. 📚 Documentation (4 weeks)
- [ ] Complete API documentation
- [ ] User guides and tutorials
- [ ] Contribution guide
- [ ] Architecture docs update

### 5. ⚡ Performance (2 weeks)
- [ ] Context window optimization
- [ ] Caching strategy
- [ ] Error handling improvements
- [ ] Monitoring & observability

### 6. 🚀 Release (1 week)
- [ ] Version 2.0.0 preparation
- [ ] Release notes
- [ ] Publish to npm

**Total Timeline:** ~12 weeks to v2.0.0

---

## 🏗️ Project Structure

```
xibecode/
├── packages/
│   ├── core/           # AI engine (tools, agent, memory, MCP)
│   ├── cli/            # Terminal interface
│   ├── desktop/        # Electron app (beta)
│   └── ext/            # Browser extension (new)
├── site/               # Documentation website
├── scripts/            # Build & dev scripts
└── docs/               # Additional documentation
```

---

## 🛠️ Quick Commands

### Development
```bash
# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Watch mode (development)
pnpm run dev

# Run tests
pnpm run test

# Link CLI globally
pnpm link --global --dir packages/cli
```

### Using XibeCode
```bash
# Configure API key
xibecode config --set-key YOUR_API_KEY

# Interactive chat
xibecode chat

# Autonomous task
xibecode run "Fix the TypeScript errors"

# Run with auto-PR
xibecode run-pr "Add input validation"
```

### WebUI (⚠️ Security Warning)
```bash
# Start WebUI server (LOCALHOST ONLY - DO NOT EXPOSE)
xibecode ui --port 3847

# Access at http://localhost:3847
# NOTE: No authentication - only run on trusted networks
```

---

## 🤖 Agent Modes (13 Total)

| Mode | Persona | Status | Description |
|------|---------|--------|-------------|
| `agent` | Blaze | ✅ Enabled | Full autonomous coding |
| `plan` | Aria | ✅ Enabled | Interactive planning |
| `review` | Nova | ✅ Enabled | Code review |
| `tester` | Tess | 🔜 Coming | Testing & QA |
| `debugger` | Dex | 🔜 Coming | Debugging |
| `security` | Sentinel | 🔜 Coming | Security analysis |
| `pentest` | - | 🔜 Coming | Penetration testing |
| `team_leader` | Arya | 🔜 Coming | Team coordination |
| `seo` | Siri | 🔜 Coming | SEO optimization |
| `product` | Agni | 🔜 Coming | Product strategy |
| `architect` | Anna | 🔜 Coming | Architecture design |
| `engineer` | Alex | 🔜 Coming | Implementation |
| `data` | David | 🔜 Coming | Data analysis |
| `researcher` | Sanvi | 🔜 Coming | Research |

---

## 📦 Key Features

- **50+ Tools** - File I/O, git, shell, web search, MCP
- **Multi-Model Support** - Anthropic, OpenAI, Google, Groq
- **MCP Integration** - Extensible server capabilities
- **Skill System** - 40+ built-in + custom + Smithery registry
- **Auto-Memory** - Persistent project learning
- **Swarm Orchestration** - Parallel task execution
- **Background Tasks** - Long-running detached processes
- **Session Management** - Persistent chat history
- **Verified Editing** - Reliable code modifications
- **Permission Rules** - Fine-grained tool control
- **Lifecycle Hooks** - 9 customizable events
- **Settings System** - Multi-source layered config

---

## 🔧 Configuration

### Environment Variables
```bash
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
XIBECODE_MODEL=claude-sonnet-4-5-20250929
```

### Config File Location
- **User Config:** `~/.xibecode/config.json`
- **Project Config:** `.xibecode/config.json`
- **MCP Servers:** `~/.xibecode/mcp-servers.json`

### Supported Providers
- Anthropic (default: `claude-sonnet-4-5-20250929`)
- OpenAI (default: `gpt-4o`)
- Google (default: `gemini-2.0-flash`)
- Groq (default: `llama-3.3-70b-versatile`)
- Custom (user-defined)

---

## 📈 Success Metrics

### Current → Target
- **Security Score:** 25/100 → **90+/100**
- **Test Coverage:** Unknown → **75%+**
- **Agent Modes:** 3 → **13**
- **Documentation:** Partial → **Complete**

---

## 🚦 Git Status

- **Branch:** `main` (2 commits ahead)
- **Staged:** `.gitignore`
- **Unstaged:** `pnpm-lock.yaml`
- **Untracked:** `packages/ext/`

---

## 📞 Getting Help

- **GitHub Issues:** https://github.com/iotserver24/xibecode/issues
- **Documentation:** https://xibecode.dev
- **Donate:** https://www.anishkumar.tech/donate

---

## 📚 Important Documents

| Document | Purpose |
|----------|---------|
| [PLANNING.md](PLANNING.md) | Comprehensive 12-week roadmap |
| [pentest-report.md](pentest-report.md) | Security assessment (25/100) |
| [README.md](README.md) | Full project documentation |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture |
| [API_REFERENCE.md](API_REFERENCE.md) | API documentation |
| [CODING_STANDARDS.md](CODING_STANDARDS.md) | Code style guide |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guidelines |

---

## ⚡ Quick Wins (This Week)

1. **Create security task force** - Assign engineer to Priority 1
2. **Implement JWT authentication** - Design auth system for WebUI
3. **Fix command injection** - Remove or secure `/api/tests/run`
4. **Secure file writes** - Add path validation to `/api/env` and `/api/mcp/file`
5. **Add security tests** - Regression tests for all pentest findings

---

## 🎯 End of Week Goal

- ✅ Authentication system implemented
- ✅ Command injection fixed
- ✅ File write vulnerabilities fixed
- ✅ Security tests passing
- ✅ Security score: 80+/100

---

*Last Updated: March 2, 2026*  
*For full details, see [PLANNING.md](PLANNING.md)*
