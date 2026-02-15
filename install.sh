#!/bin/bash
set -e

# XibeCode Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/iotserver24/Xibecode/main/install.sh | bash

BOLD="\033[1m"
DIM="\033[2m"
GREEN="\033[32m"
RED="\033[31m"
VIOLET="\033[35m"
RESET="\033[0m"

echo ""
echo -e "${VIOLET}${BOLD}  XibeCode Installer${RESET}"
echo -e "${DIM}  AI-powered autonomous coding assistant${RESET}"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js is not installed.${RESET}"
    echo ""
    echo "  XibeCode requires Node.js 18+. Install it first:"
    echo ""
    echo "    macOS:   brew install node"
    echo "    Ubuntu:  sudo apt install nodejs npm"
    echo "    Fedora:  sudo dnf install nodejs npm"
    echo "    nvm:     nvm install 18"
    echo ""
    echo "  Or visit: https://nodejs.org"
    echo ""
    exit 1
fi

# Check Node.js version (need 18+)
NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Node.js $NODE_VERSION found, but 18+ is required.${RESET}"
    echo ""
    echo "  Upgrade with:"
    echo "    nvm install 18 && nvm use 18"
    echo "    or visit https://nodejs.org"
    echo ""
    exit 1
fi

echo -e "  ${GREEN}Node.js v$(node -v | sed 's/v//') detected${RESET}"

# Detect package manager preference
PM="npm"
if command -v pnpm &> /dev/null; then
    PM="pnpm"
elif command -v bun &> /dev/null; then
    PM="bun"
fi

echo -e "  ${GREEN}Using $PM to install${RESET}"
echo ""

# Install
if [ "$PM" = "pnpm" ]; then
    pnpm add -g xibecode
elif [ "$PM" = "bun" ]; then
    bun add -g xibecode
else
    npm install -g xibecode
fi

echo ""

# Verify
if command -v xibecode &> /dev/null; then
    VERSION=$(xibecode --version 2>/dev/null || echo "installed")
    echo -e "  ${GREEN}${BOLD}XibeCode $VERSION installed successfully.${RESET}"
    echo ""
    echo "  Get started:"
    echo "    xibecode config      Set up your API key"
    echo "    xibecode chat        Interactive chat mode"
    echo "    xibecode ui          Open the WebUI"
    echo "    xibecode run \"...\"   Autonomous coding"
    echo ""
    echo -e "  Docs: ${VIOLET}https://github.com/iotserver24/Xibecode${RESET}"
    echo ""
else
    echo -e "${RED}  Installation may have failed. Try running manually:${RESET}"
    echo "    $PM install -g xibecode"
    echo ""
    exit 1
fi
