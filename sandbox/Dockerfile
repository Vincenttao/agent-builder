# Sandbox image for Agent Builder — P1 production target.
#
# Includes: Python 3.11 + Node.js 20 + opencode + DeepSeek provider.
# API key is NOT baked in — injected via DEEPSEEK_API_KEY env at runtime.

FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends git curl ca-certificates make build-essential ripgrep fzf \
    && rm -rf /var/lib/apt/lists/*

# Node.js LTS — opencode is a Node tool.
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir pytest

# opencode standalone binary from GitHub Releases (v0.0.55).
# This is the headless codegen engine. oh-my-opencode is a separate interactive
# plugin that wraps opencode — not needed for sandbox execution.
RUN curl -fsSL -o /tmp/opencode.tar.gz \
      "https://github.com/opencode-ai/opencode/releases/download/v0.0.55/opencode-linux-x86_64.tar.gz" && \
    tar -xzf /tmp/opencode.tar.gz -C /usr/local/bin/ opencode && \
    rm /tmp/opencode.tar.gz

# Pre-configured DeepSeek provider (no API key — injected via DEEPSEEK_API_KEY).
# opencode reads config from $HOME/.config/opencode/opencode.json.
ENV HOME=/root
RUN mkdir -p /root/.config/opencode
COPY opencode-config.json /root/.config/opencode/opencode.json

WORKDIR /workspace

CMD ["opencode", "--version"]
