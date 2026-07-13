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

# Pre-installed Python packages — opencode MUST NOT pip install anything at runtime.
# Sandbox has NO outbound network; all pip install attempts will fail and waste time.
# If a generated project needs a package not listed here, opencode must work around it.
RUN pip install --no-cache-dir \
    pytest setuptools wheel \
    openai \
    requests httpx \
    python-dotenv \
    pydantic \
    pyyaml \
    jinja2 \
    loguru

# python_runner — executes generated Agent/Workflow projects
COPY services/python-runner /tmp/python-runner
RUN pip install --no-cache-dir /tmp/python-runner && rm -rf /tmp/python-runner

# openjiuwen — real ReActAgent framework (Huawei openjiuwen 0.1.15)
COPY --from=agent-core . /tmp/agent-core
RUN pip install --no-cache-dir /tmp/agent-core && rm -rf /tmp/agent-core

# opencode — install via official installer, then copy to /usr/local/bin
# so it survives tmpfs mounts on /root.
RUN curl -fsSL https://opencode.ai/install | bash && \
    cp /root/.opencode/bin/opencode /usr/local/bin/opencode

WORKDIR /workspace

CMD ["opencode", "--version"]
