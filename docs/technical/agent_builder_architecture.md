# Agent Builder Demo 架构设计文档

版本：v0.1  
依据：`docs/prd/PRD-v0.3-agent-builder.md`  
状态：初稿，可进入详细技术设计拆分  

## 1. 目标与边界

### 1.1 架构目标

Agent Builder Demo 的目标是演示：

```text
自然语言输入
-> 解析为 Agent/Workflow Spec
-> 生成基于 OpenJiuwen 的 Python 工程
-> 展示生成过程
-> 自动运行测试
-> 展示效果与源码
-> 导出代码包
```

架构必须支持两条 P0 主链路：

1. 生成 Agent：自然语言需求生成可运行的 OpenJiuwen Agent Python 工程。
2. 生成 Workflow：自然语言流程描述生成可运行的 OpenJiuwen Workflow Python 工程。

### 1.2 P0 明确不做

1. 不做 Skills/技能独立创建、管理、测试和导出。
2. 不做 Agent Store。
3. 不做生产级云部署、多租户、企业权限、计费、审计。
4. 不生成 LangGraph、CrewAI、Dify、OpenAI Agents SDK 等非 OpenJiuwen 编排工程。
5. 不要求在线源码编辑，源码页 P0 可只读。

### 1.3 架构设计原则

1. **OpenJiuwen 适配隔离**：UI、模板、运行器不直接调用 OpenJiuwen SDK。
2. **Demo 优先**：优先保证两条标准示例完整跑通，而不是做完整平台。
3. **事件可观测**：生成计划、文件变更、命令执行、测试结果必须可推送到前端。
4. **生成物可交付**：导出的代码包必须包含 README、配置示例、源码、示例输入和 smoke test。
5. **真实 API 延迟绑定**：OpenJiuwen 真实 API 未盘点前，文档只定义适配接口，不假设 SDK 具体方法名。
6. **代码生成引擎可插拔**：模板生成、OpenCode 生成、mock 生成必须通过统一接口接入。
7. **P0 即采用沙箱运行**：`opencode`、`python`、`pytest` 和生成物执行默认进入一次性容器沙箱。

## 2. 推荐技术方案

### 2.1 P0 推荐组合

推荐用于 Demo v0.3 的组合分两档：

| 档位 | 推荐技术 | 使用场景 |
| --- | --- | --- |
| P0 快速版 | Next.js + FastAPI + OpenCode CLI/serve + Docker/Podman 沙箱 + Python Runner | 先跑通 Demo，OpenCode 作为辅助代码生成引擎 |
| P0+ 推荐版 | Next.js + NestJS 编排后端 + OpenCode Engine + Python Runner Service + Docker/gVisor 沙箱 | OpenCode 成为核心代码生成能力，需要会话、事件、权限和多轮修改管理 |

P0 快速版仍然可用 FastAPI。若确认 OpenCode 是核心能力，架构应升级为 P0+ 推荐版。

| 层 | 推荐技术 | 选择理由 |
| --- | --- | --- |
| 前端 | Next.js + React + TypeScript | 适合复杂工作台 UI、路由、组件化、服务端/客户端混合能力，生态成熟 |
| UI | Tailwind CSS + shadcn/ui 或等效组件库 | 快速构建输入框、Tabs、面板、弹窗、按钮和表单 |
| 代码查看 | Monaco Editor 只读模式 | 接近 IDE 的源码查看体验 |
| 终端展示 | xterm.js 只读/半只读输出 | 匹配 PRD 中底部终端/运行记录/输出面板 |
| 前端事件 | SSE 优先，WebSocket 备用 | 生成过程主要是服务端单向推送，SSE 更简单 |
| 后端 API | FastAPI 或 NestJS | FastAPI 适合快速 Python 一体化；NestJS 适合 OpenCode 深度集成和 TypeScript BFF |
| 代码生成引擎 | TemplateEngine + OpenCodeEngine + MockEngine | 保证 OpenCode 可插拔，避免锁死在单一实现 |
| Python Runner | 独立 Python 运行服务或沙箱内 runner | 执行 OpenJiuwen 生成物、pytest 和 smoke test |
| 沙箱 | Docker/Podman P0；Docker + gVisor P0+ | P0 起即隔离 `opencode`、`python`、`pytest` 和生成代码 |
| 异步任务 | P0 内置任务队列；P1 BullMQ/Celery/RQ/Arq | 根据主后端语言选择任务框架，先降低部署复杂度 |
| 数据库 | SQLite P0；PostgreSQL P1 | Demo 单机足够，后续可平滑迁移 |
| 文件存储 | 本地文件系统 `workspace/generated` | Demo 可检查、可导出、可调试 |
| 测试 | pytest + Playwright | 后端/生成物 smoke test 与前端 E2E 验收 |
| 打包导出 | Python `zipfile` 或 Node archiver | 随主后端/runner 边界选择，必须统一过滤密钥和缓存 |

### 2.2 推荐方案的核心判断

FastAPI 适合本项目的原因：

