# Agent Builder P0 验收报告

版本：v0.1
验收日期：2026-07-09
依据：`docs/technical/p0_implementation_plan.md` §12.4、§14

## 1. 总体结论

**P0 全部验收检查点通过。** 两条标准示例（塔罗占卜 Agent、售前需求分析 Workflow）可从自然语言输入端到端跑通：解析 → 生成 → 沙箱内 smoke test → 完成摘要 → 源码查看 → Agent/Workflow 运行 → 导出 zip，全程在 mock OpenJiuwen runtime + mock sandbox 下完成，无需真实模型密钥或 Docker。

测试总计 **136 通过**：后端单元 91、共享契约 15、前端组件 20、Python runner 8、Playwright E2E 2。`lint`、`typecheck`、`test`、`test:python`、`test:e2e` 全绿。

## 2. 最终验收检查点（plan §12.4）

| # | 检查点 | 状态 | 证据 |
| --- | --- | --- | --- |
| 1 | `npm run test` 通过 | ✅ | 134 单元/组件测试（contracts 15 + api 91 + web 20 + python 8） |
| 2 | `npm run lint` 通过 | ✅ | eslint 0 errors 0 warnings |
| 3 | `npm run typecheck` 通过 | ✅ | 各 workspace `tsc --noEmit` 退出 0 |
| 4 | `python -m pytest` 通过 | ✅ | services/python-runner 8 tests |
| 5 | `npm run test:e2e` 通过 | ✅ | Playwright 2 tests（chromium，~14s） |
| 6 | 塔罗 Agent 示例完整生成 | ✅ | E2E `Tarot Agent` + 后端 integration spec |
| 7 | 售前 Workflow 示例完整生成 | ✅ | E2E `Presales Workflow` + integration spec |
| 8 | 两个示例都有源码查看 | ✅ | E2E 打开 `src/agents/agent.py`、`src/workflows/workflow.py` |
| 9 | 两个示例都有 smoke test 结果 | ✅ | `generated-smoke.spec` 在沙箱内跑通两个 smoke test |
| 10 | 导出包可解压且无密钥 | ✅ | integration 校验 zip 含源码、不含 `OPENJIUWEN_API_KEY=sk-`；`file-service` 过滤 `.env`/日志/缓存 |
| 11 | OpenCode 不可用时 TemplateEngine fallback | ✅ | `opencode-engine.spec` #4 fallback 测试 |
| 12 | Docker 不可用时单元测试仍可用 mock sandbox | ✅ | 全部沙箱单元测试走 `MockSandboxRunner` |
| 13 | UI 无 Skills 独立创建流程 | ✅ | 首页仅 Agent/Workflow；请求 schema 拒绝 `skill` |

## 3. 各阶段检查点

### Phase 0 — 基线与契约 ✅
`npm run test / lint / typecheck`、`python -m pytest` 均可执行；README 含本地启动说明。

### Phase 1 — 数据模型与事件流 ✅
创建任务返回 `generation_id`；DB 有记录；SSE 回放历史 + 推送新事件；事件 `sequence` 单调递增；`failed` 不覆盖 `completed` 的 `active_version_id`（`generation.service.spec`）。

### Phase 2 — Spec Parser / Validator ✅
两个标准 prompt 生成稳定 Spec（深拷贝，可 JSON 序列化）；Agent Spec 含 `draw_tarot` 工具；Workflow 含 Start/End + 4 业务节点；缺 name/Start/End、edge 指向不存在节点、<3 业务节点均返回 `SPEC_VALIDATION_FAILED`；非示例 prompt 返回 `PROMPT_PARSE_FAILED`；`skill` 在请求 schema 即被拒。

### Phase 3 — Sandbox Service ✅（Docker 集成 skipped，见 §5）
`DockerCommandBuilder` 生成正确 argv：默认 `--network none`、CPU/memory/pids 限制、`--cap-drop ALL`/`no-new-privileges`/`--read-only`/tmpfs、仅挂载当前 workspace、不挂载 docker socket、gVisor `--runtime=runsc`；命令白名单拒绝 `rm/sudo/curl/docker/bash` 与绝对路径/`..`；`MockSandboxRunner` 在沙箱内跑 `python --version` 与空 pytest、超时 kill、stdout/stderr 写入 run log。

### Phase 4 — CodeGenerationEngine ✅
`TemplateEngine` 生成标准 Agent/Workflow 目录（pyproject/README/.env.example/config/src/.../tests）；每文件触发 `file_created` 回调；文件不越出 project 目录；拒绝写入含 secret 的内容；`OpenCodeEngine` mock 模式产出 `opencode_started/file_changed/finished` 事件、`requireReal` + 不可用时 fallback 到 TemplateEngine。

### Phase 5 — Python Runner + mock OpenJiuwen ✅
mock Agent 返回结构化回复、mock Tool 记录 IO、mock Workflow 按节点顺序执行；`runner.run_agent/run_workflow` 无密钥可跑；塔罗 Agent 与售前 Workflow 的 smoke test 在沙箱内通过（`generated-smoke.spec`）。

