# Agent Builder P1 执行计划：真实 LLM Parser + OpenCode 生成 + 页面模拟

版本：v1.0（已完成）  
面向对象：负责继续推进 Agent Builder 的编程 Agent  
当前基线：P1 全部完成。Docker Compose 一键启动，opencode v1.17.18 沙箱，190 tests 全绿。

## 1. 背景与当前问题

当前 `SpecParserService` 只支持两个内置示例：

1. 包含“塔罗”的 Agent prompt。
2. 包含“需求 / 方案 / Demo / 报告”的 Workflow prompt。

其他 prompt 会返回：

```text
PROMPT_PARSE_FAILED:
P0 deterministic parser 暂仅支持「塔罗占卜 Agent」示例；其他需求将在 LLM parser 接入后支持。
```

这说明 P0 的 Demo 稳定性已经达成，但产品能力还停留在“固定样例生成”。下一阶段必须把链路改为：

```text
用户自然语言 prompt
  -> LLM Spec Parser
  -> Spec Validator
  -> OpenCodeEngine
  -> 沙箱 smoke test
  -> 页面测试台模拟运行
```

deterministic parser 仍需保留为稳定 fallback，不能删除。

## 2. 总目标

下一阶段必须完成四件事：

1. 解决非示例 prompt 的 `PROMPT_PARSE_FAILED`，使用真实 LLM 生成 AgentSpec / WorkflowSpec。
2. 启动真实 OpenCode 参与代码编写，而不是只发 mock `opencode_*` 事件。
3. 保持自动测试闭环：parser、validator、OpenCode、sandbox、API、E2E 全部可验证。
4. 页面可以对生成后的 Agent / Workflow 做模拟运行，并展示可理解的结果。

P1 的产品定位是从“P0 Demo 可跑通”推进到“真实用户可以试用的 Beta”。P1 不追求完整平台化，不做计费、多租户、插件市场、K8s sandbox pool 或在线 IDE 级编辑器；P1 优先补齐真实生成、可控修改、可观测、可恢复。

### 2.1 P1 特性优先级

| 特性 | 优先级 | 价值 | 是否进入 P1 |
| --- | --- | --- | --- |
| LLM Spec Parser + Spec 持久化 | P1 必做 | 解决非示例 prompt 无法生成的问题 | 是 |
| 真实 OpenCode 执行 | P1 必做 | 让系统真正具备代码编写能力 | 是 |
| 通用 Agent / Workflow 模拟运行 | P1 必做 | 页面不再写死塔罗和售前两个 Demo | 是 |
| Spec 预览与确认页 | P1 强烈建议 | LLM 解析后先让用户确认，避免错误需求直接生成代码 | 是 |
| 生成失败后的修复 / 重试 | P1 强烈建议 | OpenCode 或测试失败后自动带错误日志重新生成 | 是 |
| 版本管理与 Diff | P1 强烈建议 | 每次生成 / 修复形成版本，可比较、回滚、导出 | 是 |
| 运行日志查看页 | P1 强烈建议 | 展示 parser、OpenCode、sandbox、pytest 的关键日志 | 是 |
| 模型配置中心 | P1 建议 | 支持 OpenAI / OpenJiuwen / mock provider 切换 | 是 |
| Secret 管理 | P1 建议 | API Key 不进日志、不进导出包、不暴露给前端 | 是 |
| 沙箱运行模式配置 | P1 建议 | mock / Docker / gVisor 可切换，页面显示当前隔离等级 | 是 |
| Prompt 模板库 | P1 建议 | 提供常见 Agent / Workflow 起点，提升试用成功率 | 是 |
| 生成质量检查 | P1 建议 | 自动检查结构、测试、导出安全、README 完整性 | 是 |
| 任务历史页 | P1 可选 | 查看过去生成记录、状态、版本和导出包 | 是，轻量实现 |
| GitHub 导出 / 推送 | P1 可选 | 生成后直接创建 branch 或 PR | 可选开关 |
| 基础项目空间 | P1 可选 | 支持按 project 隔离任务，为 P2 多用户做准备 | 可选 |

### 2.2 P1 分段路线

| 阶段 | 目标 | 必须交付 |
| --- | --- | --- |
| P1.0 | 解除核心阻塞 | LLM Spec Parser、Spec 持久化、hybrid parser、非示例 Agent / Workflow 可生成 |
| P1.1 | 真实代码生成闭环 | 真实 OpenCode、沙箱执行、失败修复 / 重试、版本 Diff、通用页面模拟运行 |
| P1.2 | Beta 体验增强 | Spec 预览确认、模型配置中心、日志查看页、Prompt 模板库、任务历史、可选 GitHub 导出 |

