# Agent Builder (P0 + P1)

自然语言生成基于 **OpenJiuwen** 的 Python Agent / Workflow 工程：解析需求 → 生成项目 → 运行测试 → 展示源码与运行效果 → 导出代码包。

> P0 范围（依据 `docs/prd/PRD-v0.3-agent-builder.md`）：仅生成 Agent 与 Workflow；不做 Skills 独立创建、Agent Store、多租户或生产部署。

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
├── sandbox/                       # 沙箱镜像与脚本 (Phase 3)
├── workspace/                     # 运行时数据（gitignored：生成物/导出/运行/元数据）
└── docs/                          # PRD + 技术设计
```

## 前置依赖

| 工具 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 20（推荐 22） | 前端 + 编排后端 |
| Python | ≥ 3.10（3.12 已验证） | Python runner、生成物、pytest |
| Docker / Podman | 可选 | 不可用时自动降级到 mock sandbox（见下） |

## 安装

```bash
# 仓库根目录
npm install                 # 安装所有 workspace 依赖（含 Next.js / NestJS / Playwright）
cd services/python-runner && pip install -e ".[dev]" && cd -   # 可选：安装 python-runner CLI
```

## 本地启动

后端（NestJS，端口 3001）：

```bash
npm run dev:api
# 健康检查：curl http://localhost:3001/health
```

前端（Next.js，端口 3000）：

```bash
npm run dev:web
# 打开 http://localhost:3000
```

前端通过 `next.config.mjs` 的 rewrite 将 `/api/*` 代理到 `http://localhost:3001`（可用 `NEXT_PUBLIC_API_BASE_URL` 覆盖）。

## P1：真实 LLM 解析与通用生成

P1 解除了 P0「deterministic parser 仅识别两个示例 prompt」的限制。配置见 `.env.example`（拷贝为 `.env`）：

- `SPEC_PARSER_MODE`：`hybrid`（默认，两个 Demo 走 deterministic、其他走 LLM）/ `llm` / `deterministic`。
- `SPEC_LLM_PROVIDER`：`mock`（默认，CI/E2E 无密钥）或 `openai-compatible`（真实 Chat Completions 网关，读 `SPEC_LLM_BASE_URL` / `SPEC_LLM_API_KEY` / `SPEC_LLM_MODEL`）。
- `CODEGEN_ENGINE`：`template`（默认，确定性）/ `opencode`（真实 OpenCode，需 `OPENCODE_REQUIRE_REAL=true` 及 opencode 自身模型配置）/ `mock`。

无密钥模式（CI/E2E 默认）：两个标准 Demo（塔罗 Agent / 售前 Workflow）走 deterministic，非示例 prompt 走 `MockLlmSpecParser` 生成通用 Spec，整条 parse → 持久化 → 生成 → smoke → 运行 → 导出链路可跑通，不依赖任何外部密钥。

真实 LLM 模式：在 `.env` 配 `SPEC_LLM_PROVIDER=openai-compatible` + `SPEC_LLM_BASE_URL` + `SPEC_LLM_API_KEY` + `SPEC_LLM_MODEL`（需使用该 key 有权限的模型），非示例 prompt 即走真实 LLM 解析。LLM 不可用或缺密钥时返回明确 `PROMPT_PARSE_FAILED`，不生成半成品工程。

## 测试

```bash
npm run test          # 一次性跑全部：contracts + api + web + python
npm run test:contracts
npm run test:api
npm run test:web
npm run test:python   # 等价于 cd services/python-runner && python -m pytest
npm run test:e2e      # Playwright 端到端（Phase 8）
npm run lint          # ESLint（全仓）
npm run typecheck     # tsc --noEmit（各 workspace）
```

## 环境限制与降级（P0 容许，依据 `p0_implementation_plan.md` §13）

| 能力 | 状态 | 降级方式 |
| --- | --- | --- |
| Docker / Podman | 当前环境不可用 | 保留 `MockSandboxRunner`（进程级 allowlist / 超时 / 工作区隔离 / 日志采集），Docker 集成测试标记 `skipped` 并写明原因 |
| OpenCode | 默认不可用 | `CODEGEN_ENGINE=opencode` + `OPENCODE_REQUIRE_REAL=true` 时走真实 OpenCode；不可用则回退 `TemplateEngine`（事件流明确标记 fallback）。真实 opencode run 需 opencode 自身模型配置 |
| OpenJiuwen 真实 SDK | 未盘点 | `openjiuwen_adapter` 保留边界，使用 mock runtime 跑通无密钥 Demo |
| gVisor | 不可用 | 保留 `runtime: gvisor` 配置与文档，使用 Docker / mock fallback |

> 主服务进程不直接执行生成代码：所有 `python` / `pytest` / 生成物执行经 `SandboxService` 调度（架构 §5.6/§5.7）。

## 验收

P0 全部验收检查点通过；P1 端到端竖切已落地（真实 LLM parser + 通用 mock runtime + 非示例 E2E）。自动化测试全绿：contracts + api 128 + web 20 + python 10 + Playwright E2E 4（塔罗 Agent / 售前 Workflow / 天气 Agent / 合同审核 Workflow）；lint/typecheck 全绿。详细结果见 `docs/technical/p0_acceptance_report.md` §8。

```bash
npm run test:e2e   # 启动 API(:3001) + Web(:3000) 并跑 4 条 Playwright 链路（含 2 条非示例）
```

## 设计文档

- `docs/prd/PRD-v0.3-agent-builder.md`
- `docs/technical/agent_builder_architecture.md`
- `docs/technical/runtime_and_sandbox.md`
- `docs/technical/architecture_clarity_review.md`
- `docs/technical/p0_implementation_plan.md`
- `docs/technical/p0_acceptance_report.md`（Phase 8 产出）