1. 后端天然需要 Python 运行环境来生成 Python 工程、调用 pytest、封装 OpenJiuwen。
2. FastAPI 支持基于类型的请求校验和 OpenAPI 文档，适合 Spec/API 快速迭代。
3. FastAPI 支持异步接口、WebSocket 和后台任务，能承载生成事件推送和短任务编排。
4. 如果 OpenCode 只通过 CLI 或 HTTP server 集成，FastAPI 的集成成本仍然可控。

NestJS/Node 后端适合 OpenCode 深度集成的原因：

1. OpenCode 的 SDK、会话管理和前端 BFF 更贴近 TypeScript/Node 生态。
2. Next.js 前端与 NestJS 后端可以共享 TypeScript 类型、DTO 和事件协议。
3. Node 后端更适合做 OpenCode session、文件事件、权限策略、SSE/WebSocket 聚合。
4. 即使采用 Node 编排，OpenJiuwen 生成物执行和 pytest 仍应保留 Python Runner。

Next.js 适合本项目的原因：

1. 工作台 UI 包含首页、生成页、测试台、源码页，路由和状态管理复杂度中等。
2. React 生态中 Monaco Editor、xterm.js、状态管理和组件库选择丰富。
3. Next.js 可先作为纯前端使用，也可在后续增加 BFF/API Route。

### 2.3 OpenCode 集成定位

OpenCode 作为代码编程/代码生成执行层，不替代 OpenJiuwen。

```text
Agent Builder
  -> 需求解析 / Spec 生成
  -> 调用 OpenCode 生成或修改 Python 工程代码
  -> 生成物仍然必须基于 OpenJiuwen Agent / Workflow
  -> 系统负责测试、源码展示、导出、版本和沙箱
```

内部接口：

```text
CodeGenerationEngine
├── TemplateEngine       # 确定性模板生成，Demo fallback
├── OpenCodeEngine       # 调用 opencode run/serve/SDK 生成或修改代码
└── MockEngine           # 无模型环境下跑通端到端流程
```

OpenCode 约束：

1. 只负责写代码、改代码、解释代码、生成测试。
2. 生成出的 Agent/Workflow 必须调用 OpenJiuwen adapter。
3. 不允许生成 LangGraph、CrewAI、Dify 等非目标框架工程。
4. OpenCode 只能访问当前任务 workspace。
5. OpenCode 执行必须进入沙箱容器。

### 2.4 Node 后端取舍

是否切换 Node 后端取决于 OpenCode 的集成深度：

| 场景 | 推荐 |
| --- | --- |
| OpenCode 只是 CLI 辅助生成 | 保留 FastAPI 主后端 |
| OpenCode 需要会话、多轮修改、事件聚合、权限和模型配置管理 | 使用 NestJS 编排后端 |
| OpenJiuwen 只有 Python SDK 或生成物必须用 pytest 验证 | 无论主后端是什么，都保留 Python Runner |

推荐演进：

```text
P0 快速版：
Next.js + FastAPI + OpenCode CLI/serve + Python Runner + Docker/Podman sandbox

P0+ 推荐版：
Next.js + NestJS + OpenCode Engine + Python Runner Service + Docker/gVisor sandbox

长期平台版：
Next.js + NestJS + Queue/Worker + Python Runner Pool + PostgreSQL + Sandbox Pool
```

### 2.5 P0 沙箱推荐

P0 阶段直接上容器沙箱。推荐排序：

| 方案 | 推荐度 | 说明 |
| --- | --- | --- |
| Docker + hardened flags | 高 | 最快落地，适合内部 Demo |
| Rootless Podman | 高 | daemonless/rootless，本地安全边界更自然 |
| Docker + gVisor `runsc` | 很高 | 更强隔离，适合 OpenCode 成为核心执行层 |
| Docker Sandboxes | 可选 | 面向 AI coding agent，有 OpenCode guide，但需确认产品可用性 |
| E2B | 可选 | 云端现成 sandbox，适合快速托管验证 |
| Firecracker/Kata | P1 | microVM 隔离强，但 P0 集成成本偏高 |

P0 默认命令形态：

```bash
docker run --rm \
  --network none \
  --cpus 1 \
  --memory 1g \
  --pids-limit 256 \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,size=256m \
  -v "$WORKSPACE:/workspace:rw" \
  -w /workspace \
  agent-builder-sandbox:latest \
  python -m pytest tests/test_agent_smoke.py
```

若需要访问 OpenJiuwen 或模型服务，网络从 `none` 改为受控网络，只放行必要 endpoint。

## 3. 技术选型组合矩阵

### 3.1 组合 A：Next.js + FastAPI + SQLite/本地文件系统

推荐级别：P0 首选

| 维度 | 说明 |
| --- | --- |
| 适用场景 | 单机 Demo、快速交付、重 Python 生成逻辑 |
| 前端 | Next.js、React、TypeScript、Tailwind、Monaco、xterm.js |
| 后端 | FastAPI、Pydantic、pytest、zipfile |
| 存储 | SQLite 保存任务元数据，本地文件系统保存生成工程 |
| 事件 | SSE |
| 优点 | 前后端职责清晰；Python 后端易接 OpenJiuwen；开发速度快；部署复杂度低 |
| 缺点 | SQLite/本地文件不适合多人并发和长期生产；后台任务能力有限 |
| 风险 | 长任务阻塞 API worker；需要严格控制生成命令边界 |
| 适合度 | Demo v0.3 最合适 |