P1 最值得优先加的 5 个体验能力：

1. Spec 预览与确认页。
2. 失败后自动修复 / 重试。
3. 版本管理与 Diff。
4. 通用模拟运行。
5. 运行日志查看页。

### 2.3 开工前必须前置解决的设计问题

以下问题会直接卡住 P1 实施，不能留到后续阶段再补：

| 编号 | 问题 | 决策 |
| --- | --- | --- |
| A | 真实 LLM parse 可能耗时 5-45 秒，不能阻塞 `POST /api/generations` | Phase 9 即引入异步 parse 或 draft/confirm；HTTP 请求必须快速返回，失败通过状态和 SSE 暴露 |
| B | 真实 OpenCode 需要模型配置和联网，当前 sandbox 默认 `network=none` | Phase 10 必须定义 OpenCode provider/model/key 注入方式，并为 OpenCode job 使用受控网络策略 |
| C | OpenCode 输出非确定，可能缺少 P0 固定 smoke test 文件 | Phase 10/11 必须定义生成物 contract、生成后 lint、有限 repair retry 和超限策略 |
| D | P0 mock runtime 是塔罗/售前专用 | Phase 12 必须重写通用 mock runtime，并用非塔罗 Agent / 非售前 Workflow 测试约束 |
| H | export filter 未覆盖 `.opencode/`、`.agent_builder/`、`opencode.json` | 第一切片必须补齐导出过滤，防止 project 级配置泄漏 |

第一切片不得只做 mock LLM parser。它必须同时包含 A 和 H；如果包含非示例页面模拟 E2E，则必须同时包含 D。

## 3. 关键原则

### 3.1 TDD 强制要求

每个阶段必须按以下顺序执行：

```text
先写失败测试
  -> 确认失败原因正确
  -> 编写最小实现
  -> 跑通单测 / 集成测试
  -> 跑通 E2E
  -> 再进入下一阶段
```

禁止直接改主链路后手工点页面验证。

### 3.2 稳定 fallback

新增真实 LLM / OpenCode 后，必须保留以下 fallback：

1. 标准塔罗 Agent prompt 仍可走 deterministic spec。
2. 标准售前 Workflow prompt 仍可走 deterministic spec。
3. LLM 不可用时，非示例 prompt 返回清晰错误，不允许生成半成品工程。
4. OpenCode 不可用时，可按配置回退 TemplateEngine，但页面和事件必须明确显示 fallback。

### 3.3 安全边界

1. LLM 输出必须只作为 JSON Spec 输入，不允许直接拼接进代码。
2. LLM 输出必须经过 `SpecValidatorService`。
3. OpenCode 写文件必须限制在当前 `workspace/generated/{generation_id}/{version_id}`。
4. OpenCode、pytest、python runner 仍必须通过 `SandboxService` 调度。
5. 日志和导出包不得泄漏 `OPENAI_API_KEY`、`OPENJIUWEN_API_KEY`、GitHub token 或其他 secret。

## 4. 推荐配置项

新增以下环境变量：

```text
SPEC_PARSER_MODE=deterministic|llm|hybrid
SPEC_LLM_PROVIDER=mock|openai-compatible
SPEC_LLM_MODEL=gpt-4.1-mini
SPEC_LLM_BASE_URL=
SPEC_LLM_API_KEY=
SPEC_LLM_TIMEOUT_SECONDS=45
SPEC_LLM_MAX_RETRIES=2

CODEGEN_ENGINE=template|opencode|mock
OPENCODE_REQUIRE_REAL=false|true
OPENCODE_PROVIDER=deepseek
OPENCODE_MODEL=deepseek-chat
OPENCODE_BASE_URL=https://api.deepseek.com/v1
OPENCODE_API_KEY=sk-...
OPENCODE_CLI_STYLE=v1|v0  ← v1 = host opencode, v0 = GitHub Release binary
OPENCODE_NETWORK_POLICY=controlled|openjiuwen_only|none
OPENCODE_TIMEOUT_SECONDS=180
OPENCODE_MAX_RETRIES=2
OPENCODE_ALLOW_FALLBACK=true

FEATURE_SPEC_CONFIRMATION=true
FEATURE_REPAIR_RETRY=true
FEATURE_VERSION_DIFF=true
FEATURE_RUN_LOG_VIEWER=true
FEATURE_PROMPT_TEMPLATES=true
FEATURE_GITHUB_EXPORT=false
```

推荐默认：

```text
SPEC_PARSER_MODE=hybrid
CODEGEN_ENGINE=opencode
OPENCODE_REQUIRE_REAL=false
```

含义：

