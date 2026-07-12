# Agent Builder (P3)

自然语言生成基于 **OpenJiuwen** 的 Python Agent / Workflow 工程：解析需求 → Spec 确认 → 生成项目 → 运行测试 → 展示源码与运行效果 → 导出代码包。

> 范围（依据 `docs/prd/PRD-v0.3-agent-builder.md` + `docs/technical/p2_plan.md` + `docs/technical/p3_work_items.md`）：生成 Agent 与 Workflow；P2 完成统一 LLM 解析 / Draft 确认 / OpenCode 生成 / 体验增强；P3 完成真实生成安全闭环、演示恢复闭环与可重复演示（fallback、manifest 消费、诊断页、版本/Diff/日志 UI、真实链路 E2E、runbook）。不做 Skills 独立创建、Agent Store、多租户。

## 仓库结构

```text
agent-builder/
├── apps/
│   ├── web/                       # Next.js 前端工作台
│   └── api/                       # NestJS 编排后端 (REST + SSE)
├── services/
│   └── python-runner/             # Python runner + mock OpenJiuwen runtime
├── packages/
│   └── shared-contracts/          # TS 共享类型 / schema / 枚举
├── sandbox/                       # 沙箱镜像与脚本
├── workspace/                     # 运行时数据（gitignored：生成物/导出/运行/元数据）
└── docs/                          # PRD + 技术设计
```

## 前置依赖

| 工具 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 20（推荐 22） | 前端 + 编排后端 |
| Python | ≥ 3.10（3.12 已验证） | Python runner、生成物、pytest |
| Docker / Podman | 可选 | 不可用时自动降级到 mock sandbox |

## 安装

```bash
# 仓库根目录
npm install                 # 安装所有 workspace 依赖（含 Next.js / NestJS / Playwright）
cd services/python-runner && pip install -e ".[dev]" && cd -   # 可选：安装 python-runner CLI
```

## 部署

### 环境准备

```bash
# 1. 克隆仓库
git clone <repo-url> agent-builder && cd agent-builder

# 2. 安装依赖
npm install
cd services/python-runner && pip install -e ".[dev]" && cd -

# 3. 构建 sandbox 镜像（opencode 代码生成需要）
docker compose up --build
```

### 方式 1 — 开发环境（裸机，推荐）

适用场景：本地开发、调试、Demo。API 和 Web 在宿主机运行，Docker 仅用于 opencode sandbox。

**步骤 1：配置环境变量**

```bash
cp apps/api/.env.example apps/api/.env
```

编辑 `apps/api/.env`，核心配置：

```ini
# ── Spec 解析（LLM）──
SPEC_LLM_PROVIDER=openai-compatible       # mock（无密钥）或 openai-compatible
SPEC_LLM_BASE_URL=https://api.deepseek.com/v1
SPEC_LLM_API_KEY=sk-xxxxxxxxxxxxxxxx      # DeepSeek API key
SPEC_LLM_MODEL=deepseek-chat

# ── 代码生成引擎 ──
CODEGEN_ENGINE=template                   # template（默认，快速稳定）
# 或使用 opencode：
# CODEGEN_ENGINE=opencode
# OPENCODE_REQUIRE_REAL=true
# OPENCODE_API_KEY=sk-xxxxxxxxxxxxxxxx    # opencode 使用的模型 key
# OPENCODE_PROVIDER=deepseek
# OPENCODE_MODEL=deepseek-chat

# ── Runtime ──
PORT=3001
APP_NAME=agent-builder-api
```

**步骤 2：启动服务**

```bash
# 终端 1：后端 API（端口 3001）
npm run dev:api:llm
# 或纯 mock 模式（无需密钥）：npm run dev:api

# 终端 2：前端 Web（端口 3000）
npm run dev:web
```

**步骤 3：验证**

```bash
curl http://localhost:3001/health        # → {"status":"ok","service":"agent-builder-api","version":"0.1.0"}
curl http://localhost:3001/health/deep    # → P3 诊断：LLM key 存在性 / OpenCode 配置 / Docker / runner（不输出密钥值）
curl -I http://localhost:3000             # → HTTP 200
```