### 3.2 组合 B：Vite + React SPA + FastAPI

推荐级别：P0 可选

| 维度 | 说明 |
| --- | --- |
| 适用场景 | 前端只需要纯 SPA，不需要 Next.js 服务端能力 |
| 前端 | Vite、React、TypeScript、Tailwind |
| 后端 | FastAPI |
| 优点 | 前端构建简单；本地开发快；部署静态资源方便 |
| 缺点 | 路由、数据加载、BFF 能力需要自行组织；后续全栈能力弱于 Next.js |
| 风险 | 如果后续需要 SSR、权限中间层或 BFF，会补较多基础设施 |
| 适合度 | Demo 可用，但长期扩展略弱 |

### 3.3 组合 C：Vue 3 + Vite + FastAPI

推荐级别：P0 可选

| 维度 | 说明 |
| --- | --- |
| 适用场景 | 团队 Vue 经验强，偏管理台/操作台界面 |
| 前端 | Vue 3、Vite、TypeScript、Element Plus 或 Naive UI |
| 后端 | FastAPI |
| 优点 | 管理台组件生态成熟；表单和面板开发效率高；学习曲线友好 |
| 缺点 | Monaco/xterm/复杂 IDE 风格体验通常 React 生态资料更多；招聘和长期生态取决于团队 |
| 风险 | 如果设计更接近 IDE/AI Coding 工作台，React 生态复用度可能更高 |
| 适合度 | 团队 Vue 优先时可选 |

### 3.4 组合 D：SvelteKit + FastAPI

推荐级别：探索型

| 维度 | 说明 |
| --- | --- |
| 适用场景 | 小团队追求轻量前端和高交互效率 |
| 前端 | SvelteKit、TypeScript |
| 后端 | FastAPI |
| 优点 | 前端代码量少；交互响应轻；适合快速 Demo |
| 缺点 | 大型复杂工作台的成熟实践少于 React/Vue；组件生态选择相对少 |
| 风险 | 后续交接和扩员成本可能高 |
| 适合度 | 不建议作为默认方案，适合前端团队熟悉 Svelte 时采用 |

### 3.5 组合 E：Next.js 全栈 + 独立 Python Runner Service

推荐级别：中长期可选

| 维度 | 说明 |
| --- | --- |
| 适用场景 | 前端团队希望用 Next.js 承担 BFF、鉴权、页面和 API 聚合 |
| 前端/BFF | Next.js API Routes 或 Route Handlers |
| Python 服务 | FastAPI 或纯 Python worker，负责 OpenJiuwen、生成、测试、导出 |
| 优点 | 前端体验一体化；BFF 可贴近页面；Python 运行边界更清晰 |
| 缺点 | 服务拆成两套，P0 部署和调试复杂度上升 |
| 风险 | API 契约、鉴权、事件转发需要额外设计 |
| 适合度 | P0 不推荐，P1 平台化可考虑 |

### 3.6 组合 F：Django + Django REST Framework + React/Next.js

推荐级别：后台管理增强型

| 维度 | 说明 |
| --- | --- |
| 适用场景 | 需要强数据库模型、Admin、用户权限、后台运营 |
| 前端 | React/Next.js 或 Django 模板 |
| 后端 | Django、DRF、Channels 可选 |
| 优点 | ORM、Admin、认证、迁移体系完整；适合从 Demo 演进到管理平台 |
| 缺点 | 对本项目的生成事件、运行沙箱、异步任务来说比 FastAPI 更重 |
| 风险 | async/长连接/任务编排边界需要更谨慎；P0 开发速度不一定更快 |
| 适合度 | 如果很快要做管理后台和权限，可选；纯 Demo 不优先 |

### 3.7 组合 G：Django + HTMX + 少量前端组件

推荐级别：低前端复杂度方案

| 维度 | 说明 |
| --- | --- |
| 适用场景 | 团队后端强、前端资源少、只做内部 Demo |
| 前端 | Django Templates、HTMX、少量 Alpine.js/Monaco 嵌入 |
| 后端 | Django |
| 优点 | 单体简单；页面和后端模型结合紧密；后台能力强 |
| 缺点 | 本项目的 AI Coding 工作台交互较复杂，HTMX 可能吃力 |
| 风险 | 源码多 Tab、运行记录流、测试台体验需要较多定制 JS |
| 适合度 | 可做内部原型，不适合追求接近图片中的工作台体验 |

### 3.8 组合 H：NestJS + React/Next.js + Python Worker

推荐级别：OpenCode 深度集成推荐

| 维度 | 说明 |
| --- | --- |
| 适用场景 | OpenCode 是核心代码生成引擎，需要会话、多轮修改、事件聚合和权限管理 |
| 前端 | Next.js / React |
| 后端 API | NestJS |
| OpenCode | OpenCodeEngine 调用 CLI / serve / SDK |
| Python Worker | OpenJiuwen 生成物运行、pytest、导出或辅助校验 |
| 沙箱 | Docker/Podman P0；Docker + gVisor P0+ |
| 优点 | TypeScript 全栈 API 体验好；与 OpenCode/Next.js 集成自然；工程化、模块化、测试体系成熟 |
| 缺点 | OpenJiuwen 和 Python 运行器仍需独立服务，系统变成多语言架构 |
| 风险 | Worker 通信、日志、事件桥接、部署复杂度更高 |
| 适合度 | 若 OpenCode 是核心能力，建议作为 P0+ 主线 |

