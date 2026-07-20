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
RUN npm install -g xibecode@1.4.2

# Ubuntu base often has UID/GID 1000 as ubuntu:ubuntu; E2B expects login+group `user`.
RUN G="$(getent group 1000 | cut -d: -f1 || true)" && \
    U="$(getent passwd 1000 | cut -d: -f1 || true)" && \
    if [ -z "$U" ]; then \
      useradd -m -u 1000 user; \
    else \
      [ -n "$G" ] && [ "$G" != "user" ] && groupmod -n user "$G"; \
      if [ "$U" != "user" ]; then \
        usermod -l user -g user -d /home/user -m "$U"; \
      else \
        usermod -g user user; \
      fi; \
    fi && \
    mkdir -p /home/user/workspace

USER user
WORKDIR /home/user
