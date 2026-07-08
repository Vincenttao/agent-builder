# Agent Builder P0 分阶段实施计划

版本：v0.1  
面向对象：负责一次性完成 P0 编码的编程 Agent  
依据：

1. `docs/prd/PRD-v0.3-agent-builder.md`
2. `docs/technical/agent_builder_architecture.md`
3. `docs/technical/runtime_and_sandbox.md`
4. `docs/technical/architecture_clarity_review.md`

## 1. 编程 Agent 总指令

### 1.1 P0 编码目标

本计划将 P0 编码目标固定为以下最小完整实现，不再在实现中反复摇摆技术路线：

```text
Next.js 前端
+ NestJS 编排后端
+ Python Runner
+ OpenCodeEngine
+ TemplateEngine fallback
+ Docker/Podman sandbox
+ gVisor 可配置但不阻塞 P0
+ SQLite 本地元数据
+ 本地 workspace 文件存储
+ mock OpenJiuwen runtime
```

理由：

1. OpenCode 已被纳入代码编程过程，Node/NestJS 更适合作为 OpenCode 会话、事件、权限和前端 BFF 的编排层。
2. 生成物是 Python/OpenJiuwen 工程，因此必须保留 Python Runner。
3. P0 阶段直接采用沙箱容器，不能把 `opencode`、`python`、`pytest`、生成物执行放在主服务进程中。
4. P0 必须能在无真实 OpenJiuwen 密钥、无真实模型服务时通过 mock 模式跑通端到端流程。

### 1.2 P0 必须完成的用户能力

1. 用户从首页输入 Agent prompt 并生成塔罗占卜 Agent。
2. 用户从首页输入 Workflow prompt 并生成售前需求分析 Workflow。
3. 生成过程展示计划、文件创建、OpenCode/模板生成、沙箱运行、测试结果等事件。
4. 生成完成后显示完成摘要。
5. Agent 测试台可以输入消息并得到 mock 回复。
6. Workflow 运行页可以展示节点运行状态和最终 Markdown 输出。
7. 源码页可以查看文件树和文件内容。
8. 导出 zip 包，且不包含密钥、日志、缓存、`.env`。
9. P0 不实现 Skills 独立创建。

### 1.3 TDD 强制要求

编程 Agent 必须采用测试驱动开发：

```text
每个阶段开始
  -> 先写失败测试
  -> 运行测试确认失败原因正确
  -> 编写最小实现
  -> 运行测试通过
  -> 补充回归测试
  -> 进入阶段检查点
```

禁止：

1. 先堆功能再补测试。
2. 只写 snapshot 或浅层测试冒充行为测试。
3. smoke test 跳过 Agent/Workflow 核心逻辑。
4. 在主后端进程直接执行生成代码。
5. 因 OpenJiuwen 真实 API 未就绪而删除 OpenJiuwen adapter 边界。
6. 因 OpenCode 不可用而删除 OpenCodeEngine；必须保留 TemplateEngine fallback。

### 1.4 测试分层

| 层级 | 工具 | 必测内容 |
| --- | --- | --- |
| 后端单元测试 | Jest | service、DTO、schema、事件、导出过滤、路径安全 |
| Python Runner 测试 | pytest | mock OpenJiuwen runtime、Agent/Workflow smoke test |
| 沙箱集成测试 | Jest 或 shell test | Docker/Podman 命令生成、超时、网络策略、日志采集 |
| 生成物测试 | pytest | 生成的 Agent/Workflow 工程能运行 smoke test |
| 前端组件测试 | Vitest/React Testing Library | 首页、事件时间线、源码查看、测试台 |
| E2E 测试 | Playwright | Agent 与 Workflow 两条完整链路 |

## 2. 代码仓库目标结构

P0 编程 Agent 应创建以下结构：