打开 `http://localhost:3000`，首页左侧 "Runtime Diagnostics" 全绿表示真实栈就绪。选择 Agent/Workflow 类型，输入需求，开始生成。

### 方式 2 — Docker 全栈部署

适用场景：快速演示、CI 环境、不依赖宿主机 Node.js/Python。

**步骤 1：准备 `.env`**

同上，确保 `apps/api/.env` 已配置（API 容器通过 `--env-file` 加载）。

**步骤 2：构建并启动**

```bash
# 构建 sandbox 镜像（含 opencode）
docker compose build sandbox

# 构建 API 镜像
docker build -f docker/Dockerfile.api -t agent-builder-api .

# 构建 Web 镜像
docker build -f docker/Dockerfile.web -t agent-builder-web .

# 启动
docker run -d --name ab-api -p 3001:3001 \
  -v $(pwd)/apps/api/.env:/app/apps/api/.env:ro \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v $(pwd)/workspace:/app/workspace \
  agent-builder-api

docker run -d --name ab-web -p 3000:3000 \
  -e NEXT_PUBLIC_API_BASE_URL=http://host.docker.internal:3001 \
  agent-builder-web
```

**步骤 3：验证**

```bash
curl http://localhost:3001/health
curl -I http://localhost:3000
```

### 方式 3 — 生产环境（多容器）

适用场景：生产部署。API 和 Web 分别部署，sandbox 作为构建时依赖。

```yaml
# docker-compose.prod.yml
services:
  api:
    build:
      context: .
      dockerfile: docker/Dockerfile.api
    ports: ["3001:3001"]
    volumes:
      - ./apps/api/.env:/app/apps/api/.env:ro
      - /var/run/docker.sock:/var/run/docker.sock
      - api_workspace:/app/workspace
    restart: unless-stopped

  web:
    build:
      context: .
      dockerfile: docker/Dockerfile.web
    ports: ["3000:3000"]
    environment:
      - NEXT_PUBLIC_API_BASE_URL=http://api:3001
    restart: unless-stopped

volumes:
  api_workspace:
```

```bash
docker compose -f docker-compose.prod.yml up -d
```

### 引擎模式说明

| 模式 | CODEGEN_ENGINE | 说明 | 适用 |
|------|---------------|------|------|
| Template | `template` | 确定性模板生成，快速稳定，不需要 opencode | 开发调试、CI、快速 Demo |
| OpenCode mock | `opencode` + `OPENCODE_REQUIRE_REAL=false` | 在 opencode 事件流中运行 TemplateEngine | CI 测试 opencode 事件路径 |
| OpenCode real | `opencode` + `OPENCODE_REQUIRE_REAL=true` | 真实 `opencode run`，Docker sandbox + LLM | 生产级代码生成 |

Mock 模式无需任何外部 API key，所有 prompt 走 `MockLlmSpecParser` 生成通用 Spec，完整流程（parse → generate → smoke test → run → export）均可跑通。

### 目录结构（运行时）

```text
workspace/
├── generated/          # 生成的项目文件（按 generation/version 组织）
│   └── <gen_id>/
│       └── <ver_id>/
├── runs/               # sandbox 运行日志（stdout/stderr）
├── exports/            # 导出 zip 包
├── logs/               # 应用日志
└── metadata.db         # SQLite 数据库（generation/version/event/run/draft/spec 表）
```

设置 `METADATA_DB_PATH=:memory:` 使用内存数据库（CI/E2E 默认）。

### 常见问题

**Q: `npm run dev:api:llm` 启动报错 "Cannot find module"**

确保已运行 `npm install`（workspaces 依赖需要 hoist）。如果仍然失败，手动构建 contracts：

```bash
npm run build:contracts
```

**Q: opencode 不可用，日志显示 "OpenCode unavailable — falling back to TemplateEngine"**

sandbox 镜像未构建或 Docker daemon 未运行：

```bash
docker compose up --build    # 构建 sandbox 镜像
docker info                  # 检查 Docker 是否运行
```

**Q: Spec 解析失败，提示 "LLM 不可用"**

检查 `apps/api/.env` 中 `SPEC_LLM_API_KEY` 和 `SPEC_LLM_BASE_URL` 是否正确。可先用 mock 模式验证：