### 3.8.1 组合 H2：Next.js + NestJS + OpenCode + Python Runner + gVisor

推荐级别：P0+ 首选

| 维度 | 说明 |
| --- | --- |
| 适用场景 | 需要把 OpenCode 深度纳入“代码编程过程”，同时从 P0 起控制沙箱风险 |
| 前端 | Next.js、React、TypeScript、Monaco、xterm.js |
| 编排后端 | NestJS、TypeScript、SSE/WebSocket、任务状态管理 |
| 代码生成 | OpenCodeEngine，优先 `opencode run/serve`，后续可接 SDK |
| Python 运行 | Python Runner Service，在沙箱内执行 OpenJiuwen 生成物和 pytest |
| 沙箱 | Docker + gVisor `runsc`，普通 Docker/Podman 作为开发 fallback |
| 优点 | OpenCode 集成最顺；前后端共享类型；生成事件和会话管理清晰；沙箱债务较低 |
| 缺点 | 比 FastAPI 单体多一个服务边界；需要维护 Node 与 Python 通信协议 |
| 风险 | gVisor 可能有 syscall/文件系统兼容问题，需要保留 Docker fallback |
| 适合度 | 如果产品把 OpenCode 定为核心开源组件，这是最推荐的目标架构 |

### 3.9 组合 I：Go 后端 + React/Next.js + Python Runner

推荐级别：高并发平台化方向

| 维度 | 说明 |
| --- | --- |
| 适用场景 | 后续要做高并发任务调度、资源隔离、服务治理 |
| 前端 | React/Next.js |
| 后端 | Go API 服务 |
| Python Runner | OpenJiuwen 和生成物运行 |
| 优点 | 后端性能和部署稳定；任务调度和资源控制可做得很强 |
| 缺点 | P0 成本明显过高；Python 运行逻辑仍不可避免 |
| 风险 | 多语言边界导致迭代慢；OpenJiuwen API 适配不如 Python 直接 |
| 适合度 | 生产平台阶段可考虑，Demo 不推荐 |

### 3.10 组合 J：Streamlit/Gradio + Python 单体

推荐级别：极简演示方案

| 维度 | 说明 |
| --- | --- |
| 适用场景 | 只想最快演示“输入 prompt -> 生成代码 -> 跑测试” |
| 前端/后端 | Streamlit 或 Gradio 单体 |
| 优点 | 开发最快；全部 Python；便于接 OpenJiuwen |
| 缺点 | 很难复刻 PRD 图片中的工作台、源码树、多 Tab、底部面板体验 |
| 风险 | 后续重构成本高；交互精细度不足 |
| 适合度 | 一天内抛概念可用，不适合作为 v0.3 主线 |

### 3.11 组合 K：Tauri/Electron + 本地 FastAPI

推荐级别：本地桌面 Demo 可选

| 维度 | 说明 |
| --- | --- |
| 适用场景 | 需要完全本地运行、访问本地文件、离线演示 |
| 前端 | Tauri/Electron + React/Vue |
| 后端 | 本地 FastAPI 子进程 |
| 优点 | 本地文件和运行器控制强；演示环境稳定；可打包成桌面应用 |
| 缺点 | 桌面打包、更新、跨平台兼容增加成本 |
| 风险 | P0 会偏离 Web Demo，前后端调试链路更复杂 |
| 适合度 | 若交付场景必须离线演示，可选 |

## 4. 架构总览

### 4.1 逻辑架构

```text
[Browser]
  |-- Home
  |-- Generation Workspace
  |-- Agent Test Panel
  |-- Workflow Run Panel
  |-- Source Viewer
        |
        | REST + SSE/WebSocket
        v
[API/BFF Backend: FastAPI P0 or NestJS P0+]
  |-- Generation Service
  |-- Spec Parser
  |-- Spec Validator
  |-- Project Generator
  |-- CodeGenerationEngine
  |   |-- TemplateEngine
  |   |-- OpenCodeEngine
  |   `-- MockEngine
  |-- Sandbox Service
  |-- Run Service / Python Runner Client
  |-- Export Service
  |-- Event Service
  |-- Version Service
  |-- OpenJiuwen Adapter
        |
        | sandbox/job/sdk boundary
        v
[Sandbox Runtime]
  |-- opencode run/serve
  |-- python src/main.py
  |-- python -m pytest
  |-- generated projects
  |-- mock model runtime
  |-- OpenJiuwen SDK runtime
```

### 4.2 P0 部署架构

```text
local/dev machine
├── frontend: Next.js dev/build
├── backend: FastAPI app or NestJS app
├── sqlite: metadata.db
├── sandbox runtime: Docker/Podman, P0+ gVisor runsc
└── workspace/
    ├── generated/
    ├── exports/
    └── logs/
