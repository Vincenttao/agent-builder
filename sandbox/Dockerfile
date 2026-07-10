# Sandbox image for Agent Builder — P1 production target.
#
# Includes: Python 3.11 + Node.js 20 + opencode + DeepSeek provider.
# API key is NOT baked in — injected via DEEPSEEK_API_KEY env at runtime.

FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends git curl ca-certificates make build-essential \
    && rm -rf /var/lib/apt/lists/*

# Node.js LTS — opencode is a Node tool.
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir pytest

# Install opencode CLI binary. oh-my-opencode provides the agent plugin.
# The standalone binary is the most reliable way to get opencode in Docker.
RUN curl -fsSL https://github.com/opencode-ai/opencode/releases/latest/download/opencode-linux-x86_64 -o /usr/local/bin/opencode && \
    chmod +x /usr/local/bin/opencode && \
    npm install -g oh-my-opencode@latest

# Non-root user for sandbox execution.
RUN useradd --create-home --shell /bin/bash sandbox

# Pre-configured DeepSeek provider (no API key — injected at runtime).
RUN mkdir -p /home/sandbox/.config/opencode
COPY opencode-config.json /home/sandbox/.config/opencode/opencode.json
RUN chown -R sandbox:sandbox /home/sandbox/.config

WORKDIR /workspace
USER sandbox

CMD ["opencode", "--version"]
