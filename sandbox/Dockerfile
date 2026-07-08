# Sandbox image for Agent Builder (runtime_and_sandbox §6).
#
# P0 reference image. NOT built/tested in the current dev environment (Docker
# is unavailable — see README "环境限制与降级"). The mock sandbox runner is the
# documented fallback; this Dockerfile is the production target.

FROM python:3.11-slim

# git + build deps for any pure-python wheels; curl for Node setup.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git curl ca-certificates make build-essential \
    && rm -rf /var/lib/apt/lists/*

# Node.js LTS — opencode run/serve is a Node tool (runtime_and_sandbox §10).
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Python tooling. No OpenJiuwen SDK baked in until API inventory is complete
# (architecture §6.3) — generated projects use the mock runtime by default.
RUN pip install --no-cache-dir pytest

# opencode: install per its official guide at build time on a connected host.
# (Left out of the offline image by default — enable when OpenCodeEngine goes live.)
# RUN npm install -g opencode

# Non-root user; default workspace is /workspace (mounted per-task, read-only fs).
RUN useradd --create-home --shell /bin/bash sandbox
WORKDIR /workspace
USER sandbox

# No secrets baked into the image (runtime_and_sandbox §6 constraint #1).
CMD ["python", "--version"]