```

P0 可以单机部署。后续 P1 再拆分为：

1. API 服务。
2. Worker 服务。
3. PostgreSQL。
4. 对象存储。
5. 独立沙箱/容器运行池。

## 5. 后端模块设计

### 5.1 模块职责

| 模块 | 职责 | P0 实现 |
| --- | --- | --- |
| `generation_service` | 生成任务生命周期编排 | Python 或 TypeScript service class |
| `spec_parser` | prompt -> Agent/Workflow Spec | LLM 调用 + 规则 fallback + mock |
| `spec_validator` | 校验 Spec 必填项和 Workflow 图合法性 | Pydantic model + custom validators |
| `project_generator` | 创建项目目录、调模板、写文件 | 文件系统写入 |
| `code_generation_engine` | 在 Template/OpenCode/Mock 之间选择生成策略 | 可插拔接口 |
| `opencode_engine` | 调用 `opencode run`、`opencode serve` 或 SDK | 沙箱内执行 |
| `template_renderer` | 渲染 Python、README、测试、配置 | Jinja2 或 Python 模板 |
| `sandbox_service` | 创建一次性沙箱、挂载 workspace、限制网络/资源 | Docker/Podman/gVisor |
| `run_service` | 执行 smoke test、示例运行、测试台运行 | 通过 sandbox service 调度 |
| `python_runner_service` | 执行 OpenJiuwen 生成物、pytest 和导出校验 | Python worker 或沙箱内 runner |
| `event_service` | 记录并推送生成事件 | SQLite + SSE |
| `version_service` | 记录版本摘要、文件数量、测试结果 | SQLite |
| `export_service` | 打包 zip，过滤密钥与缓存 | zipfile |
| `openjiuwen_adapter` | 封装 OpenJiuwen SDK 和 mock runtime | 统一接口 |

### 5.2 Generation Service 编排

```text
create_generation(prompt, type)
  -> create metadata(status=pending)
  -> emit plan_created
  -> parse_spec()
  -> validate_spec()
  -> select CodeGenerationEngine
  -> run TemplateEngine or OpenCodeEngine in sandbox
  -> run_smoke_test in sandbox
  -> create_version()
  -> mark completed or failed
```

约束：

1. 任一失败步骤必须写入 `error` 事件。
2. 失败任务不得覆盖上一成功版本。
3. 生成中的文件必须写入任务专属目录。
4. 后端返回给前端的路径只允许是项目相对路径。

### 5.3 Spec Parser

输入：

```yaml
generation_type: agent | workflow
prompt: string
mode: auto
model: string | null
```

输出：

```yaml
agent_spec: object | null
workflow_spec: object | null
parse_warnings:
  - string
```

P0 策略：

1. 内置两个演示 prompt 的 deterministic parser，确保 Demo 稳定。
2. 其他 prompt 可走 LLM parser。
3. LLM parser 输出必须经过 schema validation。
4. validation 失败时允许一次自修复，再失败则进入 `PROMPT_PARSE_FAILED`。

### 5.4 Project Generator

Agent 输出目录：

```text
workspace/generated/{generation_id}/{version_id}/
├── pyproject.toml
├── README.md
├── .env.example
├── config/
├── src/
├── examples/
└── tests/
```

Workflow 输出目录：

```text
workspace/generated/{generation_id}/{version_id}/
├── pyproject.toml
├── README.md
├── .env.example
├── workflow.yaml
├── src/
├── examples/
└── tests/
```

生成规则：

1. 所有文件写入前先生成 planned file list。
2. 每写入一个文件发出 `file_created` 或 `file_updated` 事件。
3. 模板只能消费 Spec，不直接拼接原始 prompt。
4. `.env`、`.venv`、`__pycache__` 不允许进入导出包。

### 5.5 CodeGenerationEngine

`CodeGenerationEngine` 负责把 Spec 转换为项目文件。它是架构上的扩展点。

```text
generate(spec, generation_context)
  -> planned_files
  -> file_changes
  -> run_hints
  -> warnings
```

实现：

| 实现 | 用途 |
| --- | --- |
| `TemplateEngine` | 确定性模板生成，保证 Demo 稳定 fallback |
| `OpenCodeEngine` | 调用 OpenCode 生成或修改代码 |
| `MockEngine` | 无模型/无 OpenCode 环境下跑通端到端 UI |

OpenCodeEngine 集成方式：

1. P0：在沙箱中执行 `opencode run` 或连接任务级 `opencode serve`。
2. P0+：由 NestJS/Node 编排服务通过 OpenCode SDK 或 Server API 管理 session。
3. 所有 OpenCode 写文件动作必须限制在当前 `workspace/generated/{generation_id}/{version_id}`。
4. OpenCode 生成后仍必须进入 smoke test，不允许只信任生成摘要。

### 5.6 Sandbox Service

Sandbox Service 负责创建、运行和销毁任务级沙箱。

输入：

```yaml
generation_id: string
version_id: string
workspace_path: string
command: string[]
env_allowlist: object
network_policy: none | openjiuwen_only | controlled
resource_limits:
  cpus: number
  memory: string
  pids: integer
