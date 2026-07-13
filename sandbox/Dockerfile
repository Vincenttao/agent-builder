# Sandbox image for Agent Builder — P1 production target.
#
# Includes: Python 3.11 + Node.js 20 + opencode + DeepSeek provider.
# API key is NOT baked in — injected via DEEPSEEK_API_KEY env at runtime.

FROM python:3.11-slim

# Use Aliyun mirrors for apt (China servers — remove for non-China deployments).
ARG USE_ALIYUN_MIRROR=true
RUN if [ "$USE_ALIYUN_MIRROR" = "true" ]; then \
      sed -i 's|http://deb.debian.org/debian|https://mirrors.aliyun.com/debian|g' /etc/apt/sources.list.d/debian.sources; \
    fi \
    && apt-get update \
    && apt-get install -y --no-install-recommends git curl ca-certificates make build-essential ripgrep fzf \
    && rm -rf /var/lib/apt/lists/*

# Node.js LTS — opencode is a Node tool.
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Pre-installed Python packages — both generation and run sandboxes have
# outbound network (controlled policy).  Pip install works everywhere.
# Pre-installing common packages avoids wasting time on redundant downloads
# during generation, and ensures runtime has everything it needs to call LLM APIs.
# Aliyun pip mirror for China servers (remove -i flag for non-China).
ARG PIP_INDEX=https://mirrors.aliyun.com/pypi/simple/
RUN pip install --no-cache-dir -i ${PIP_INDEX} \
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
RUN pip install --no-cache-dir -i ${PIP_INDEX} /tmp/python-runner && rm -rf /tmp/python-runner

# openjiuwen — real ReActAgent framework (Huawei openjiuwen 0.1.15)
COPY --from=agent-core . /tmp/agent-core
RUN pip install --no-cache-dir -i ${PIP_INDEX} /tmp/agent-core && rm -rf /tmp/agent-core

# opencode — install via official installer, then copy to /usr/local/bin
# so it survives tmpfs mounts on /root.
RUN curl -fsSL https://opencode.ai/install | bash && \
    cp /root/.opencode/bin/opencode /usr/local/bin/opencode

WORKDIR /workspace

CMD ["opencode", "--version"]