```text
agent-builder/
├── apps/
│   ├── web/                       # Next.js
│   └── api/                       # NestJS
├── services/
│   └── python-runner/             # Python runner + mock OpenJiuwen runtime
├── packages/
│   ├── shared-contracts/          # TS shared types / schemas
│   └── generated-project-templates/
├── sandbox/
│   ├── Dockerfile
│   ├── scripts/
│   └── README.md
├── workspace/
│   ├── generated/                 # gitignored
│   ├── exports/                   # gitignored
│   ├── runs/                      # gitignored
│   └── metadata.db                # gitignored
├── docs/
└── package.json
```

需要同步更新 `.gitignore`：

```text
workspace/generated/
workspace/exports/
workspace/runs/
workspace/*.db
node_modules/
.next/
dist/
coverage/
.pytest_cache/
```

## 3. 阶段总览

| 阶段 | 名称 | 目标 | 主要输出 | 阶段检查点 |
| --- | --- | --- | --- | --- |
| Phase 0 | 基线与契约 | 建立 monorepo、测试框架、共享契约 | 项目脚手架、CI 命令、契约测试 | 测试命令可运行且有失败到通过记录 |
| Phase 1 | 数据模型与事件流 | 实现 Generation、Event、Version、Run、SandboxJob | NestJS services、SQLite schema、SSE | 任务能创建并推送事件 |
| Phase 2 | Spec Parser 与 Validator | prompt -> Agent/Workflow Spec | deterministic parser、schema 校验 | 两个内置示例生成合法 Spec |
| Phase 3 | Sandbox Service | 任务级沙箱运行抽象 | Docker/Podman runner、超时、日志 | python/pytest 在沙箱内运行 |
| Phase 4 | CodeGenerationEngine | Template/OpenCode/Mock 三引擎 | TemplateEngine、OpenCodeEngine、fallback | 能生成 Agent/Workflow 文件树 |
| Phase 5 | Python Runner 与 OpenJiuwen mock | 生成物运行与 smoke test | mock runtime、pytest tests | 两个生成物 smoke test 通过 |
| Phase 6 | API 编排 | 端到端生成 API | REST、SSE、文件、运行、导出 API | 后端 E2E 通过 |
| Phase 7 | 前端工作台 | 首页、生成页、源码页、测试台 | Next.js 页面组件 | 前端组件和 Playwright 初步通过 |
| Phase 8 | P0 E2E 与硬化 | 完整 P0 验收 | E2E、导出、安全检查 | P0 验收清单全绿 |

## 4. Phase 0：基线与契约

### 4.1 目标

建立可运行、可测试、可扩展的 monorepo 基线。

### 4.2 先写测试

必须先创建以下测试并确认失败：

1. `packages/shared-contracts` 中 Generation 状态枚举测试。
2. API health check 测试。
3. Python Runner health check 测试。
4. 前端首页 smoke test。

### 4.3 实现任务

1. 初始化 monorepo。
2. 创建 `apps/web` Next.js。
3. 创建 `apps/api` NestJS。
4. 创建 `services/python-runner`。
5. 创建 `packages/shared-contracts`。
6. 配置统一命令：

```bash
npm run test
npm run test:api
npm run test:web
npm run test:e2e
npm run lint
npm run typecheck
```

7. Python Runner 配置：

```bash
cd services/python-runner
python -m pytest
```

### 4.4 阶段检查点

1. `npm run test` 能执行。
2. `npm run lint` 能执行。
3. `npm run typecheck` 能执行。
4. `python -m pytest` 能执行。
5. README 或开发文档说明本地启动方式。

### 4.5 注意事项

1. 不要在 Phase 0 引入真实 OpenJiuwen API。
2. 不要实现业务逻辑，只建立可测试骨架。
3. 所有后续阶段必须在这些命令上增量通过。

## 5. Phase 1：数据模型与事件流

### 5.1 目标

实现后端核心任务状态、事件记录、SSE 推送和本地 SQLite 持久化。

### 5.2 先写测试