1. 两个标准 Demo 仍走 deterministic，保证验收稳定。
2. 非标准 prompt 走真实 LLM。
3. OpenCode 可用时走真实 OpenCode，不可用时走明确 fallback。
4. P1 Beta 体验能力以 feature flag 方式接入，便于逐项验收和回滚。

命名说明：

1. `SPEC_LLM_PROVIDER=openai-compatible` 表示走 OpenAI 兼容 Chat Completions 接口；OpenJiuwen 如提供兼容接口，应通过 `SPEC_LLM_BASE_URL` 配置，不要把 Agent 框架名和 LLM provider 概念混在一起。
2. `OPENCODE_CONFIG_MODE=project_config` 只能写入不含 secret 的 project 级配置；任何带 key 的配置文件不得进入 workspace 导出包。
3. `OPENCODE_NETWORK_POLICY=none` 只允许 mock / 离线测试；真实 OpenCode 必须使用 `controlled` 或 `openjiuwen_only`。

## 5. 阶段计划

### Phase 9：异步 LLM Spec Parser + Spec 持久化

目标：非示例 prompt 可以被解析为合法 AgentSpec / WorkflowSpec，且真实 LLM 调用不得阻塞 `POST /api/generations`。

先写测试：

1. `SpecParserService` 对非塔罗 Agent prompt 不再直接抛 `PROMPT_PARSE_FAILED`。
2. mock LLM 返回 AgentSpec JSON 时，parser 返回合法 AgentSpec。
3. mock LLM 返回 WorkflowSpec JSON 时，parser 返回合法 WorkflowSpec。
4. LLM 返回非 JSON、缺字段、类型错误时，返回 `PROMPT_PARSE_FAILED` 或 `SPEC_VALIDATION_FAILED`。
5. deterministic 两个标准 prompt 行为不变。
6. `POST /api/generations` 在 mock slow parser 延迟 5 秒时仍能快速返回 `generation_id`。
7. parse 失败时，generation 进入 `failed`，SSE 出现 `error` 事件，HTTP 创建请求不等待 LLM 完成。
8. LLM 输出包在 markdown fence 中时，JSON 提取仍能稳定工作。
9. 持久化后的 Spec 被读取时不会再次调用 LLM。

实现任务：

1. 新增 `LlmSpecParser` 接口：

```ts
interface LlmSpecParser {
  parse(prompt: string, type: GenerationType, model?: string): Promise<AgentSpec | WorkflowSpec>;
}
```

2. 一次性将 parser 主接口改为 async，不保留同步 `parse` / 异步 `parseAsync` 双入口，避免调用方不一致。
3. 新增 provider：
   - `DeterministicSpecParser`
   - `OpenAiCompatibleSpecParser` 或通用 `HttpJsonSpecParser`
   - `MockLlmSpecParser`
4. 设计 LLM prompt，要求模型只输出 JSON，不输出 Markdown。
5. 对 LLM 输出做 JSON 提取、schema validation、错误归一化。
6. 更新 `GenerationService.createGeneration` 与 `getSpec`，避免重复调用 LLM 产生不一致结果。
7. 将 LLM parse 从同步 HTTP 创建路径移入异步 pipeline：

```text
POST /api/generations
  -> insert generation(pending)
  -> emit plan_created
  -> return generation_id immediately
  -> async pipeline: planning -> parse -> persist spec -> generating
```

8. 同时预留 draft/confirm 数据结构，Phase 15 只做 UI 和交互增强，不再补底层 parse 架构：

```text
generation_specs
  id
  generation_id
  draft_id nullable
  spec_json
  parser_mode
  provider
  model
  prompt_hash
  validation_status
  created_at
```

注意事项：

1. 当前 `getSpec(id)` 会重新 parse `user_prompt`，真实 LLM 接入后这是风险点。必须把解析后的 Spec 持久化或缓存到 generation / version / event payload 中。
2. 建议新增 `generation_specs` 表，字段包含 `generation_id`、`spec_json`、`parser_mode`、`model`、`created_at`。
3. 不要只把 Spec 存在 event payload；event 适合审计，不适合作为主数据读取来源。
4. 只有 schema validation 通过的 Spec 才能进入 codegen。
5. 非示例 prompt 的失败文案不得继续显示“P0 deterministic parser 暂仅支持...”。
6. 纯对话 Agent 是否允许 0 tools 必须在本阶段定稿：若允许，应把 AgentSpec `tools` 改为可空数组；若不允许，LLM prompt 必须强制生成至少一个工具，并解释原因。

阶段检查点：

