# XibeCode Documentation

> **Version:** 0.5.0
> **Last Updated:** February 16, 2026

Welcome to the XibeCode documentation! This directory contains comprehensive documentation for developers, contributors, and users.

## 🆕 What's New in v0.5.0

- **Desktop App** - Native Electron app for Windows, macOS, and Linux ([Download](https://github.com/iotserver24/xibecode/releases))
- **Interactive Plan Mode** - AI asks questions, searches the web, generates `implementations.md`, then builds on command
- **Chat History** - Persistent conversations with per-project storage
- **Environment Variables Editor** - Visual `.env` editor with live editing
- **Media File Preview** - Images, videos, audio preview in the editor
- **Thinking Animation** - Loading spinner while AI processes
- **Improved Tool Rendering** - Icons, status badges, progress indicators

## 📚 Documentation Structure

### Core Documentation (Root Level)

Located in the project root for easy access:

- **[ARCHITECTURE.md](../ARCHITECTURE.md)** - System architecture and design
- **[CONTRIBUTING.md](../CONTRIBUTING.md)** - Contribution guidelines
- **[API_REFERENCE.md](../API_REFERENCE.md)** - API overview and quick reference
- **[CODING_STANDARDS.md](../CODING_STANDARDS.md)** - Code style and documentation standards
- **[README.md](../README.md)** - Project overview and getting started

### Detailed Documentation (This Directory)

#### 📐 Architecture (`/architecture`)

Deep dives into system design and components:

- *Coming soon: overview.md*
- *Coming soon: agent-modes.md*
- *Coming soon: tool-execution.md*
- *Coming soon: context-management.md*
- *Coming soon: memory-system.md*
- *Coming soon: file-editing.md*

#### 🔧 API Reference (`/api`)

Detailed API documentation for each component:

- *Coming soon: agent.md* - EnhancedAgent API
- *Coming soon: tools.md* - Tool executor and all tools
- *Coming soon: modes.md* - Mode system API
- *Coming soon: editor.md* - File editor API
- *Coming soon: context.md* - Context manager API
- *Coming soon: memory.md* - Neural memory API
- *Coming soon: skills.md* - Skill manager API
- *Coming soon: plugins.md* - Plugin system API
- *Coming soon: mcp.md* - MCP integration API
- *Coming soon: safety.md* - Safety checker API
- *Coming soon: browser.md* - Browser automation API

#### 📖 Developer Guides (`/guides`)

Step-by-step tutorials and guides:

- *Coming soon: getting-started.md* - Development setup
- *Coming soon: creating-plugins.md* - Plugin development
- *Coming soon: adding-tools.md* - Custom tool creation
- *Coming soon: adding-modes.md* - Custom mode creation
- *Coming soon: testing.md* - Testing guide
- *Coming soon: debugging.md* - Debugging guide

#### 👥 Personas (`/personas`)

Agent persona documentation:

- *Coming soon: README.md* - Persona system overview
- *Coming soon: Individual persona docs for all 13 personas*

The 13 agent personas:
1. **Aria** (plan) - The Architect
2. **Blaze** (agent) - The Builder
3. **Tess** (tester) - The QA Engineer
4. **Dex** (debugger) - The Detective
5. **Sentinel** (security) - The Guardian
6. **Nova** (review) - The Critic
7. **Arya** (team_leader) - The Leader
8. **Siri** (seo) - The Optimizer
9. **Agni** (product) - The Strategist
10. **Anna** (architect) - The Designer
11. **Alex** (engineer) - The Implementer
12. **David** (data) - The Analyst
13. **Sanvi** (researcher) - The Scholar

#### 💡 Examples (`/examples`)

Complete code examples:

- *Coming soon: plugin-example.md* - Full plugin implementation
- *Coming soon: tool-example.md* - Custom tool example
- *Coming soon: mode-workflow.md* - Multi-mode workflow

#### 📊 Progress Tracking

- **[DOCUMENTATION_PROGRESS.md](./DOCUMENTATION_PROGRESS.md)** - Current documentation status

---

## 🚀 Quick Start

### For Users

1. **Getting Started**: Read [README.md](../README.md)
2. **Understanding the System**: Read [ARCHITECTURE.md](../ARCHITECTURE.md)
3. **API Reference**: Check [API_REFERENCE.md](../API_REFERENCE.md)

### For Contributors

1. **Contributing**: Read [CONTRIBUTING.md](../CONTRIBUTING.md)
2. **Coding Standards**: Read [CODING_STANDARDS.md](../CODING_STANDARDS.md)
3. **Development Setup**: See CONTRIBUTING.md → Development Setup

### For Plugin Developers

1. **Plugin Guide**: *(Coming soon: guides/creating-plugins.md)*
2. **API Reference**: Check [API_REFERENCE.md](../API_REFERENCE.md#creating-custom-tools)
3. **Examples**: *(Coming soon: examples/plugin-example.md)*

---

## 📝 Documentation Standards

All documentation follows these principles:

### Writing Style

- **Clear and Concise**: Short sentences, active voice
- **Practical**: Include examples and use cases
- **Complete**: Cover all parameters and edge cases
- **Consistent**: Follow established patterns

### Code Documentation

All public APIs include:
- ✅ One-line summary
- ✅ Detailed explanation
- ✅ `@example` blocks with working code
- ✅ `@param` tags for all parameters
- ✅ `@returns` description
- ✅ `@throws` for errors

See [CODING_STANDARDS.md](../CODING_STANDARDS.md) for complete guidelines.

---

## 🔨 Building Documentation

### TypeDoc API Documentation

Generate API docs from JSDoc comments:

```bash
# Install TypeDoc (if not already installed)
npm install --save-dev typedoc typedoc-plugin-markdown --legacy-peer-deps

# Generate documentation
npm run docs:generate

# Watch mode (auto-regenerate on changes)
npm run docs:watch

# Serve documentation locally
npm run docs:serve
```

Output will be in `docs/api-generated/`.

### Markdown Documentation

All markdown files are human-written and located in:
- `/` - Core docs (ARCHITECTURE.md, etc.)
- `/docs/architecture/` - Architecture details
- `/docs/api/` - API documentation
- `/docs/guides/` - Tutorials
- `/docs/personas/` - Persona docs
- `/docs/examples/` - Code examples

---

## 📦 Documentation Coverage

### Current Status

- **Foundation Docs**: ✅ Complete (4 core files)
- **Inline JSDoc**: 🔄 In Progress (~5% → Target: 90%)
- **Architecture Docs**: ⏳ Pending (0/6 files)
- **API Docs**: ⏳ Pending (1/12 files - overview only)
- **Guides**: ⏳ Pending (0/6 files)
- **Persona Docs**: ⏳ Pending (0/14 files)
- **Examples**: ⏳ Pending (0/3 files)

See [DOCUMENTATION_PROGRESS.md](./DOCUMENTATION_PROGRESS.md) for detailed status.

---

## 🤝 Contributing to Documentation

### Documentation Improvements

Found an issue or want to improve docs?

1. Check [CONTRIBUTING.md](../CONTRIBUTING.md)
2. Open an issue or PR
3. Follow [CODING_STANDARDS.md](../CODING_STANDARDS.md)

### Documentation TODOs

Priority areas needing documentation:

1. **High Priority**:
   - agent.ts inline documentation
   - editor.ts inline documentation
   - Core file JSDoc completion

2. **Medium Priority**:
   - Architecture deep dives
   - API reference pages
   - Developer guides

3. **Low Priority**:
   - Persona documentation
   - Code examples
   - Website updates

---

## 📖 External Resources

- **GitHub Repository**: [iotserver24/xibecode](https://github.com/iotserver24/xibecode)
- **Documentation Website**: *(Coming soon)*
- **Issue Tracker**: [GitHub Issues](https://github.com/iotserver24/xibecode/issues)
- **Discussions**: [GitHub Discussions](https://github.com/iotserver24/xibecode/discussions)

---

## 🔗 Quick Links

### For Reading

- [System Architecture](../ARCHITECTURE.md)
- [API Overview](../API_REFERENCE.md)
- [Contribution Guide](../CONTRIBUTING.md)
- [Code Standards](../CODING_STANDARDS.md)

### For Building

- [TypeDoc Config](../typedoc.json)
- [Package Scripts](../package.json#scripts)

### For Tracking

- [Documentation Progress](./DOCUMENTATION_PROGRESS.md)

---

## 📄 License

This documentation is part of XibeCode and is licensed under [Apache-2.0](../LICENSE).

---

**Documentation Version**: 1.0
**Last Updated**: February 14, 2026
**Maintained By**: XibeCode Team