1. 创建 Generation 后状态为 `pending` 或 `planning`。
2. 事件按 `sequence` 递增。
3. SSE 订阅能收到历史事件和新增事件。
4. failed 状态不会覆盖已有 completed version。
5. `SandboxJob` 可记录 runtime、命令、资源限制、退出码。

### 5.3 实现任务

1. 定义实体：
   - `Generation`
   - `GenerationEvent`
   - `ProjectVersion`
   - `RunRecord`
   - `SandboxJob`
2. 实现 SQLite repository。
3. 实现 `event_service`。
4. 实现 `generation_service.create_generation`。
5. 实现 SSE endpoint：

```http
GET /api/generations/{generation_id}/events
```

### 5.4 阶段检查点

1. 创建任务 API 返回 `generation_id`。
2. 数据库中有 generation 记录。
3. SSE 能收到 `plan_created` 测试事件。
4. 事件顺序稳定可断线恢复。
5. 单元测试覆盖状态流转。

### 5.5 注意事项

1. 事件是前端工作台的核心，不要只写日志。
2. 所有长任务输出都必须转成事件。
3. `payload_json` 必须可扩展，不能把所有字段硬编码成列。

## 6. Phase 2：Spec Parser 与 Validator

### 6.1 目标

实现 deterministic parser，确保两个标准 Demo prompt 稳定生成合法 Spec。

### 6.2 先写测试

1. 塔罗 Agent prompt 生成 Agent Spec。
2. 售前 Workflow prompt 生成 Workflow Spec。
3. Agent Spec 缺少 name 时校验失败。
4. Workflow Spec 缺少 Start/End 时校验失败。
5. Workflow edge 指向不存在节点时校验失败。
6. 非 P0 Skills prompt 不会进入 Skills 创建流程。

### 6.3 实现任务

1. 定义 Agent Spec schema。
2. 定义 Workflow Spec schema。
3. 实现 `spec_parser`。
4. 实现 `spec_validator`。
5. 将 parser 接入 `generation_service`。

### 6.4 阶段检查点

1. 两个 PRD 标准 prompt 生成稳定 Spec。
2. Spec 输出可序列化为 JSON。
3. Workflow 节点至少包含 Start、End 和 3 个业务节点。
4. Agent Spec 至少包含一个工具定义。
5. 错误 prompt 返回 `PROMPT_PARSE_FAILED` 或 `SPEC_VALIDATION_FAILED`。

### 6.5 注意事项

1. P0 不依赖 LLM parser，先用 deterministic parser 保证稳定。
2. 后续可插入 LLM parser，但必须保留 deterministic 示例。
3. 模板只能消费 Spec，不允许直接拼接原始 prompt 到代码。

## 7. Phase 3：Sandbox Service

### 7.1 目标

实现一次性沙箱任务，用于运行 `opencode`、`python`、`pytest` 和生成物。

### 7.2 先写测试

1. SandboxJob 生成正确 Docker 参数。
2. 默认网络策略为 `none`。
3. 资源限制包含 CPU、memory、pids。
4. workspace 只挂载当前 generation/version 目录。
5. 超时任务会被标记为 `timeout`。
6. stdout/stderr 被写入 run log。
7. 禁止命令不进入容器执行。

### 7.3 实现任务

1. 创建 `sandbox/Dockerfile`。
2. 实现 `sandbox_service`。
3. 实现命令 allowlist。
4. 实现环境变量 allowlist。
5. 实现日志采集。
6. 实现 mock sandbox fallback，用于无 Docker 的单元测试。
7. 支持 runtime：
   - `docker`
   - `podman`
   - `gvisor` 配置项，但允许环境不可用时跳过 gVisor 集成测试。

### 7.4 阶段检查点

1. `python --version` 能在沙箱中运行。
2. `python -m pytest` 能在沙箱中运行一个空测试。
3. 默认不能联网。
4. 不挂载宿主 Docker socket。
5. 主服务没有直接运行生成代码的路径。

