# Changelog

All notable changes to XibeCode will be documented in this file.

## [0.4.4] - 2026-02-15

### 🎨 WebUI Complete Redesign

Completely redesigned the WebUI with a **v0.dev-inspired professional layout**:

**Layout & UI:**
- Activity bar on far left with icon+label buttons (Chat, Design, Git, Connect, Vars, Template, Settings)
- Resizable chat panel on left with drag-to-resize divider
- Monaco code editor on right with file explorer sidebar
- Clean dark theme (#0a0a0a background) matching v0.dev aesthetics
- Collapsible panels with `<<` / `>>` toggle buttons

**Terminal:**
- Multi-terminal tab management with + and X buttons
- Real PTY support via Python bridge (no native deps needed)
- Fully interactive shell with colors, prompts, tab-completion, vim/nano support
- Independent terminal sessions per tab
- Removed unused "Problems" and "Output" tabs

**Settings:**
- Converted from sidebar to centered modal popup with backdrop blur
- 5 categories: AI Provider, Display, Development, MCP Servers, Shortcuts
- Monaco JSON editor for mcp-servers.json with syntax highlighting
- All 20+ config options exposed (provider, model, API keys, base URLs, max iterations, theme, show details/thinking, compact threshold, package manager, dry run, git strategy, test command, editor, session directory)
- Custom model input with API format selector (Anthropic/OpenAI/Auto-detect)
- Toggle switches for boolean settings
- Save success feedback with green "Saved!" button

**Git Panel:**
- Two tabs: Changes and History
- Changes tab: stage/unstage/discard files, commit message input, collapsible staged/unstaged sections
- History tab: visual commit graph with dots+lines, branch/tag badges, relative timestamps ("2h ago", "3d ago"), commit messages, author, short hash
- Color-coded file status badges (M=yellow, A=green, D=red, U=cyan, R=purple)
- Click file names to view diffs in Monaco editor

**Chat:**
- New Chat button (+ icon) to clear conversation
- v0.dev-style rounded input with white arrow send button
- Mode selector dropdown with 13 agent modes
- Connection status indicator
- Slash commands (/) and file references (@) with autocomplete popups

**Status Bar:**
- Shows current AI model (e.g., "claude-sonnet-4-5") with bot icon
- Connection status, agent mode, cursor position, file language, encoding

**File Operations:**
- Added `/api/files/tree` endpoint with recursive directory walking
- Path traversal protection
- Skips node_modules, .git, dist, build, etc.
- Sorts directories first alphabetically

**Backend API:**
- Expanded `/api/config` GET to return all 20+ config values in `raw` object
- Expanded `/api/config` PUT to accept all config fields
- Added `/api/mcp/file` GET/PUT for Monaco editor to read/write mcp-servers.json
- Added `/api/git/log` endpoint for commit history with graph data
- Added terminal WebSocket handler (`mode=terminal`) with Python PTY bridge

### 🐛 Bug Fixes

- Fixed Git panel crash when `status.files` is undefined
- Fixed config base URL to use original Anthropic API (`api.anthropic.com`) instead of custom proxy
- Replaced old CSS variables with direct Tailwind colors

## [0.2.0] - 2026-02-11

### 🎉 Major Features

#### AI-Powered Skill Synthesis

The `/learn` command now uses Claude AI to generate high-quality, structured skill files from documentation instead of raw text dumps.

**Before**: Raw HTML-stripped text with navigation elements and broken formatting  
**After**: Clean, comprehensive skills with:

- Overview & key concepts
- Properly formatted code examples  
- Best practices & gotchas
- Quick reference cheat-sheet

**Technical Details**:

- Uses Claude AI with 32,768 max tokens for synthesis
- Condensed doc summaries (up to 60K chars) for context
- Graceful fallback to basic formatting if AI unavailable
- Automatically uploads synthesized skills to marketplace

### 🔧 Improvements

- **Skills Marketplace Integration** (from v0.1.9):
  - `/marketplace` - Browse and install community skills
  - Auto-upload skills after `/learn`
  - Search by keywords and categories
  
### 🐛 Bug Fixes

- Fixed marketplace upload failures for large content (increased limit to 500KB)
- Fixed token limit issues in skill processing (now 32K tokens)
- Improved error handling for skill synthesis

### 📦 Dependencies

- Added `@anthropic-ai/sdk` for AI-powered skill generation

## [0.1.9] - 2026-02-11

### Features

- Skills Marketplace integration
- `/marketplace` command for browsing and installing skills
- Auto-upload to marketplace after `/learn`

## [0.1.8] - 2026-02-11

### Features

- `/learn` command for scraping documentation and creating skills
- Basic skill management improvements
