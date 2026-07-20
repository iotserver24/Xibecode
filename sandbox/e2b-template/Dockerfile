FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

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
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get update \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

# Match published CLI so manual `xibecode`/`xc` in the VM matches your release track.
# Bump this when you cut a new npm release, then rebuild + publish this template.
RUN npm install -g xibecode@1.5.0

# E2B injects a default `user` (uid 1000). Only create/rename if missing.
# Never fail the build when the account already exists.
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
  mkdir -p /home/user/workspace; \
  chown -R 1000:1000 /home/user/workspace 2>/dev/null || true

USER user
WORKDIR /home/user