### 7.5 注意事项

1. 不要用 `shell: true` 拼接用户输入。
2. 不要把 `.env` 写入 workspace。
3. 不要使用 privileged 容器。
4. `opencode serve` 必须是任务级临时实例，不允许全局长期实例。

## 8. Phase 4：CodeGenerationEngine

### 8.1 目标

实现 `TemplateEngine`、`OpenCodeEngine`、`MockEngine`，并通过统一接口接入 generation flow。

### 8.2 先写测试

1. `TemplateEngine` 根据 Agent Spec 生成标准 Agent 文件树。
2. `TemplateEngine` 根据 Workflow Spec 生成标准 Workflow 文件树。
3. `OpenCodeEngine` 在 mock sandbox 中产生 `opencode_started`、`opencode_file_changed`、`opencode_finished` 事件。
4. OpenCode 不可用时自动 fallback 到 TemplateEngine。
5. 生成文件不得写出当前 workspace。
6. 生成内容不得包含真实 API key。

### 8.3 实现任务

1. 定义接口：

```ts
interface CodeGenerationEngine {
  generate(spec: AgentSpec | WorkflowSpec, context: GenerationContext): Promise<GenerationResult>
}
```

2. 实现 `TemplateEngine`。
3. 实现 `MockEngine`。
4. 实现 `OpenCodeEngine`：
   - P0 使用 `opencode run` 或任务级 `opencode serve`。
   - prompt 写入 `.agent_builder/prompt.md`。
   - 输出事件转换为系统事件。
5. 接入 `generation_service`。

### 8.4 阶段检查点

1. Agent 生成目录包含 `pyproject.toml`、`README.md`、`.env.example`、`src/agents/agent.py`、`tests/test_agent_smoke.py`。
2. Workflow 生成目录包含 `workflow.yaml`、`src/workflows/workflow.py`、components、`tests/test_workflow_smoke.py`。
3. 生成事件包含文件创建事件。
4. OpenCodeEngine 可被配置开启/关闭。
5. TemplateEngine fallback 可靠。

### 8.5 注意事项

1. OpenCode 不是运行框架，生成代码仍必须面向 OpenJiuwen adapter。
2. 不要让 OpenCode 自由选择 LangGraph、CrewAI、Dify。
3. 生成摘要不能代替 smoke test。

## 9. Phase 5：Python Runner 与 OpenJiuwen Mock

### 9.1 目标

实现 Python Runner，让生成物在 mock OpenJiuwen runtime 下可运行、可测试。

### 9.2 先写测试

1. mock Agent 可接收消息并返回结构化回复。
2. mock Tool 调用可记录输入输出。
3. mock Workflow 可按节点顺序执行。
4. 塔罗 Agent smoke test 通过。
5. 售前 Workflow smoke test 通过。
6. 缺少真实密钥时仍能 mock run。

### 9.3 实现任务

1. 创建 `services/python-runner`。
2. 实现 mock OpenJiuwen adapter。
3. 实现 Agent run command。
4. 实现 Workflow run command。
5. 实现结构化输出：

```json
{
  "status": "success",
  "output": {},
  "events": [],
  "mock": true
}
```

6. 将 Python Runner 命令接入 Sandbox Service。

### 9.4 阶段检查点

1. Agent 生成物 smoke test 在沙箱内通过。
2. Workflow 生成物 smoke test 在沙箱内通过。
3. 运行记录包含 stdout/stderr 路径。
4. mock 模式在 UI/API 中可见。
5. Python Runner 不依赖主服务内存状态。

### 9.5 注意事项

1. OpenJiuwen 真实 API 未盘点前，只实现 mock adapter 和占位边界。
2. 不要把 mock 写死到生成物业务逻辑里，应通过配置切换。
3. 真实 API 接入必须后续通过 `openjiuwen_api_inventory.md` 指导。