1. `npm run test:api` 通过。
2. 非示例 Agent prompt 可进入 generation pipeline。
3. 非示例 Workflow prompt 可进入 generation pipeline。
4. LLM 失败时页面显示明确错误，不再出现 P0 示例限制文案。
5. HTTP 创建请求不因真实 LLM 调用阻塞。

### Phase 10：真实 OpenCodeEngine

目标：OpenCode 真实执行代码编写，并通过事件流展示。

先写测试：

1. `OpenCodeEngine` 在 real mode 下会构造安全的 `opencode run` 命令。
2. OpenCode prompt 写入 `.agent_builder/prompt.md`，内容来自已验证 Spec。
3. OpenCode 只能在 project workspace 内写文件。
4. OpenCode stdout/stderr 中的 secret 会被脱敏。
5. OpenCode 超时会终止任务并返回失败事件。
6. OpenCode 不可用时按配置 fallback 或失败。
7. OpenCode real job 使用 `NetworkPolicy.Controlled` 或 `NetworkPolicy.OpenjiuwenOnly`，不得使用默认 `none`。
8. OpenCode provider/model/key 通过 allowlisted env 或只读 mounted config 注入；带 key 的配置不得写入可导出目录。
9. stub `opencode` 在 mock sandbox 中可覆盖 real command、事件映射和文件扫描路径。
10. 生成物 lint 能拒绝 `import langgraph`、`import crewai`、`import dify` 等非 OpenJiuwen 框架。

实现任务：

1. 修改 `OpenCodeEngine.generate`，真实模式下通过 `SandboxService.run` 执行：

```text
opencode run --format json .agent_builder/prompt.md
```

2. 将 `SandboxService` 注入 OpenCodeEngine，避免 OpenCodeEngine 直接 `spawn` 主机进程。
3. 标准化 OpenCode 事件映射：
   - `opencode_started`
   - `opencode_file_changed`
   - `command_started`
   - `command_finished`
   - `opencode_finished`
   - `error`
4. 生成完成后扫描 project tree，构造 `GenerationResult.files`。
5. 如果 OpenCode 输出结构化 JSON，解析并映射；如果没有结构化 JSON，以文件系统扫描为准。
6. 保留 TemplateEngine fallback，配置项控制 fallback 策略。
7. 明确 OpenCode 配置注入方式，按优先级选择：
   - `env`：通过 sandbox env allowlist 注入 `OPENCODE_*` / provider key，日志必须脱敏。
   - `mounted_user_config`：只读挂载用户级 OpenCode config，不复制进 workspace。
   - `project_config`：只写不含 secret 的 project config；key 仍通过 env 注入。
8. OpenCode job 的 `networkPolicy` 必须来自 `OPENCODE_NETWORK_POLICY`，真实模式禁止 `none`。
9. 新增 `OPENCODE_MAX_RETRIES`，用于 OpenCode 失败或 smoke test 失败后的有限修复循环。
10. 新增生成物 contract：
    - Agent 必须包含 `config/agent_spec.json`、`src/agents/agent.py`、`tests/test_agent_smoke.py`。
    - Workflow 必须包含 `config/workflow_spec.json`、`src/workflows/workflow.py`、`tests/test_workflow_smoke.py`。
    - README、`.env.example`、pyproject 必须存在。

注意事项：

1. 不要让 OpenCode 选择 LangGraph / CrewAI / Dify；prompt 必须明确只能生成 OpenJiuwen adapter 风格工程。
2. 不要让 OpenCode 读取仓库根目录；只挂载当前 project workspace。
3. 不要把用户原始 prompt 直接交给 OpenCode；应交给 OpenCode 已验证 Spec + 生成约束。
4. OpenCode 生成后仍必须跑 smoke test。
5. 不要为提高通过率默认 skip smoke test。缺少 test 文件时应先进入 repair retry；超过 `OPENCODE_MAX_RETRIES` 后标记 failed。仅开发诊断模式可配置 `skip+warn`。
6. 生成后 lint 是 smoke test 前置门禁；发现非白名单框架、secret、越界路径时直接 failed。

阶段检查点：

1. `CODEGEN_ENGINE=opencode` 时，事件流出现真实 `opencode_started` / `opencode_finished`。
2. OpenCode 生成文件后，源码页能看到文件树。
3. smoke test 通过后才能标记 completed。
4. OpenCode 失败时 generation 标记 failed，并保留错误日志路径。
5. 真实 OpenCode job 在 sandbox 中具备受控网络和明确模型配置。

### Phase 11：LLM + OpenCode 端到端编排

目标：从非示例 prompt 到页面完成态跑通。

先写测试：

