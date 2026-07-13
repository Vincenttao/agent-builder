# Agent Builder (P4)

自然语言生成基于 **OpenJiuwen** 的 Python Agent / Workflow 工程。

```text
输入需求 → Spec 确认 → OpenCode 生成 → Gate 验收 → Smoke Test → Agent 运行（真实 LLM ReAct 循环）→ 查看源码/导出
```

> P2: 统一 LLM 解析、Draft 确认、OpenCode 生成、体验增强。
> P3: 真实生成安全闭环、演示恢复（fallback/manifest/诊断/版本 Diff/日志 UI/E2E/runbook）。
> P4: **Fail-loud 真实链路**（禁用自动 fallback）、**真实 OpenJiuwen 0.1.15 集成**（Docker 沙箱预装）、**产物 Gate**（12 条规则验证）、**RUN_LLM_*** 运行期 LLM 契约、**ReAct trace** 契约、**项目骨架**（opencode 填 TODO，不从零生成）。不做 Skills 管理、Agent Store、多租户。

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
SPEC_LLM_MODEL=deepseek-v4-pro

# ── 代码生成引擎 ──
CODEGEN_ENGINE=opencode                   # P4 推荐：真实 OpenCode
OPENCODE_REQUIRE_REAL=true
OPENCODE_API_KEY=sk-xxxxxxxxxxxxxxxx
OPENCODE_PROVIDER=deepseek
OPENCODE_MODEL=deepseek-v4-flash
OPENCODE_ALLOW_FALLBACK=false             # P4 默认：fail-loud（调试时暴露问题）

# ── Agent 运行期 LLM（P4：独立于生成期）──
RUN_LLM_PROVIDER=deepseek
RUN_LLM_API_KEY=sk-xxxxxxxxxxxxxxxx       # 可与 OPENCODE_API_KEY 相同
RUN_LLM_BASE_URL=https://api.deepseek.com/v1
RUN_LLM_MODEL=deepseek-v4-flash

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

| 引擎 | CODEGEN_ENGINE | OpenJiuwen | 运行 LLM | 真实验收 |
|------|---------------|-----------|---------|---------|
| **OpenCode real** | `opencode` + `OPENCODE_REQUIRE_REAL=true` | 真实 0.1.15（Docker 预装） | `RUN_LLM_*` → `DEEPSEEK_API_KEY` | ✅ |
| OpenCode mock | `opencode` + `OPENCODE_REQUIRE_REAL=false` | 真实（Docker 预装） | mock | ❌ CI only |
| Template | `template` | lightweight（项目内 `openjiuwen_runtime`） | mock | ❌ test-only |

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

真实 OpenCode 生成失败时可从 UI 恢复并完成演示。详见 `docs/technical/p3_work_items.md`。

## P4：真实 OpenJiuwen 工程化（当前版本）

把"真实 OpenJiuwen + 真实 LLM + OpenCode 生成 + Agent runtime 执行"从 prompt 约束提升为可重复验收的工程能力。

| 能力 | 说明 |
|---|---|
| **Fail-loud 真实链路** | `OPENCODE_ALLOW_FALLBACK=false` 默认值；fallback endpoint 需 `ENABLE_TEMPLATE_FALLBACK=true` 启用；缺失项诊断（opencode/Docker/API key） |
| **真实 OpenJiuwen 0.1.15** | Docker sandbox 预装完整 openjiuwen（ReActAgent + @tool + invoke）；生成 Agent 直接 import SDK |
| **产物 Gate** | `real-openjiuwen-gate.ts`：12 条规则（manifest/import/tool/invoke/禁止 adapter 目录/非 README-only）；gate 失败 → generation failed，不运行 smoke test |
| **RUN_LLM_* 契约** | 运行期 LLM 独立配置（`RUN_LLM_PROVIDER/API_KEY/BASE_URL/MODEL`），优先于 OPENCODE_*（含 deprecation warning） |
| **ReAct trace** | `RunTraceEvent` 类型（iteration/type/tool/input/output）；python_runner 自动转换 legacy `tool_calls` 为 trace |
| **项目骨架** | `agent-real-openjiuwen/` 模板：opencode 看到已完成的 ReActAgent 骨架，只填 SYSTEM_PROMPT + 工具实现 + README；避免 API 错误 |
| **API 盘点** | `docs/technical/openjiuwen_api_inventory.md`：锁定所有 import、返回结构、已知陷阱（DEFAULT_RUNNER_CONFIG 不存在、LocalFunction 不可调用等） |
| **Workflow 决策** | P4 不验收真实 Workflow；Workflow 标记为 lightweight/test-only |
| **pip 错误日志** | `workspace/logs/pip-install-errors.log`：自动收集 opencode 运行中的 pip 错误，用于后续 Dockerfile 优化 |

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
| api | 171（含 real-openjiuwen-gate 12 tests + opencode-engine 22 tests） |
| web | 27 |
| python | 8（python-runner）+ 17（openjiuwen-runtime，demo 分支） |
| e2e | 4（Tarot Agent / Presales Workflow / Weather Agent / Contract Review Workflow） |
| e2e:real | 真实链路（需 RUN_LLM_API_KEY + Docker + sandbox image），无密钥自动 skip |

lint / typecheck 全绿。

## 环境限制与降级

| 能力 | 状态 | 降级方式 |
| --- | --- | --- |
| Docker / Podman | 当前环境可用 | 保留 `MockSandboxRunner` 作为 fallback（进程级 allowlist / 超时 / 隔离 / 日志） |
| OpenCode | 需 opencode 二进制 + 模型配置 | P4 默认 **fail-loud**（`OPENCODE_ALLOW_FALLBACK=false`）；显式开启才回退 TemplateEngine |
| OpenJiuwen 真实 SDK | ✅ 0.1.15 已盘点 | Docker sandbox 预装（`COPY --from=agent-core`）；API 文档见 `docs/technical/openjiuwen_api_inventory.md` |
| gVisor | 不可用 | 保留 `runtime: gvisor` 配置与文档，使用 Docker / mock fallback |

> 主服务进程不直接执行生成代码：所有 `python` / `pytest` / 生成物执行经 `SandboxService` 调度。

## 设计文档

| 文档 | 说明 |
|---|---|
| `docs/prd/PRD-v0.3-agent-builder.md` | 产品需求定义（P4 更新：真实 LLM + OpenJiuwen + fail-loud + §18 对照表） |
| `docs/technical/p4_work_items.md` | **P4 实施说明书**（M1–M8 + 最终验收清单） |
| `docs/technical/openjiuwen_api_inventory.md` | **OpenJiuwen 0.1.15 API 盘点**（import/返回结构/已知陷阱） |
| `docs/technical/p4_workflow_decision.md` | Workflow real path 决策（P4 不验收） |
| `docs/technical/agent_builder_architecture.md` | 系统架构设计 |
| `docs/technical/runtime_and_sandbox.md` | 运行时与沙箱设计 |
| `docs/technical/p2_plan.md` | P2 实施计划 |
| `docs/technical/p3_work_items.md` | P3 工作项 |
| `docs/technical/p3_demo_runbook.md` | P3 Demo 执行手册 |
| `docs/technical/p0_acceptance_report.md` | P0 验收报告 |
