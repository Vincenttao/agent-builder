# Agent Builder (P2)

自然语言生成基于 **OpenJiuwen** 的 Python Agent / Workflow 工程：解析需求 → Spec 确认 → 生成项目 → 运行测试 → 展示源码与运行效果 → 导出代码包。

> P2 范围（依据 `docs/prd/PRD-v0.3-agent-builder.md` + `docs/technical/p2_plan.md`）：仅生成 Agent 与 Workflow；不做 Skills 独立创建、Agent Store、多租户或生产部署。

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

## 本地启动

### 方式 1 — Docker Compose（构建 sandbox 镜像）

```bash
docker compose up --build
# 构建 agent-builder-sandbox 镜像（含 Python 3.11 + Node.js 20 + opencode）
# API 和 Web 在宿主机通过 npm 启动，Docker sandbox 用于 opencode 执行
```

### 方式 2 — 裸机启动

后端（NestJS，端口 3001）：

```bash
# 纯 mock（CI/E2E 默认，无需密钥）：
npm run dev:api

# 真实 LLM + opencode（需 apps/api/.env 配好密钥）：
npm run dev:api:llm
# 健康检查：curl http://localhost:3001/health
```

前端（Next.js，端口 3000）：

```bash
npm run dev:web
# 打开 http://localhost:3000
```

前端通过 `next.config.mjs` 的 rewrite 将 `/api/*` 代理到 `http://localhost:3001`。

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

## 测试

```bash
npm run test          # 一次性跑全部：contracts + api + web + python
npm run test:contracts
npm run test:api
npm run test:web
npm run test:python   # 等价于 cd services/python-runner && python -m pytest
npm run test:e2e      # Playwright 端到端
npm run lint          # ESLint（全仓）
npm run typecheck     # tsc --noEmit（各 workspace）
```

## 测试统计

| 套件 | 数量 |
|------|------|
| contracts | 15 |
| api | 144 |
| web | 20 |
| python | 10 |
| e2e | 4（Tarot Agent / Presales Workflow / Weather Agent / Contract Review Workflow） |

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
- `docs/technical/p0_implementation_plan.md`
- `docs/technical/p0_acceptance_report.md`
- `docs/technical/p1_implementation_report.md`
- `docs/technical/p1_llm_opencode_execution_plan.md`
- `docs/technical/architecture_clarity_review.md`