1. API integration：提交“天气查询 Agent”之类非示例 prompt，mock LLM 返回 AgentSpec，pipeline completed。
2. API integration：提交“合同审核 Workflow”之类非示例 prompt，mock LLM 返回 WorkflowSpec，pipeline completed。
3. LLM parse 成功但 OpenCode 失败时，generation failed。
4. OpenCode 成功但 smoke test 失败时，generation failed，active version 不被错误覆盖。
5. LLM parse 后的 Spec 被持久化，`getSpec` 不会二次调用 LLM。

实现任务：

1. `POST /api/generations` 只创建 generation 并立即返回；异步 pipeline 在 planning 阶段调用 parser 并持久化 Spec。
2. `OrchestratorService.runPipeline` 读取持久化 Spec。
3. `CodeGenerationService` 根据 `CODEGEN_ENGINE` 选择 `opencode`。
4. `GenerationEvent` payload 中记录 parser mode、model、engine、fallback 状态。
5. 更新错误文案：
   - LLM 不可用。
   - LLM 输出无法解析。
   - Spec validation 失败。
   - OpenCode 不可用。
   - OpenCode 生成失败。

阶段检查点：

1. 非示例 prompt 不再触发 deterministic parser 限制。
2. 后端 integration test 覆盖 Agent / Workflow 两条非示例链路。
3. 失败路径均有用户可理解错误码和 message。
4. slow LLM / slow OpenCode 不会让创建接口超时。

### Phase 12：页面模拟能力增强

目标：页面可以模拟运行生成后的 Agent / Workflow，展示与生成内容相关的结果。

先写测试：

1. Agent 测试台对非塔罗 Agent 也能展示回复。
2. Workflow 运行页对非售前 Workflow 也能展示节点状态。
3. 页面展示 parser mode、codegen engine、fallback 状态。
4. failed 状态下页面显示错误摘要和可查看日志入口。
5. Source tab 在生成完成后稳定显示 OpenCode 写入的文件。
6. 非塔罗 Agent 的 mock 回复不得出现“塔罗”“占卜”“牌”“抽牌”等领域词。
7. 非售前 Workflow 的 mock 节点结果不得写死“需求抽取 / 方案匹配 / Demo 清单 / 报告输出”。

实现任务：

1. 在 completed summary 中展示：
   - parser：deterministic / llm
   - model
   - codegen engine：template / opencode / mock
   - sandbox runtime
   - fallback 状态
2. Agent 测试台调用现有 `/agent/runs`，但 runner 要根据生成的 AgentSpec 给出通用 mock 回复。
3. Workflow 运行页调用现有 `/workflow/runs`，根据 WorkflowSpec 节点生成通用节点状态。
4. failed 页面增加错误面板：
   - error code
   - error message
   - 最近事件
   - run log 下载或查看入口
5. E2E 新增非示例 prompt：
   - Agent：天气查询 / 简历优化 / 会议纪要助手。
   - Workflow：合同审核 / 客诉分级 / 内容审核流程。
6. 重写 Python Runner 和生成模板中的 mock runtime：
   - Agent mock 根据 `spec.name`、`description`、`system_prompt` 和 `tools` 生成通用回复。
   - 有 tools 时按 tools 顺序调用或模拟调用，并把工具输出拼入回复。
   - 无 tools 时返回基于 system prompt 的纯对话回复。
   - Workflow mock 按 `spec.nodes` / `edges` 通用执行，并用节点 name/type 生成 node result。

阶段检查点：

1. Playwright 覆盖一个非示例 Agent。
2. Playwright 覆盖一个非示例 Workflow。
3. 页面可以完成：输入 prompt -> 生成 -> 源码 -> 模拟运行 -> 导出。
4. 通用 mock runtime 不再泄漏塔罗 / 售前 Demo 专用文案。

### Phase 13：真实模型与本地开发体验（✅ 已完成）

目标：让开发者可以清楚配置真实 LLM / OpenCode，也可以无密钥运行 mock 测试。

✅ 已完成项：
1. `.env.example` 包含所有必要配置。
2. README 含本地启动（Docker Compose 一键 + 裸机两种方式）和 E2E 复现步骤。
3. export filter 排除 `.agent_builder/`、`.opencode/`、`opencode.json`、任何 `*opencode*.json` 配置文件和 run logs。
4. export zip 不包含 OpenCode prompt、OpenCode config、LLM provider config 或任何 secret-looking value。
5. **Docker Compose 一键启动**：`docker compose up --build`，沙箱镜像预装 opencode + DeepSeek provider。
6. Docker sandbox runner 支持 `HOST_WORKSPACE_DIR` 路径翻译（docker-out-of-docker）。

实现任务：

