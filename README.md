# Agent Builder Demo (P0)

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
| OpenCode | 默认不可用 | `OpenCodeEngine` 保留接口与 mock，默认走 `TemplateEngine` fallback |
| OpenJiuwen 真实 SDK | 未盘点 | `openjiuwen_adapter` 保留边界，使用 mock runtime 跑通无密钥 Demo |
| gVisor | 不可用 | 保留 `runtime: gvisor` 配置与文档，使用 Docker / mock fallback |

> 主服务进程不直接执行生成代码：所有 `python` / `pytest` / 生成物执行经 `SandboxService` 调度（架构 §5.6/§5.7）。

## 设计文档

- `docs/prd/PRD-v0.3-agent-builder.md`
- `docs/technical/agent_builder_architecture.md`
- `docs/technical/runtime_and_sandbox.md`
- `docs/technical/architecture_clarity_review.md`
- `docs/technical/p0_implementation_plan.md`
- `docs/technical/p0_acceptance_report.md`（Phase 8 产出）
