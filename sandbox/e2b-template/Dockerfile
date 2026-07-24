FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PLAYWRIGHT_BROWSERS_PATH=/home/user/.cache/ms-playwright
ENV XIBECODE_PREFERRED_BROWSER=agent-browser

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  git \
  jq \
  openssh-client \
  python3 \
  make \
  g++ \
  xz-utils \
  tar \
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
    ca-certificates curl git jq openssh-client python3 make g++ xz-utils tar \
    fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 \
    libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libx11-xcb1 \
    libxcomposite1 libxdamage1 libxrandr2 xdg-utils \
    && rm -rf /var/lib/apt/lists/*)

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get update \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

# Ship CLI from local tarballs (reliable; avoids npm registry lag/ghost versions).
# Rebuild: (cd packages/core && npm pack --pack-destination ../../sandbox/e2b-template)
#          (cd packages/cli  && npm pack --pack-destination ../../sandbox/e2b-template)
# Then rename to xibecode-core.tgz / xibecode.tgz or keep versioned names below.
RUN mkdir -p /tmp/packs
COPY xibecode-core-1.6.1.tgz /tmp/packs/xibecode-core-1.6.1.tgz
COPY xibecode-1.6.1.tgz /tmp/packs/xibecode-1.6.1.tgz
RUN set -e; \
  npm install -g /tmp/packs/xibecode-core-1.6.1.tgz /tmp/packs/xibecode-1.6.1.tgz agent-browser; \
  (agent-browser install --with-deps || agent-browser install); \
  xibecode -v; \
  agent-browser --version || true

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

USER user
WORKDIR /home/user
ENV PATH="/usr/local/bin:${PATH}"