1. 更新 `.env.example`。
2. 更新 README。
3. 更新 `docs/technical/p0_acceptance_report.md`，追加“下一阶段能力状态”。
4. 增加 `npm run dev:llm-mock` 或文档化环境变量组合。
5. 补齐 export filter：

```text
.agent_builder/
.opencode/
opencode.json
*opencode*.json
*.log
workspace run logs
```

6. 增加一键验证命令：

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
```

阶段检查点：

1. 无密钥环境下全量测试通过。
2. 有真实 LLM key 时，非示例 prompt 能生成 Spec。
3. 有 OpenCode 时，真实 OpenCode 路径可被手动或集成测试验证。
4. 导出包不包含 OpenCode / LLM / sandbox 运行配置和日志。

### Phase 14：可恢复生成、版本管理与日志可观测

目标：让真实 LLM / OpenCode 的不稳定性变得可控。生成失败时，用户能看到原因、触发修复；生成多次时，系统能保留版本、展示 Diff、回滚或导出指定版本。

先写测试：

1. OpenCode 失败后，页面显示错误摘要、失败阶段、最近事件和 run log 入口。
2. smoke test 失败后，`POST /api/generations/:id/repair` 会带上错误日志和当前 Spec 触发一次修复生成。
3. 每次生成 / 修复都会创建新的 `ProjectVersion`，不会覆盖上一个成功版本。
4. 版本列表 API 返回版本号、创建时间、engine、test status、file count、summary。
5. Diff API 能比较两个版本的文件新增、删除、修改。
6. 回滚 API 只切换 active version，不修改历史版本。
7. 日志查看 API 会脱敏 secret，并拒绝路径穿越。
8. repair retry 超过 `OPENCODE_MAX_RETRIES` 后停止循环并标记 failed。

实现任务：

1. 新增版本 API：

```http
GET  /api/generations/:id/versions
GET  /api/generations/:id/versions/:versionId/diff?base=:baseVersionId
POST /api/generations/:id/versions/:versionId/activate
```

2. 新增修复 API：

```http
POST /api/generations/:id/repair
```

请求体至少包含：

```json
{
  "instruction": "修复测试失败并保持原 Spec 不变",
  "base_version_id": "ver_xxx"
}
```

3. 新增日志 API：

```http
GET /api/generations/:id/runs/:runId/logs?stream=stdout|stderr
```

4. OpenCode 修复 prompt 必须包含：
   - 已验证 Spec。
   - 失败命令。
   - 脱敏后的 stdout / stderr 摘要。
   - 当前版本文件清单。
   - 不允许越出 project workspace 的约束。
5. repair 任务必须记录 retry count：
   - `retry_of_version_id`
   - `retry_index`
   - `max_retries`
   - `last_failure_code`
6. 超过 `OPENCODE_MAX_RETRIES` 后，系统不得继续自动修复；页面提示用户修改 Spec 或切换 fallback。
7. 前端新增：
   - 失败错误面板。
   - “修复并重试”按钮。
   - 版本列表。
   - 文件 Diff 视图。
   - run log drawer / panel。

注意事项：

1. 修复不能修改原版本目录，必须基于新 version 目录生成。
2. Diff 不要求 P1 做完整 IDE 级体验；文本文件显示 unified diff 即可。
3. 日志页默认只显示脱敏后的最后 N 行，避免大日志拖垮页面。
4. `active_version_id` 只能指向 smoke test 通过的版本；失败版本可查看但不能自动激活。
5. 自动修复必须有停止条件；不要让 coding agent 在后台无限循环。

阶段检查点：

1. 失败任务可以在页面看到失败阶段和日志。
2. 用户可以点击“修复并重试”，生成新版本。
3. 用户可以比较两个版本差异。
4. 用户可以回滚到上一个成功版本。

### Phase 15：Beta 体验增强：Spec 确认、模板库、模型配置、历史与导出

目标：降低真实用户试用门槛，让 P1 从技术验证变成可演示的 Beta。

先写测试：

1. Spec 预览页展示 LLM 解析出的 name、description、tools/nodes、acceptance checks。
2. 用户确认 Spec 后才进入 OpenCode 生成。
3. 用户修改 Spec JSON 后，必须重新经过 `SpecValidatorService`。
4. Prompt 模板点击后能填充首页 prompt 和类型。
5. 模型配置页不会把 API key 回显到前端。
6. 任务历史页能列出最近 generations，并按状态过滤。
7. GitHub 导出开关关闭时，页面不显示 GitHub 推送按钮。

实现任务：

1. 引入两阶段创建流程：

```text
POST /api/generations/drafts
  -> create draft
  -> return draft_id immediately
  -> async parse prompt
  -> persist draft spec or failed status