## 10. Phase 6：API 编排

### 10.1 目标

完成后端 REST/SSE API，实现从创建任务到生成、测试、源码查看、Agent run、Workflow run、导出的完整链路。

### 10.2 先写测试

1. `POST /api/generations` 创建 Agent 任务。
2. `POST /api/generations` 创建 Workflow 任务。
3. `GET /api/generations/{id}` 返回状态。
4. `GET /api/generations/{id}/events` 返回事件流。
5. `GET /api/generations/{id}/files` 返回文件树。
6. `GET /api/generations/{id}/files/content` 阻止 `..` 路径。
7. `POST /api/generations/{id}/agent/runs` 返回 Agent 回复。
8. `POST /api/generations/{id}/workflow/runs` 返回 Workflow 输出。
9. `POST /api/generations/{id}/exports` 生成 zip。

### 10.3 实现任务

1. 实现所有 PRD API 草案。
2. 实现文件树扫描。
3. 实现文件内容读取和路径安全。
4. 实现 Agent run API。
5. 实现 Workflow run API。
6. 实现 export API。
7. 实现错误码：
   - `PROMPT_PARSE_FAILED`
   - `SPEC_VALIDATION_FAILED`
   - `CODE_GENERATION_FAILED`
   - `TEST_FAILED`
   - `RUN_FAILED`
   - `EXPORT_FAILED`

### 10.4 阶段检查点

1. 后端集成测试可完整生成 Agent。
2. 后端集成测试可完整生成 Workflow。
3. 文件 API 不能越界读取。
4. 导出 zip 不包含 `.env`、日志、缓存。
5. 失败任务不会覆盖上一个成功版本。

### 10.5 注意事项

1. 所有 API 返回对象必须使用 shared contracts。
2. 错误响应要给用户可理解 message，也要保留内部日志。
3. 长任务不能阻塞 HTTP request；创建任务后通过事件推进。

## 11. Phase 7：前端工作台

### 11.1 目标

实现 PRD 图片对应的核心界面骨架：首页输入、生成工作台、测试台、源码查看、底部运行记录。

### 11.2 先写测试

1. 首页可切换 Agent/Workflow。
2. 首页提交后跳转 generation 页面。
3. 生成页面可渲染事件时间线。
4. completed 后显示 Agent 测试台或 Workflow 运行页。
5. 源码页显示文件树和代码内容。
6. 导出按钮调用 export API。

### 11.3 实现任务

1. `apps/web/app/page.tsx` 首页。
2. `apps/web/app/generations/[id]/page.tsx` 生成工作台。
3. `GenerationTimeline`。
4. `AgentTestPanel`。
5. `WorkflowRunPanel`。
6. `FileTree`。
7. `CodeViewer`。
8. `TerminalPanel` / `RunLogPanel` / `OutputPanel`。
9. SSE client。

### 11.4 阶段检查点

1. 生成过程能展示 plan、file、sandbox、test 事件。
2. Agent 测试台能发送消息。
3. Workflow 运行页能展示节点状态。
4. 源码页能打开 `src/agents/agent.py` 和 `src/workflows/workflow.py`。
5. UI 不展示 Skills 独立创建入口。

### 11.5 注意事项

1. 页面第一屏应是可用工作台，不做营销落地页。
2. 不要用大段说明文字替代交互。
3. 组件状态必须能处理 `pending`、`planning`、`generating`、`testing`、`completed`、`failed`。
4. 事件流断开时要显示重连状态。

## 12. Phase 8：P0 E2E 与硬化

### 12.1 目标

完成 P0 全链路验收，确保编程 Agent 可以一次性交付可运行 Demo。

### 12.2 先写测试

Playwright E2E：

1. 输入塔罗 Agent prompt。
2. 等待生成 completed。
3. 查看完成摘要。
4. 打开源码。
5. 运行 Agent 测试消息。
6. 导出 zip。
7. 输入售前 Workflow prompt。
8. 等待生成 completed。
9. 查看节点运行记录。
10. 导出 zip。