timeout_seconds: integer
```

P0 推荐实现：

1. 开发 fallback：Docker 或 rootless Podman。
2. 目标实现：Docker + gVisor `runsc`。
3. 每个 generation/version 启动一次性容器，任务结束即删除。
4. 只挂载当前任务 workspace。
5. 默认 `--network none`，需要模型服务时切换到受控网络。

### 5.7 Run Service

P0 运行方式：

```text
sandbox_service.run(
  image="agent-builder-sandbox:latest",
  workspace=project_dir,
  command=["python", "-m", "pytest", "tests/test_agent_smoke.py"],
  timeout_seconds=120,
  network_policy="none",
)
```

运行约束：

1. `cwd` 必须在 `workspace/generated/{generation_id}/{version_id}` 内。
2. 命令白名单：`python -m pytest`、`python src/main.py` 或技术设计确认后的等效命令。
3. 超时后必须 kill 子进程。
4. stdout/stderr 写入运行记录，前端只展示摘要和可展开详情。
5. 真实模型不可用时使用 mock runtime，并在事件中标记 `mock=true`。
6. 主服务不直接执行用户生成代码，只调度 sandbox job。

## 6. OpenJiuwen 适配层

### 6.1 适配目标

OpenJiuwen 真实 API 需要先盘点。架构层只规定内部稳定接口：

```python
class AgentAdapter:
    def create_agent(self, spec: AgentSpec) -> AgentHandle: ...
    def run(self, handle: AgentHandle, message: str, context: RunContext) -> RunResult: ...

class WorkflowAdapter:
    def create_workflow(self, spec: WorkflowSpec) -> WorkflowHandle: ...
    def run(self, handle: WorkflowHandle, inputs: dict, context: RunContext) -> WorkflowRunResult: ...

class ToolAdapter:
    def register_tools(self, tools: list[ToolSpec]) -> list[ToolHandle]: ...

class ModelAdapter:
    def load_model_config(self, config_path: str) -> ModelConfig: ...
```

### 6.2 适配层事件

OpenJiuwen、OpenCode、sandbox 或 mock runtime 事件统一转换为：

```yaml
event_id: string
generation_id: string
run_id: string | null
type: thought | opencode_started | opencode_file_changed | opencode_finished | sandbox_started | sandbox_finished | tool_started | tool_finished | node_started | node_finished | output | error
message: string
payload: object
created_at: datetime
```

### 6.3 API 盘点前不得固化的内容

1. Agent 类型真实名称。
2. Workflow/Component 类名。
3. Runner 调用方式。
4. Tool schema 注册方式。
5. 流式输出和日志 hook。
6. 模型配置字段。

## 7. 数据模型

### 7.1 Generation

```yaml
id: string
type: agent | workflow
title: string
user_prompt: string
status: pending | planning | generating | testing | completed | failed
selected_model: string
mode: auto
active_version_id: string | null
project_root: string | null
error_code: string | null
error_message: string | null
created_at: datetime
updated_at: datetime
```

### 7.2 GenerationEvent

```yaml
id: string
generation_id: string
run_id: string | null
type: string
message: string
payload_json: object
sequence: integer
created_at: datetime
```

### 7.3 ProjectVersion

```yaml
id: string
generation_id: string
version_label: string
summary: string
project_path: string
file_count: integer
test_status: passed | failed | skipped
mock_mode: boolean
created_at: datetime
```

### 7.4 RunRecord

```yaml
id: string
generation_id: string
version_id: string
run_type: smoke_test | agent_chat | workflow_run
status: pending | running | success | failed | timeout
input_json: object
output_json: object | null
stdout_path: string | null
stderr_path: string | null
duration_ms: integer | null
created_at: datetime
updated_at: datetime
```

### 7.5 SandboxJob

```yaml
id: string
generation_id: string
version_id: string
job_type: opencode_generation | smoke_test | agent_run | workflow_run | export_check
runtime: docker | podman | gvisor | e2b
image: string
command: string[]
network_policy: none | openjiuwen_only | controlled
cpus: number
memory: string
pids_limit: integer
status: pending | running | success | failed | timeout | killed
started_at: datetime | null
finished_at: datetime | null
exit_code: integer | null
stdout_path: string | null
stderr_path: string | null
```

## 8. API 设计

### 8.1 创建生成任务

```http
POST /api/generations
```

请求：

```json
{
  "type": "agent",
  "prompt": "一个塔罗牌占卜 Agent。首先询问用户想要占卜的问题，之后抽取塔罗牌并解读。",
  "mode": "auto",
  "model": "default"
}
```

响应：

```json
{
  "generation_id": "gen_123",
  "status": "planning"
}
```

### 8.2 获取生成任务

```http
GET /api/generations/{generation_id}
```

### 8.3 订阅生成事件

```http
GET /api/generations/{generation_id}/events
```

P0 推荐 SSE：

```text
event: file_created
data: {"event_id":"evt_1","message":"创建文件 src/agents/agent.py"}
```

选择 SSE 的原因：

1. 生成过程主要是服务端单向推送。
2. 浏览器原生支持 `EventSource`。
3. 比 WebSocket 更容易实现断线重连和日志回放。

需要双向实时交互时再引入 WebSocket。

### 8.4 文件树与文件内容

```http
GET /api/generations/{generation_id}/files
GET /api/generations/{generation_id}/files/content?path=src/agents/agent.py
```

安全规则：

1. `path` 必须是相对路径。
2. 不允许 `..`。
3. 后端必须 resolve 后确认仍在项目目录内。

### 8.5 Agent 测试

```http
POST /api/generations/{generation_id}/agent/runs
```

### 8.6 Workflow 运行

```http
POST /api/generations/{generation_id}/workflow/runs
```

### 8.7 导出代码

```http
POST /api/generations/{generation_id}/exports
GET /api/exports/{export_id}/download
```

## 9. 前端架构

### 9.1 页面结构

```text
app/
├── page.tsx                         # 首页
├── generations/[id]/page.tsx         # 生成工作台
├── generations/[id]/source/page.tsx  # 源码查看
└── generations/[id]/runs/page.tsx    # 运行记录
```

### 9.2 组件结构

```text
components/
├── prompt/PromptComposer.tsx
├── workspace/GenerationTimeline.tsx
├── workspace/EventItem.tsx
├── workspace/CompletionSummary.tsx
├── agent/AgentTestPanel.tsx
├── workflow/WorkflowRunPanel.tsx
├── source/FileTree.tsx
├── source/CodeViewer.tsx
├── bottom/TerminalPanel.tsx
├── bottom/RunLogPanel.tsx
└── bottom/OutputPanel.tsx
```

### 9.3 前端状态

| 状态 | 来源 | 用途 |
| --- | --- | --- |
| `generation` | REST | 标题、状态、当前版本 |
| `events` | SSE | 左侧时间线、底部运行记录 |
| `fileTree` | REST | 源码页文件树 |
| `openFiles` | client state | 文件 Tab |
| `runRecords` | REST/SSE | Agent/Workflow 运行记录 |

### 9.4 前端关键交互

1. 首页提交后立即跳转 `/generations/{id}`。
2. 工作台连接 SSE 并展示事件。
3. `completed` 后右侧默认显示 Agent 测试台或 Workflow 运行页。
4. 用户点击“查看源码”进入源码视图。
5. 源码视图从文件树选择文件，右侧只读展示。

## 10. 文件存储设计

```text
workspace/
├── metadata.db
├── generated/
│   └── {generation_id}/
│       └── {version_id}/
│           ├── pyproject.toml
│           ├── README.md
│           ├── .env.example
│           ├── src/
│           ├── examples/
│           └── tests/
├── runs/
│   └── {run_id}/
│       ├── stdout.log
│       └── stderr.log
├── exports/
│   └── {export_id}.zip
└── logs/
```

导出过滤：

1. `.env`
2. `.venv/`
3. `__pycache__/`
4. `.pytest_cache/`
5. `*.pyc`
6. 运行日志中可能包含密钥的原始文件

## 11. 任务生命周期

```text
pending
  -> planning
  -> generating
  -> testing
  -> completed

