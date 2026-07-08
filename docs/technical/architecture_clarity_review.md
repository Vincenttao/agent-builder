# Agent Builder 架构设计清晰度检查

检查对象：`docs/technical/agent_builder_architecture.md`、`docs/technical/runtime_and_sandbox.md`  
依据：`docs/prd/PRD-v0.3-agent-builder.md`  
检查日期：2026-07-09  

## 1. 总体结论

当前架构文档已达到“可交付给详细技术设计 Agent 继续拆分”的清晰度要求。

原因：

1. 明确了 P0 只做 Agent/Workflow，不做 Skills 独立创建。
2. 给出了 P0 快速版和 P0+ OpenCode 深度集成版两条技术路线。
3. 给出了 11 组前后端技术组合，并新增 OpenCode + NestJS + Python Runner + gVisor 的目标架构。
4. 明确了推荐方案选择理由、替代方案优缺点和适用边界。
5. 给出了逻辑架构、部署架构、后端模块、前端页面、事件流、数据模型、API、文件存储、运行沙箱和测试策略。
6. 对 OpenJiuwen 真实 API 未盘点的问题做了明确边界，不把占位 API 当作真实 API。
7. 将 P0 沙箱从后续增强调整为默认设计项，并补充 Docker/Podman/gVisor/E2B/Firecracker 的选择边界。

仍需在下一阶段补齐：

1. OpenJiuwen API 盘点。
2. Agent Spec / Workflow Spec JSON Schema。
3. 代码生成模板细节。
4. OpenCodeEngine 的具体 prompt、session 和事件映射。
5. 前端组件交互稿或状态机细化。

这些缺口不阻碍当前架构文档作为详细设计输入，因为文档已经明确把它们列为后续产物。

## 2. PRD 覆盖检查

| PRD 要求 | 架构文档覆盖情况 | 评价 |
| --- | --- | --- |
| 自然语言生成 Agent/Workflow | 第 1、4、5、11 章覆盖 | 清晰 |
| P0 不做 Skills 独立创建 | 第 1.2 章覆盖 | 清晰 |
| 基于 OpenJiuwen 能力构建 | 第 6、14、15 章覆盖 | 清晰，但依赖 API 盘点 |
| 展示生成过程 | 第 5、8、9、11 章覆盖事件流 | 清晰 |
| 自动运行测试 | 第 5.5、13 章覆盖 | 清晰 |
| 效果测试台 | 第 8.5、9.2、9.4 覆盖 | 清晰 |
| Workflow 运行记录 | 第 8.6、9.2、13 覆盖 | 清晰 |
| 源码查看 | 第 8.4、9.1、9.2、10 覆盖 | 清晰 |
| 导出代码包 | 第 8.7、10 覆盖 | 清晰 |
| 版本和修改记录 | 第 7.3 覆盖 ProjectVersion | 基本清晰，可在详细设计细化 UI |
| 错误处理 | 第 5.2、11、12 覆盖 | 基本清晰，可在详细设计细化错误码 |
| 前后端技术选型组合 | 第 2、3、15 章覆盖 | 清晰 |
| OpenCode 集成定位 | 架构文档第 2.3、5.5 章覆盖 | 清晰 |
| Node/NestJS 后端取舍 | 架构文档第 2.4、3.8、15 章覆盖 | 清晰 |
| P0 沙箱容器 | 架构文档第 2.5、12 章与 runtime 文档覆盖 | 清晰 |

## 3. 技术设计可执行性检查

### 3.1 架构边界

结论：清晰。

证据：

1. 前端只通过 REST/SSE/WebSocket 调用后端。
2. 后端封装生成、运行、导出、事件、版本、OpenCodeEngine、Sandbox Service 和 OpenJiuwen adapter。
3. 生成物运行被限制在 `workspace/generated/{generation_id}/{version_id}`。
4. OpenJiuwen 真实 SDK 被隔离在 adapter 中。
5. `opencode`、`python`、`pytest`、生成物执行进入一次性沙箱任务。

### 3.2 模块拆分

结论：清晰。

后端模块可直接进入详细设计：

1. `generation_service`
2. `spec_parser`
3. `spec_validator`
4. `project_generator`
5. `code_generation_engine`
6. `opencode_engine`
7. `template_renderer`
8. `sandbox_service`
9. `run_service`
10. `python_runner_service`
11. `event_service`
12. `version_service`
13. `export_service`
14. `openjiuwen_adapter`