```bash
# .env 中设置为 mock
SPEC_LLM_PROVIDER=mock
```

**Q: 导出的 zip 包无法解压或内容不完整**

导出经过安全过滤（移除 `.env`/`.agent_builder/`/`.opencode/`/`__pycache__`/`*.egg-info`/日志/缓存）。确认 `.env.example` 在项目中存在。

**Q: Windows 下 npm 脚本报错**

使用 WSL2 运行，或在 PowerShell 中设置：

```powershell
$env:NODE_OPTIONS="--openssl-legacy-provider"
```

**Q: 如何重置 Demo 数据**

```bash
rm -rf workspace/generated workspace/runs workspace/exports workspace/metadata.db
# 重启 API 后自动重建
```

## P2：统一 LLM 解析、Draft 确认流程、OpenCode 生成、体验增强

所有 prompt 统一走 LLM（或 mock LLM）解析，不再有针对 demo prompt 的确定性关键词绕过。配置见 `apps/api/.env.example`：

- `SPEC_LLM_PROVIDER`：`mock`（默认，CI/E2E 无密钥）或 `openai-compatible`（真实 Chat Completions 网关，读 `SPEC_LLM_BASE_URL` / `SPEC_LLM_API_KEY` / `SPEC_LLM_MODEL`）。
- `CODEGEN_ENGINE`：`template`（默认，确定性模板）或 `opencode`（真实 OpenCode via SandboxService，需 `OPENCODE_REQUIRE_REAL=true`）。
- `OPENCODE_REQUIRE_REAL`：`true` 时走真实 `opencode run`；`false` 时 OpenCode 事件包裹 TemplateEngine（CI 默认）。
- `OPENCODE_MAX_RETRIES`：修复重试上限（默认 2）。失败后可点击"修复并重试"触发新版本生成。

**核心能力：**

| 能力 | 说明 |
|---|---|
| 统一 LLM 解析 | 所有 prompt（含 tarot/presales）均通过 LLM/mock 解析，`parser_mode` 固定为 `llm` |
| Draft / Spec 确认 | 首页提交后进入 Spec 确认页，可查看 LLM 解析结果、编辑 Spec JSON、确认后生成 |
| 双代码生成引擎 | TemplateEngine（确定性模板）+ OpenCodeEngine（真实 LLM + Docker 沙箱） |
| 生成过程可观测 | Timeline 四阶段分组（理解需求 → 生成代码 → 运行测试 → 完成交付）+ 完成摘要 |
| Agent 测试台 | 输入消息 → 查看回复 + 工具调用记录；显示 Agent 名称、引擎类型、运行次数 |
| Workflow 运行页 | 节点状态列表（名称/耗时/状态）、最终输出 |
| 源码查看 | 文件树 + 代码查看器，默认打开 `src/**/agent.py` 或 `src/**/workflow.py` |
| 代码导出 | Zip 打包，过滤 `.env`/`.agent_builder/`/`.opencode/`/`__pycache__`/`*.egg-info`/日志/缓存 |
| 修复重试 | `POST /api/generations/:id/repair` 创建新版本重新生成，含 retry 计数和上限 |
| 版本管理 | `GET /:id/versions` 列出所有版本，`POST /:id/versions/:vid/activate` 回滚 |
| 版本 Diff | `GET /:id/versions/:vid/diff?base=` 提供逐文件 unified diff |
| 运行日志 | `GET /:id/runs` 列出 sandbox jobs，`GET /:id/runs/:rid/logs` 查看脱敏日志 |
| Prompt 模板 | 首页 6 个预定义模板（天气/简历/会议纪要 Agent + 合同审核/客诉分级/内容审核 Workflow） |
| 任务历史 | 首页底部历史列表，按状态过滤，点击跳转 |
| Lint gate | 生成后检查必需文件、禁止框架（LangGraph/CrewAI/Dify）、密钥泄露 |
| 并发保护 | 同一 generation 同时只有一个 pipeline 运行 |
| Spec 循环检测 | Workflow 边循环自动拒绝（DFS 三色标记） |
| 路径安全 | URL 编码穿透、null byte 注入、反斜杠穿透等编码变体防御 |
| Error Boundary | 全局 React Error Boundary，JS 异常不白屏 |