任何状态
  -> failed
```

状态说明：

| 状态 | 含义 | 可见 UI |
| --- | --- | --- |
| `pending` | 任务刚创建 | 加载中 |
| `planning` | 解析需求并制定计划 | 计划事件 |
| `generating` | 写入项目文件 | 文件事件、命令事件 |
| `testing` | 运行 smoke test | 测试事件、底部输出 |
| `completed` | 生成成功 | 完成摘要、测试台、源码 |
| `failed` | 生成失败 | 错误摘要、重新生成入口 |

## 12. 安全与沙箱

P0 必须使用容器沙箱运行以下对象：

1. `opencode run` / `opencode serve`。
2. `python src/main.py`。
3. `python -m pytest`。
4. 生成出的 Agent/Workflow 代码。
5. OpenJiuwen mock 或真实 runtime。

P0 沙箱选型：

| 方案 | 使用阶段 | 说明 |
| --- | --- | --- |
| Docker + hardened flags | P0 fallback | 最快落地，适合本地开发和内部演示 |
| Rootless Podman | P0 fallback | rootless/daemonless，更适合本地安全边界 |
| Docker + gVisor `runsc` | P0+ target | 更强隔离，适合 OpenCode 核心执行场景 |
| Docker Sandboxes | 可选验证 | 面向 AI coding agent，有 OpenCode 使用路径 |
| E2B | 可选验证 | 云端托管 sandbox，适合快速外部验证 |
| Firecracker/Kata | P1 | microVM 隔离强，但 P0 集成成本高 |

P0 hardened Docker 参数基线：

```bash
docker run --rm \
  --network none \
  --cpus 1 \
  --memory 1g \
  --pids-limit 256 \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,size=256m \
  -v "$WORKSPACE:/workspace:rw" \
  -w /workspace \
  agent-builder-sandbox:latest \
  <command>
