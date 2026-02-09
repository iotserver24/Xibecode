### XibeCode v1.0.0 – Release Notes

**XibeCode** is a CLI AI coding assistant (Gemini‑style TUI) that can read/edit your code, run commands, and help you build features directly from the terminal.

---

### 1. Install from `.tgz`

From the folder where `xibecode-1.0.0.tgz` is located:

```bash
# Recommended (pnpm)
pnpm add -g ./xibecode-1.0.0.tgz

# Or with Bun
bun install -g ./xibecode-1.0.0.tgz
```

Verify:

```bash
xibecode --version
```

---

### 2. Configure API key, model, and base URL

You can configure XibeCode either with **environment variables** or using the **built-in config commands** (recommended).

#### Option A – Environment variables

Add to your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
# Required: Anthropic API key
export ANTHROPIC_API_KEY="sk-ant-..."

# Optional: default model
export XIBECODE_MODEL="claude-sonnet-4-5-20250929"

# Optional: custom base URL (proxy / self-hosted)
export XIBECODE_BASE_URL="https://your-custom-endpoint.com"
```

Reload your shell:

```bash
source ~/.zshrc   # or your shell’s config file
```

#### Option B – XibeCode config commands (recommended)

These store settings in `~/.xibecode/`:

```bash
# Set API key
xibecode config --set-key YOUR_ANTHROPIC_API_KEY

# Set default model (optional)
xibecode config --set-model claude-sonnet-4-5-20250929

# Set custom base URL (optional)
xibecode config --set-url https://your-custom-endpoint.com

# Inspect current settings
xibecode config --show
```

Precedence: **CLI flags > config values > env vars**.

---

### 3. Basic usage

#### Interactive TUI chat

```bash
xibecode chat
```

Features inside `chat`:

- **`@`**  
  - Type `@` and press Enter → interactive picker of files/folders in the current directory.  
  - Pick with arrow keys; it pre-fills the prompt with `@selected/path`.

- **`@path`**  
  - Type `@src`, `@src/`, etc. → prints a list of matching files/folders under that path (no AI call).

- **`/help`**  
  - Shows a static help panel with local commands (no AI call).

- **Other commands**  
  - `clear` – clear screen and redraw the XibeCode TUI.  
  - `tools on` / `tools off` – enable/disable file + command tools.  
  - `exit` / `quit` – end the chat session.

#### One‑shot autonomous runs

```bash
# Run a coding task once, then exit
xibecode run "Create a REST API with Express"

# Use a specific model or endpoint just for this run
xibecode run "task description" --model claude-sonnet-4-5-20250929 --base-url https://your-custom-endpoint.com
```

---

### 4. Requirements

- Node.js compatible with pnpm/Bun  
- A valid **Anthropic API key**  
- Network access to the configured **base URL** (Anthropic or your proxy)