前端模块可直接进入详细设计：

1. 首页输入。
2. 生成时间线。
3. Agent 测试台。
4. Workflow 运行面板。
5. 源码文件树。
6. 代码查看器。
7. 底部终端/运行记录/输出。

### 3.3 数据与状态

结论：基本清晰。

已定义：

1. `Generation`
2. `GenerationEvent`
3. `ProjectVersion`
4. `RunRecord`
5. `SandboxJob`
6. 任务状态流转。

需要详细设计补齐：

1. SQLite 表结构。
2. 索引。
3. 事件 sequence 生成规则。
4. run record、sandbox job 与 generation event 的关联查询。

### 3.4 OpenJiuwen 依赖

结论：边界清晰，但实现不可直接开始。

原因：

1. 架构文档没有假设 OpenJiuwen 真实 API。
2. 文档要求先输出 `docs/technical/openjiuwen_api_inventory.md`。
3. adapter 接口已给出，可以作为 API 盘点后的落点。

这是正确状态：当前文档能指导技术设计，但不能替代 OpenJiuwen API 盘点。

### 3.5 技术选型

结论：清晰。

已覆盖：

1. P0 快速版与 P0+ 推荐组合。
2. React/Vue/SvelteKit 前端组合。
3. FastAPI/Django/NestJS/Go/Python-only 后端组合。
4. Web、本地桌面、极简 AI demo 三类交付形态。
5. OpenCode 深度集成时 Node/NestJS 后端的适用边界。
6. 每组方案的适用场景、优点、缺点、风险和适合度。

推荐方案应按 OpenCode 集成深度选择：

1. OpenCode 只是辅助生成：`Next.js + FastAPI + OpenCode CLI/serve + Docker/Podman sandbox`。
2. OpenCode 是核心代码生成执行层：`Next.js + NestJS + OpenCodeEngine + Python Runner + Docker/gVisor sandbox`。

### 3.6 运行与沙箱

结论：清晰。

已覆盖：

1. P0 快速版：Docker 或 rootless Podman。
2. P0+ 目标版：Docker + gVisor `runsc`。
3. P1 平台版：sandbox pool、资源调度、Firecracker/Kata 或托管 sandbox。
4. 命令白名单、网络策略、环境变量 allowlist、导出过滤和日志脱敏。
5. OpenCode `run` 与 `serve` 的任务级运行边界。

## 4. 清晰度问题与修正建议

### 4.1 需要在详细设计中进一步明确

1. `Spec Parser` 的 LLM prompt、JSON 修复策略和失败重试规则。
2. Agent/Workflow 生成模板的具体文件内容。
3. OpenCodeEngine 的 session 存储、prompt 模板和 JSON/event 映射。
4. 前端 SSE 断线重连和事件补偿策略。
5. 导出 zip 的路径过滤实现。
6. mock OpenJiuwen runtime 的输出协议。
7. gVisor 兼容性验证和 Docker fallback 切换策略。

### 4.2 不建议现在过早固化

1. OpenJiuwen 真实类名和方法名。
2. Workflow Component 的具体类型映射。
3. Tool 注册 API。
4. 流式输出 hook。
5. 模型配置字段。
6. OpenCode SDK/Server API 的最终调用形态。

原因：这些必须等 OpenJiuwen API 盘点后再写，否则会把错误接口带入实现。

## 5. 是否足够交付

结论：可以交付。

交付给下一个详细技术设计 Agent 时，应同时附带：

1. `docs/prd/PRD-v0.3-agent-builder.md`
2. `docs/technical/agent_builder_architecture.md`
3. `docs/technical/architecture_clarity_review.md`
4. `docs/technical/runtime_and_sandbox.md`
5. `docs/technical/p0_implementation_plan.md`

下一个 Agent 的第一项任务必须是：

```text
创建 docs/technical/openjiuwen_api_inventory.md，盘点 OpenJiuwen 的 Agent、Tool、Workflow、Runner、Model 配置和运行事件 API。
```

完成 API 盘点后，再继续拆：

1. `docs/technical/spec_schema.md`
2. `docs/technical/code_generation_templates.md`
3. `docs/technical/frontend_interaction_design.md`
4. `docs/technical/acceptance_test_plan.md`