```

安全边界：

1. 每个任务一个独立 workspace 和一次性 sandbox job。
2. 用户 prompt 不得直接拼 shell 命令。
3. 文件路径必须规范化并限制在任务目录。
4. 命令必须来自 allowlist。
5. 子进程和容器必须设置超时。
6. 容器环境变量使用 allowlist，密钥只临时注入。
7. 默认关闭网络；需要真实模型服务时只放行 OpenJiuwen/model endpoint。
8. 导出前过滤 `.env`、日志、缓存、`.venv`、`.pytest_cache`、`__pycache__`。
9. 运行日志前端展示默认截断并脱敏，保留下载或展开能力。
10. 不挂载宿主 Docker socket。
11. 不使用 privileged 容器。
12. OpenCode 只允许访问当前 workspace。

P1 加强：

1. 沙箱池和资源配额调度。
2. 网络 allowlist 网关。
3. Docker + gVisor 默认化，或迁移 Firecracker/Kata。
4. 审计日志和安全事件告警。
5. 镜像签名、SBOM 和基础镜像漏洞扫描。

## 13. 测试策略

### 13.1 后端单元测试

1. Spec parser deterministic 示例。
2. Agent Spec/Workflow Spec 校验。
3. 模板渲染。
4. 文件路径安全。
5. 导出过滤。
6. OpenJiuwen adapter mock。

### 13.2 生成物 smoke test

1. 塔罗占卜 Agent：确认工具被调用，输出包含抽牌结果和解读。
2. 售前 Workflow：确认节点按顺序执行，最终输出 Markdown 报告。

### 13.3 前端 E2E

1. 首页输入 prompt 并进入工作台。
2. 事件时间线出现计划、文件、测试事件。
3. 完成后进入 Agent 测试台。
4. 源码页能打开 `src/agents/agent.py` 或 `src/workflows/workflow.py`。
5. 导出按钮返回 zip 下载链接。

## 14. OpenJiuwen API 盘点要求

详细技术设计必须新增：

```text
docs/technical/openjiuwen_api_inventory.md
```

必须回答：

1. OpenJiuwen Agent 创建 API 是什么。
2. Tool 注册 API 是什么。
3. Workflow/Component/Runner API 是什么。
4. 模型配置字段有哪些。
5. 是否支持流式事件或运行 hook。
6. 本地最小可运行示例。
7. mock runtime 与真实 runtime 的切换方式。

若盘点结果与本文档中的占位名称冲突，以盘点结果为准，本文档只保留模块边界和数据流。

## 15. 技术选型结论

### 15.1 默认推荐

Demo v0.3 若 OpenCode 只是辅助生成，建议采用：

```text
Next.js + React + TypeScript
FastAPI + Pydantic + SQLite + 本地文件系统
OpenCode CLI/serve + TemplateEngine fallback
Docker/Podman sandbox
SSE + Monaco Editor + xterm.js
pytest + mock OpenJiuwen runtime
```

若 OpenCode 是核心代码生成能力，建议采用：

```text
Next.js + React + TypeScript
NestJS + TypeScript + SQLite/PostgreSQL
OpenCodeEngine + Python Runner Service
Docker + gVisor runsc sandbox
SSE/WebSocket + Monaco Editor + xterm.js
pytest + mock/real OpenJiuwen runtime
```

### 15.2 为什么不是纯 Node 后端

本项目最终生成和验证的是 Python/OpenJiuwen 工程。即使采用 NestJS 作为编排后端，仍需要 Python Runner 执行 pytest、示例运行、OpenJiuwen SDK 适配和导出校验。Node 适合编排 OpenCode，不适合替代 Python 运行层。

### 15.3 为什么不继续只用 FastAPI

如果 OpenCode 只通过 CLI 或 HTTP server 调用，FastAPI 足够。但如果要管理 OpenCode session、多轮代码修改、事件聚合、权限和前端 BFF，NestJS/Node 与 OpenCode/Next.js 的集成更自然。

### 15.4 为什么不是 Django 优先

Django 适合快速构建带 ORM、Admin、权限的后台系统。但本项目 P0 的核心复杂度在生成事件、代码运行、OpenJiuwen 适配和工作台交互，FastAPI 更轻、更贴近 API/任务编排。

### 15.5 为什么不是 Streamlit/Gradio

Streamlit/Gradio 可以快速展示 AI demo，但难以满足 PRD 中的文件树、代码查看、多面板运行记录、版本摘要、导出包等工作台体验。

### 15.6 沙箱结论

P0 不再把沙箱视为后续增强，而是默认设计项：

1. 内部 Demo 可使用 Docker/Podman hardened container。
2. OpenCode 深度集成或对外演示建议升级到 Docker + gVisor。
3. 生产多租户再评估 Firecracker/Kata 或托管 sandbox 平台。

## 16. 参考资料

1. FastAPI 官方文档：https://fastapi.tiangolo.com/
2. Next.js 官方文档：https://nextjs.org/docs
3. Django 官方文档：https://docs.djangoproject.com/en/5.2/
4. Docker resource constraints：https://docs.docker.com/engine/containers/resource_constraints/
5. Podman run options：https://docs.podman.io/en/latest/markdown/podman-run.1.html
6. gVisor 文档：https://gvisor.dev/docs/
7. Docker Sandboxes OpenCode guide：https://docs.docker.com/ai/sandboxes/agents/opencode/
8. E2B 文档：https://e2b.dev/docs