安全回归测试：

1. 文件读取 `../../etc/passwd` 被拒绝。
2. 导出不包含 `.env`。
3. 禁止命令不进入沙箱执行。
4. 超时任务被 kill。
5. 默认网络策略为 none。

### 12.3 实现任务

1. 补齐端到端测试。
2. 补齐失败状态 UI。
3. 补齐日志脱敏。
4. 补齐导出过滤。
5. 补齐 README。
6. 补齐开发脚本。

### 12.4 P0 最终验收检查点

必须全部满足：

1. `npm run test` 通过。
2. `npm run lint` 通过。
3. `npm run typecheck` 通过。
4. `python -m pytest` 通过。
5. `npm run test:e2e` 通过或在文档中列出不可运行原因。
6. 塔罗 Agent 示例完整生成。
7. 售前 Workflow 示例完整生成。
8. 两个示例都有源码查看。
9. 两个示例都有 smoke test 结果。
10. 导出包可解压且无密钥。
11. OpenCode 不可用时 TemplateEngine fallback 能跑通。
12. Docker 不可用时单元测试仍可用 mock sandbox 跑通。
13. UI 中没有 Skills 独立创建流程。

### 12.5 注意事项

1. 不要为了让 E2E 过而绕过后端真实生成流程。
2. 不要只 mock 前端 API。
3. P0 允许 OpenJiuwen mock，但不允许删除 OpenJiuwen adapter 边界。
4. P0 允许 gVisor 集成测试跳过，但必须保留配置和文档。

## 13. 编程 Agent 执行顺序建议

建议按以下顺序一次完成 P0：

```text
1. Phase 0 建立 monorepo 和测试命令
2. Phase 1 数据模型、事件、SSE
3. Phase 2 Spec parser/validator
4. Phase 3 mock sandbox + Docker sandbox
5. Phase 4 TemplateEngine + MockEngine，再接 OpenCodeEngine
6. Phase 5 Python Runner + mock OpenJiuwen
7. Phase 6 API 编排
8. Phase 7 前端页面
9. Phase 8 E2E、安全硬化、README
```

如果中途遇到环境限制：

1. Docker 不可用：保留 mock sandbox，标记 Docker 集成测试 skipped，并写明原因。
2. OpenCode 不可用：保留 OpenCodeEngine 接口和 mock，使用 TemplateEngine fallback 跑通。
3. OpenJiuwen 不可用：使用 mock OpenJiuwen runtime，不得删除 adapter。
4. gVisor 不可用：保留 runtime 配置和文档，使用 Docker fallback。

## 14. 最终交付物

P0 编程 Agent 完成后必须交付：

1. 可运行代码。
2. 测试通过记录。
3. 本地启动说明。
4. P0 验收结果。
5. 已知限制。
6. 后续 P1 建议。

建议新增：

```text
docs/technical/p0_acceptance_report.md
```

内容包括：

1. 各阶段检查点是否通过。
2. 未通过项原因。
3. 跳过测试原因。
4. 环境依赖版本。
5. Demo 操作步骤。

## 15. 关键风险提醒

1. OpenCode 是代码生成执行层，不是 Agent/Workflow 运行框架。
2. OpenJiuwen 是生成物的目标运行能力，不能被 OpenCode 替代。
3. Python Runner 必须保留，即使主后端使用 Node/NestJS。
4. 沙箱是 P0 默认设计项，不是后续增强。
5. P0 不做 Skills 独立创建。
6. 不要把 API key 写入源码、日志、导出包。
7. 不要让用户输入直接进入 shell。
8. 不要让生成任务访问工作区外文件。
9. 不要把失败任务标记为 completed。
10. 不要把 mock 结果伪装成真实 OpenJiuwen 运行。
