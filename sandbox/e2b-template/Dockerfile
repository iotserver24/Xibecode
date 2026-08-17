FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PLAYWRIGHT_BROWSERS_PATH=/home/user/.cache/ms-playwright
ENV XIBECODE_PREFERRED_BROWSER=agent-browser

# Lean agent tooling (keep image small; do not bake self-installable stacks).
# Search: rg/fd (gitignore-safe). Process rescue: lsof/psmisc/tmux.
# Bootstrap: curl/wget/openssl/build-essential so on-demand installs do not hang.
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  openssl \
  curl \
  git \
  git-lfs \
  jq \
  openssh-client \
  python3 \
  python3-venv \
  build-essential \
  xz-utils \
  tar \
  ripgrep \
  fd-find \
  fzf \
  tree \
  tmux \
  lsof \
  psmisc \
  unzip \
  zip \
  wget \
  rsync \
  procps \
  less \
  fonts-liberation \
  libasound2t64 \
  libatk-bridge2.0-0t64 \
  libatk1.0-0t64 \
  libcups2t64 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0t64 \
  libnspr4 \
  libnss3 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  xdg-utils \
  && rm -rf /var/lib/apt/lists/* \
  || (apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates openssl curl git git-lfs jq openssh-client python3 python3-venv \
    build-essential xz-utils tar ripgrep fd-find fzf tree tmux lsof psmisc \
    unzip zip wget rsync procps less \
    fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 \
    libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libx11-xcb1 \
    libxcomposite1 libxdamage1 libxrandr2 xdg-utils \
    && rm -rf /var/lib/apt/lists/*)

# Ubuntu packages fd as `fdfind` — expose the usual `fd` name for agents/docs.
RUN ln -sf /usr/bin/fdfind /usr/local/bin/fd

# GitHub CLI (official apt repo — not always current in Ubuntu universe).
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
  && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/* \
  && gh --version

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get update \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

# Bun (official install → /usr/local so uid 1000 can run it).
RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash \
  && bun --version

# uv — fast Python installs (official, tiny; agents pip-install a lot).
RUN curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh \
  && uv --version

# Ship CLI from local tarballs (reliable; avoids npm registry lag/ghost versions).
# Rebuild: (cd packages/core && pnpm pack --pack-destination ../../sandbox/e2b-template)
#          (cd packages/cli  && pnpm pack --pack-destination ../../sandbox/e2b-template)
RUN mkdir -p /tmp/packs
COPY xibecode-core-1.17.15.tgz /tmp/packs/xibecode-core-1.17.15.tgz
COPY xibecode-1.17.15.tgz /tmp/packs/xibecode-1.17.15.tgz
RUN set -e; \
  npm install -g /tmp/packs/xibecode-core-1.17.15.tgz /tmp/packs/xibecode-1.17.15.tgz agent-browser; \
  (agent-browser install --with-deps || agent-browser install); \
  xibecode -v; \
  agent-browser --version || true; \
  bun --version; \
  uv --version

# E2B injects a default `user` (uid 1000). Only create/rename if missing.
RUN set -e; \
  if ! id -u user >/dev/null 2>&1; then \
    if getent passwd 1000 >/dev/null 2>&1; then \
      EXISTING="$(getent passwd 1000 | cut -d: -f1)"; \
      if [ "$EXISTING" != "user" ]; then \
        usermod -l user -d /home/user -m "$EXISTING" || true; \
      fi; \
    else \
      useradd -m -u 1000 -s /bin/bash user; \
    fi; \
  fi; \
  mkdir -p /home/user/workspace /home/user/.cache /home/user/.agent-browser; \
  if [ -d /root/.cache ]; then \
    cp -a /root/.cache/. /home/user/.cache/ 2>/dev/null || true; \
  fi; \
  # agent-browser installs Chrome under the installing user (~root) — copy for sandbox user
  if [ -d /root/.agent-browser ]; then \
    cp -a /root/.agent-browser/. /home/user/.agent-browser/ 2>/dev/null || true; \
  fi; \
  chown -R 1000:1000 /home/user/workspace /home/user/.cache /home/user/.agent-browser 2>/dev/null || true

# Template wake HTTP (NOT the xibecode bot). Public URL auto-resumes paused sandboxes.
# https://e2b.dev/docs/sandbox/auto-resume
COPY wake-http /opt/vectra/wake-http
RUN chmod +x /opt/vectra/wake-http/start.sh /opt/vectra/wake-http/server.py \
  && chown -R 1000:1000 /opt/vectra

USER user
WORKDIR /home/user
ENV PATH="/usr/local/bin:${PATH}"
ENV VECTRA_WAKE_PORT=8788