POST /api/generations/drafts/:draftId/confirm
  -> validate spec
  -> create generation
  -> run pipeline
```

2. 前端新增 Spec 确认页：
   - 摘要视图：适合普通用户确认。
   - JSON 视图：适合开发者微调。
   - validation error 展示。
3. 新增 Prompt 模板：
   - 天气查询 Agent。
   - 简历优化 Agent。
   - 会议纪要 Agent。
   - 合同审核 Workflow。
   - 客诉分级 Workflow。
   - 内容审核 Workflow。
4. 新增模型配置中心：
   - provider：mock / OpenAI compatible / OpenJiuwen。
   - model name。
   - base URL。
   - key presence 状态，只显示“已配置 / 未配置”，不显示明文。
5. 新增任务历史页：
   - generation id。
   - title。
   - type。
   - status。
   - parser mode。
   - codegen engine。
   - created / updated time。
6. 可选 GitHub 导出：
   - 仅在 `FEATURE_GITHUB_EXPORT=true` 时启用。
   - P1 只做 push branch 或下载后手动推送；自动 PR 可放到 P2。

注意事项：

1. Spec 确认是 P1 控制 LLM 不确定性的关键，不应放到 P2。
2. 模型配置中心不要在数据库里明文保存 key；P1 可以只读取环境变量。
3. Prompt 模板是提高成功率的产品能力，不应绕过 LLM parser 和 validator。
4. 任务历史页只做单用户本地视图，不引入多用户权限模型。
5. Draft parse 也不得阻塞 HTTP；draft 状态通过轮询或 SSE 展示。

阶段检查点：

1. 用户可以从模板启动一次非示例 Agent / Workflow 生成。
2. 用户可以在生成前确认或修改 Spec。
3. 用户可以查看历史任务和版本。
4. 无 key / mock 模式下仍能跑通全部自动测试。

## 6. 推荐执行顺序

优先级从高到低：

| 优先级 | 工作 | 原因 |
| --- | --- | --- |
| P0 | Spec 持久化 | 真实 LLM 不能重复 parse，否则同一 generation 可能前后不一致 |
| P0 | 异步 parse / draft 底座 | 真实 LLM 不得阻塞 HTTP 创建请求 |
| P0 | LLM parser mock 测试 | 先把接口和失败路径定住 |
| P0 | hybrid parser | 立即解决 `PROMPT_PARSE_FAILED` 的产品阻塞 |
| P0 | export filter 安全补齐 | 防止 OpenCode / LLM 配置进入导出包 |
| P0 | OpenCode real command builder | 先证明真实调用边界安全 |
| P0 | OpenCode 配置与网络策略 | 真实 OpenCode 需要 provider/model/key 和受控联网 |
| P0 | OpenCode sandbox execution | 避免主进程直接运行 coding agent |
| P1 | 通用 mock runtime | 避免非示例 Agent / Workflow 仍输出塔罗/售前文案 |
| P1 | 非示例 Agent E2E | 验证页面可用 |
| P1 | 非示例 Workflow E2E | 验证复杂链路 |
| P1 | Spec 预览与确认 | 控制 LLM 解析误差，避免错误 Spec 直接生成 |
| P1 | 失败修复 / 重试 | 让 OpenCode 和 smoke test 失败可恢复 |
| P1 | 版本列表与 Diff | 支持比较、回滚和导出指定版本 |
| P1 | 日志查看页 | 缩短调试和演示时的问题定位时间 |
| P1 | 模型配置中心 | 让 mock / real provider 切换清晰可控 |
| P1 | Prompt 模板库 | 提高首次试用成功率 |
| P1 | 真实 provider 手动验收 | 避免 CI 依赖外部 key |

## 7. 最小可交付切片

为了快速向下推进，建议第一个 PR 只做以下内容：

1. 新增 Spec 持久化。
2. 将 parse 移入异步 pipeline，`POST /api/generations` 立即返回。
3. 新增 mock LLM parser。
4. `SPEC_PARSER_MODE=hybrid`。
5. 非示例 prompt 通过 mock LLM 生成合法 Spec。
6. TemplateEngine 仍作为 codegen fallback。
7. 补齐 export filter，排除 `.agent_builder/`、`.opencode/`、`opencode.json`。
8. 如果该 PR 覆盖页面模拟 E2E，则同时重写通用 mock runtime。
9. API integration + 前端 E2E 覆盖一个非示例 Agent。

这个切片完成后，用户已经不会再遇到“P0 deterministic parser 暂仅支持...”的固定阻断。

第二个 PR 再接入真实 provider、OpenCode 配置/网络策略和真实 OpenCode。

第三个 PR 增加 Spec 预览确认、失败修复、版本 Diff 和日志查看。

第四个 PR 增加 Prompt 模板、任务历史、模型配置中心和可选 GitHub 导出。

## 8. 验收清单（已完成 2026-07-10）

| # | 验收项 | 状态 |
|---|---|---|
| 1 | `npm run lint` 通过 | ✅ |
| 2 | `npm run typecheck` 通过 | ✅ |
| 3 | `npm run test` 通过（190 tests） | ✅ |
| 4 | `npm run test:e2e` 通过（4 Playwright） | ✅ |
| 5 | 标准塔罗 Agent 仍通过 | ✅ |
| 6 | 标准售前 Workflow 仍通过 | ✅ |
| 7 | 非示例 Agent prompt 端到端可生成 | ✅ |
| 8 | 非示例 Workflow prompt 端到端可生成 | ✅ |
| 9 | 失败有明确错误展示 | ✅ |
| 10 | 导出 zip 不含 secret/config | ✅ |
| 11 | 事件流区分 parser mode / engine / fallback | ✅ |
| 12 | OpenCode 经 SandboxService 调度 | ✅ |
| 13 | Spec 预览确认（draft/confirm API） | ✅ |
| 14 | 修改 Spec 后 re-validate | ✅ |
| 15 | 失败可查看脱敏日志 + 触发修复 | ✅ |
| 16 | 每次生成/修复形成独立版本，可回滚 | ✅ |
| 17 | 版本 Diff（unified diff） | ✅ |
| 18 | 模型配置页不泄漏 key（推迟到 P2） | 📋 |
| 19 | Prompt 模板可启动生成 | ✅ |
| 20 | 任务历史页 | ✅ |
| 21 | POST /api/generations 异步不阻塞 | ✅ |
| 22 | OpenCode job 受控网络策略 | ✅ |
| 23 | repair retry 超限后停止 | ✅ |
| 24 | 通用 mock runtime 不泄漏 Demo 文案 | ✅ |

**Docker 沙箱：**
- opencode v1.17.18（官方 `curl -fsSL https://opencode.ai/install \| bash` 安装）
- Dockerfile: `sandbox/Dockerfile`
- 镜像: `agent-builder-sandbox:latest`
- 一键启动: `docker compose up --build`
- SandboxService 自动选择 Docker（可用时）或 Mock（fallback）
- `--read-only` + `--tmpfs /root` 安全硬化