### Phase 6 — API 编排 ✅
`POST /api/generations` 创建并异步推进 pipeline；`GET /:id`、SSE、`files`、`files/content`（阻止 `..`）、`agent/runs`、`workflow/runs`、`exports` + download 全部实现；integration spec 完整生成 Agent/Workflow 并跑通 run/export；失败不覆盖成功版本。

### Phase 7 — 前端工作台 ✅
首页 Agent/Workflow 切换 + 提交跳转；生成页渲染 plan/file/sandbox/test 事件时间线；completed 显示 Agent 测试台 / Workflow 运行页；源码页文件树 + 代码查看；导出按钮调用 export API；无 Skills 入口。

### Phase 8 — E2E 与硬化 ✅
Playwright 两条完整链路通过；安全回归（路径穿越、`.env` 不导出、禁止命令、超时 kill、默认 `none` 网络）由单元/集成测试覆盖；日志脱敏（`redact`）；导出过滤。

## 4. 环境依赖版本

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | v22.19.0 | 前端 + 编排后端 |
| Python | 3.12.3 | runner / 生成物 / pytest（mock OpenJiuwen，无真实 SDK） |
| Docker / Podman | 不可用 | WSL2 未集成 Docker Desktop；走 mock sandbox fallback |
| gVisor | 不可用 | 保留 `runtime: gvisor` 配置与文档 |
| OpenCode | 1.14.48（在 PATH） | P0 默认 TemplateEngine；OpenCodeEngine 保留接口 + mock 事件 |
| Playwright chromium | 1208/1228 | E2E 浏览器 |
| better-sqlite3 | 11.x | 元数据存储（WAL） |

## 5. 跳过项与环境限制（plan §13 允许）

| 项 | 原因 | 处置 |
| --- | --- | --- |
| Docker/Podman 沙箱集成测试 | 当前 WSL2 环境无可用容器运行时（`docker --version` 不可执行） | 保留 `DockerSandboxRunner` + `DockerCommandBuilder`（argv 由单元测试覆盖）；运行时自动降级到 `MockSandboxRunner`（plan §13 第 1 条） |
| gVisor 集成测试 | 无 `runsc` runtime | 保留 `--runtime=runsc` 配置与 `sandbox/README.md`（plan §13 第 4 条） |
| 真实 OpenJiuwen SDK | API 未盘点 | `openjiuwen_adapter`/`openjiuwen_runtime` 保留边界，使用 mock runtime（plan §13 第 3 条） |
| 真实 OpenCode 调用 | P0 不依赖模型密钥，需确定性 | `OpenCodeEngine` 保留接口 + mock 事件流 + TemplateEngine fallback（plan §13 第 2 条） |
| python-runner 全局安装 | 系统 Python 受 PEP 668 外部管理 | `RunService` 通过 `PYTHONPATH` 将 runner 注入沙箱子进程，无需全局安装 |

> 说明：mock sandbox 提供**命令白名单 / 超时 kill / cwd 绑定 / env allowlist / stdout-stderr 采集 / 日志脱敏**等执行边界控制，但**不提供容器隔离**；仅在无 Docker 的开发/CI 环境作为 fallback。生产应使用 `DockerSandboxRunner`（构建 `agent-builder-sandbox:latest`）。

## 6. Demo 操作步骤

```bash
# 1. 安装
npm install
pip install -e "services/python-runner[dev]"   # 可选，仅装 CLI；RunService 已用 PYTHONPATH 注入

# 2. 启动后端（NestJS :3001）
npm run dev:api

# 3. 启动前端（Next.js :3000，自动代理 /api/* -> :3001）
npm run dev:web
```

打开 http://localhost:3000：

1. 选择「智能体」，粘贴塔罗 prompt，点「开始生成」→ 跳转 `/generations/{id}`。
2. 左侧时间线出现 计划/思考/文件/沙箱/测试 事件；状态徽标变「已完成」。
3. 「源码」Tab 打开 `src/agents/agent.py` 查看代码。
4. 「Agent 测试台」Tab 输入消息，看到抽牌与解读（mock）。
5. 点「导出代码包」下载 zip（不含 `.env`/日志/缓存）。
6. 回首页选「工作流」，粘贴售前 prompt，重复：完成后「Workflow 运行」展示节点状态与 Markdown 报告，再导出。

E2E 一键复现：`npm run test:e2e`（globalSetup 自动起后端 + 前端）。

## 7. 已知限制 / P1 建议

1. deterministic parser 仅识别两个示例 prompt；其他 prompt 走 `PROMPT_PARSE_FAILED`，待接入 LLM parser（保留接口）。
2. mock Agent/Workflow 为规则化 mock，不调用真实 LLM；接入真实 OpenJiuwen 时仅改 `openjiuwen_runtime` adapter。
3. 沙箱默认 mock（无容器隔离）；生产应切 `DockerSandboxRunner` + gVisor。
4. 任务队列内置 fire-and-forget；P1 可换 BullMQ/Celery + Worker 池。
5. SQLite 单机元数据；P1 迁 PostgreSQL。
6. 源码页 P0 只读；P1 在线编辑并回写生成上下文。