## P3：演示恢复与可重复演示

真实 OpenCode 生成失败时可从 UI 恢复并完成演示，内部同事可按 `docs/technical/p3_demo_runbook.md` 复现。新增能力：

| 能力 | 说明 |
|---|---|
| 模板 fallback | `POST /api/generations/:id/fallback` 用 TemplateEngine 重生成失败任务（mock 模式）；ErrorPanel 一键"切换模板引擎"按钮；事件流记录原始失败原因与 fallback reason |
| Manifest 消费 | `GET /:id/manifest`；smoke test 用 manifest `test_command` 安全映射到 allowlist argv；Agent/Workflow 测试台预填 `example_input`；runner 用 `entrypoint` 定位 spec |
| Workflow fallback 状态 | WorkflowRunPanel 显示 `mock_fallback` amber banner + 原因，与 AgentTestPanel 一致 |
| 真实链路 E2E | `npm run test:e2e:real`：读 `/health/deep` 自动 skip；就绪时输出 generation id / 耗时 / 文件清单 / smoke 状态 / engine |
| 诊断页 | `GET /health/deep` 输出 LLM key 存在性、base URL/model、OpenCode engine+CLI+key、Docker 可用性、allowlist 前缀数、Python runner；首页 Diagnostics 组件实时展示绿/灰就绪点 |
| 版本/Diff/日志 UI | CompletionSummary 传入 active version；VersionList 列出全部版本（激活 + Diff 对比）；ErrorPanel 显示最近一次运行 stdout/stderr tail |
| 失败重试安全 | `promoteVersion()` 仅在 smoke test 通过时调用，失败版本不会成为 active version |
| 真实命令 allowlist | `...` 省略号不再误判为路径逃逸；opencode v0/v1 前缀均纳入 allowlist |
| 内部 runbook | `docs/technical/p3_demo_runbook.md`：标准 prompt、4 条恢复路径、截图 checklist、故障表 |

## 测试

```bash
npm run test          # 一次性跑全部：contracts + api + web + python
npm run test:contracts
npm run test:api
npm run test:web
npm run test:python   # 等价于 cd services/python-runner && python -m pytest
npm run test:e2e      # Playwright 端到端
npm run test:e2e:real # P3 真实 OpenCode + LLM（无密钥自动 skip，输出报告）
npm run lint          # ESLint（全仓）
npm run typecheck     # tsc --noEmit（各 workspace）
```

## 测试统计

| 套件 | 数量 |
|------|------|
| contracts | 15 |
| api | 155 |
| web | 27 |
| python | 10 |
| e2e | 4（Tarot Agent / Presales Workflow / Weather Agent / Contract Review Workflow） |
| e2e:real | 真实链路（DeepSeek + OpenCode + Docker），无密钥自动 skip |

lint / typecheck 全绿。

## 环境限制与降级

| 能力 | 状态 | 降级方式 |
| --- | --- | --- |
| Docker / Podman | 当前环境不可用 | 保留 `MockSandboxRunner`（进程级 allowlist / 超时 / 工作区隔离 / 日志采集） |
| OpenCode | 需 opencode 二进制 + 模型配置 | 不可用则回退 `TemplateEngine`（事件流明确标记 fallback） |
| OpenJiuwen 真实 SDK | 未盘点 | 使用 mock runtime 跑通无密钥 Demo |
| gVisor | 不可用 | 保留 `runtime: gvisor` 配置与文档，使用 Docker / mock fallback |

> 主服务进程不直接执行生成代码：所有 `python` / `pytest` / 生成物执行经 `SandboxService` 调度。

## 设计文档

- `docs/prd/PRD-v0.3-agent-builder.md`
- `docs/technical/agent_builder_architecture.md`
- `docs/technical/runtime_and_sandbox.md`
- `docs/technical/p2_plan.md`
- `docs/technical/p2_defects.md`
- `docs/technical/p3_work_items.md`
- `docs/technical/p3_demo_runbook.md`
- `docs/technical/p0_implementation_plan.md`
- `docs/technical/p0_acceptance_report.md`
- `docs/technical/p1_implementation_report.md`
- `docs/technical/p1_llm_opencode_execution_plan.md`
- `docs/technical/architecture_clarity_review.md`