## 9. 编程 Agent 注意事项

1. 不要删除现有 P0 demo 测试；它们是回归基线。
2. 不要把真实 LLM key 写入测试、fixture、日志或文档示例。
3. 不要让测试依赖真实外部 LLM；CI 只能依赖 mock provider。
4. 不要直接把 LLM 生成代码落盘；必须先落 Spec，再由 OpenCode / TemplateEngine 生成工程。
5. 不要把 OpenCode 的执行 cwd 设为 repo root。
6. 不要因为 OpenCode 输出不稳定而放宽 smoke test；生成失败应显式失败。
7. 不要把页面模拟写死为塔罗 / 售前；通用 Agent / Workflow 要能显示。
8. 不要把 `PROMPT_PARSE_FAILED` 全部吞掉；要保留错误码，但 message 应指向真实失败原因。
9. 不要把真实 LLM parse 放回同步 HTTP 创建路径。
10. 不要把带 key 的 OpenCode config 写入 workspace；如必须写 project config，只允许无 secret 配置。
11. 不要允许 `.agent_builder/`、`.opencode/`、`opencode.json` 进入导出包。
12. 不要保留同步 `parse` 和异步 `parseAsync` 两套主接口。

## 10. 建议任务拆分

```text
Task A: Spec persistence
Task B: Async parse pipeline / draft foundation
Task C: LLM parser interface + mock provider
Task D: hybrid parser wiring
Task E: export filter hardening for OpenCode/LLM artifacts
Task F: non-demo API integration tests
Task G: OpenCode real command builder tests
Task H: OpenCode provider/model/key injection and network policy
Task I: OpenCode via SandboxService
Task J: generated project contract and post-generation lint
Task K: generic Agent/Workflow mock runtime
Task L: generic Agent/Workflow simulation UI
Task M: non-demo Playwright E2E
Task N: docs/env/README update
Task O: Spec preview and confirmation flow
Task P: repair / retry generation flow
Task Q: version list, activate, and diff APIs
Task R: run log viewer with redaction
Task S: prompt templates and task history page
Task T: model configuration page
Task U: optional GitHub export feature flag
```

每个 Task 都必须有测试证明，不能只靠手工页面验证。
