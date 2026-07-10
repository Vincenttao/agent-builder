# PRD v0.3：Agent Builder Demo - 基于 OpenJiuwen 的自然语言生成 Agent/Workflow Python 代码

## 0. 文档目的

本文档是 Agent Builder Demo v0.3 的产品需求定义。技术设计 Agent 基于本文档完成了系统架构、模块设计、接口设计和代码实现。

**当前代码实现状态（P2，2026-07-11）：**

- 核心闭环已完成：首页输入 → Spec 确认 → 代码生成 → smoke test → 测试台/运行页 → 源码查看 → 导出
- Spec 解析统一走 LLM（或 mock LLM），不再有针对 demo prompt 的确定性关键词绕过
- 首页提交后先进入 Draft/Spec 确认页，用户确认后再启动代码生成
- 代码生成支持两种引擎：TemplateEngine（确定性模板）和 OpenCodeEngine（真实 LLM + Docker 沙箱）

本 PRD 的核心不是完整商业化平台，而是一个可演示的 Demo：

> 用户用自然语言描述想要的智能体或工作流，系统自动生成基于 OpenJiuwen 能力的 Python 代码，展示生成过程，自动运行测试，并允许查看源码与运行效果。

## 1. 产品定位

Agent Builder Demo 是一个面向 OpenJiuwen 的自然语言到 Python 代码生成工具。

P0 只演示两类对象：

| 对象 | 用户表达 | 生成目标 | 演示价值 |
| --- | --- | --- | --- |
| Agent | “帮我做一个塔罗占卜 Agent，先问问题，再抽牌并解读” | 可运行的 OpenJiuwen Agent Python 工程 | 展示自然语言生成智能体、工具调用、对话测试、源码查看 |
| Workflow | “读取客户需求，抽取目标，匹配方案，生成 Demo 清单并输出报告” | 可运行的 OpenJiuwen Workflow Python 工程 | 展示自然语言生成流程编排、节点执行、运行记录、源码查看 |

Skills/技能不作为 P0 独立创建对象。若界面上存在“技能”标签或按钮，仅作为后续能力入口或上下文附件入口，不进入本次 Demo 的独立交付范围。

## 2. 产品一句话

Agent Builder Demo 让用户通过一段自然语言生成、运行、测试和查看基于 OpenJiuwen 的 Python Agent 或 Workflow 工程代码。

## 3. 设计参考

本文档参考 `docs/prd` 下的界面图片：

| 图片 | 对应页面 | PRD 中的约束 |
| --- | --- | --- |
| `1首页.bmp` | 首页自然语言输入 | 首页以大输入框为主，可切换“智能体/工作流”等类型 |
| `2开始生成.bmp` | 生成开始 | 左侧对话/思考过程，右侧预览区，底部终端/运行记录/输出 |
| `3处理过程.bmp` | 生成中 | 展示读文件、更新计划、创建文件、执行命令、测试代码等步骤 |
| `4生成效果.bmp` | 生成完成与效果测试 | 展示创建完成摘要、测试通过、版本、部署、回滚、修改记录 |
| `5查看源码.bmp` | 源码查看 | 展示项目文件树、代码编辑器、运行记录和底部输出区 |

界面不需要完全复刻图片中的商业产品，但 Demo 必须保留以下体验骨架：

1. 自然语言输入是主入口。
2. 生成过程可观测。
3. 生成结果可运行、可测试。
4. 用户能查看 Python 源码和项目文件树。
5. Agent/Workflow 必须基于 OpenJiuwen 能力构建，而不是生成任意框架代码。

## 4. P0 范围

### 4.1 P0 必须支持

1. 用户选择生成类型：Agent 或 Workflow。
2. 用户输入自然语言需求。
3. 系统把自然语言需求解析为结构化生成规格。
4. 系统生成 OpenJiuwen Python 工程代码。
5. 系统展示生成过程，包括计划、文件变更、命令执行、测试结果。
6. 系统自动运行一次 smoke test 或示例输入。
7. 系统提供效果测试台。
8. 系统提供源码查看，包括文件树和代码查看。
9. 系统提供导出代码包能力。
10. 系统明确记录生成版本，并支持查看修改记录。

### 4.2 P0 不支持

1. 不做 Skills/技能的独立创建、管理、测试和导出。
2. 不做 Agent Store。
3. 不做多租户、企业权限、计费、审计等平台能力。
4. 不做云端生产部署。
5. 不支持 LangGraph、CrewAI、OpenAI Agents SDK、Dify 等非 OpenJiuwen 框架生成。
6. 不支持复杂多人协作编辑。
7. 不支持任意前端应用生成，本 Demo 只关注 Agent/Workflow Python 工程。

### 4.3 P1 可延后

1. 技能市场或技能包引用。
2. 多 Agent 协作。
3. 可视化拖拽编辑 Workflow。
4. 代码在线编辑并回写生成上下文。
5. 部署到远端环境。

## 5. 目标用户与演示场景

### 5.1 目标用户

| 用户 | 需求 |
| --- | --- |
| 售前/解决方案人员 | 快速演示“用自然语言生成可运行 Agent/Workflow”的能力 |
| Agent 开发者 | 快速得到 OpenJiuwen 工程骨架、工具、配置和测试代码 |
| 平台产品/技术负责人 | 评估 OpenJiuwen 在 Agent/Workflow 低代码生成场景中的集成方式 |
| 业务专家 | 不写代码也能描述业务流程，并看到可运行效果 |

### 5.2 标准演示脚本

Demo 至少准备两个内置示例：

#### 示例 A：塔罗占卜 Agent

用户输入：

```text
一个塔罗牌占卜 Agent。首先询问用户想要占卜的问题，之后抽取塔罗牌并解读。
```

系统应生成：

1. 一个 Agent 工程。
2. 一个塔罗抽牌工具，如 `src/tools/tarot_tool.py`。
3. Agent 核心逻辑，如 `src/agents/agent.py`。
4. LLM/OpenJiuwen 配置，如 `config/agent_llm_config.json` 或 `.env.example`。
5. README、示例输入、smoke test。
6. 效果测试页面，支持用户输入问题并看到 Agent 回复。

生成完成摘要需包含：

```text
塔罗牌占卜 Agent 已创建完成

完成的功能：
1. 塔罗牌抽取工具：支持随机抽取并返回牌名、正逆位、含义
2. Agent 核心逻辑：基于 OpenJiuwen Agent 能力，支持多轮对话和工具调用
3. System Prompt：引导 Agent 按“询问问题 -> 抽牌 -> 解读”流程完成
4. LLM 配置：可通过环境变量或配置文件接入模型服务

测试结果：
测试通过：Agent 能正确调用抽牌工具，并根据抽到的牌给出解读
```

#### 示例 B：售前需求分析 Workflow

用户输入：

```text
读取客户需求文档，抽取客户目标和限制条件，匹配可演示的解决方案，生成 Demo 清单并输出一份 Markdown 报告。
```

系统应生成：

1. 一个 Workflow 工程。
2. 至少 5 个节点：Start、需求抽取、方案匹配、Demo 清单生成、报告输出、End。
3. 每个节点有明确输入、输出和失败处理。
4. Workflow 运行记录页，展示节点状态、节点输入输出、耗时和最终报告。
5. README、示例输入、smoke test。

## 6. 核心用户流程

### 6.1 首页输入流程

页面结构参考 `1首页.bmp`。

首页必须包含：

1. 产品标题或标语。
2. 类型选择：智能体、工作流。
3. 自然语言输入框。
4. 模型/模式选择，默认 Auto。
5. 提交按钮。
6. 可选的“查看文档”入口。

若 UI 中保留“网页应用、移动应用、小程序、技能”等标签，P0 中必须做以下处理：

1. “智能体”和“工作流”可用。
2. 其他类型可灰态、隐藏或提示“暂未开放”。
3. “技能”不得进入独立 Skills 创建流程。

### 6.2 Agent 生成流程

1. 用户选择”智能体”。
2. 用户输入自然语言需求。
3. 系统创建 Draft，调用 LLM 解析需求得到 Agent Spec。
4. 用户进入 Spec 确认页，可查看解析结果（名称、描述、工具、模型）并编辑 Spec JSON。
5. 用户确认后，系统创建 Generation 并跳转工作台。
6. 系统制定生成计划。
7. 系统生成项目文件。
8. 系统运行格式检查、smoke test 或示例执行。
9. 系统展示生成完成摘要（文件数、测试结果、解析方式、引擎、版本）。
10. 用户进入 Agent 效果测试台。
11. 用户可查看源码、运行记录、导出代码包。

### 6.3 Workflow 生成流程

1. 用户选择”工作流”。
2. 用户输入自然语言流程描述。
3. 系统创建 Draft，调用 LLM 解析需求得到 Workflow Spec。
4. 用户进入 Spec 确认页，可查看节点、边、输入输出并编辑 Spec JSON。
5. 用户确认后，系统创建 Generation 并跳转工作台。
6. 系统生成节点图、节点输入输出和执行顺序。
7. 系统生成 OpenJiuwen Workflow Python 工程。
8. 系统运行 workflow smoke test。
9. 系统展示节点执行结果。
10. 用户可查看源码、运行记录、导出代码包。

### 6.4 源码查看流程

页面结构参考 `5查看源码.bmp`。

源码查看必须包含：

1. 项目文件树。
2. 代码查看器。
3. 当前打开文件 Tab。
4. 底部面板：终端、运行记录、输出。
5. 左侧生成摘要和修改记录。

P0 不要求在线编辑源码，但技术设计需要预留只读/可编辑的状态边界。

## 7. 核心对象

### 7.1 Generation

Generation 表示一次从自然语言到工程代码的生成任务。

```yaml
generation_id: string
type: agent | workflow
title: string
user_prompt: string
status: pending | planning | generating | testing | completed | failed
created_at: datetime
updated_at: datetime
selected_model: string
project_path: string
active_version_id: string
error_message: string | null
parser_mode: string      # 'llm' — 所有 prompt 均通过 LLM 解析
codegen_engine: string   # 'template' | 'opencode' — 代码生成引擎
```

### 7.2 Agent Spec

Agent Spec 是自然语言需求解析后的结构化结果。

```yaml
agent_id: string
name: string
description: string
scenario: string
openjiuwen_agent_type: react_agent
system_prompt: string
model:
  provider: openjiuwen
  model_name: string
  temperature: number
tools:
  - name: string
    description: string
    input_schema: object
    output_schema: object
memory:
  enabled: boolean
  type: short_term | none
examples:
  - input: string
    expected_behavior: string
acceptance_checks:
  - string
```

约束：

1. `openjiuwen_agent_type` P0 固定为 OpenJiuwen 支持的 Agent 模式，技术设计阶段必须用真实 OpenJiuwen API 名称替换。
2. 如果 OpenJiuwen 当前 API 名称不是 `react_agent`，技术设计必须以 API 盘点结果为准。
3. 生成代码不得直接依赖非 OpenJiuwen Agent 框架。

### 7.3 Workflow Spec

Workflow Spec 是自然语言流程描述解析后的结构化结果。

```yaml
workflow_id: string
name: string
description: string
openjiuwen_workflow_type: workflow
inputs:
  - name: string
    type: string
    required: boolean
outputs:
  - name: string
    type: string
nodes:
  - id: string
    name: string
    type: start | llm | tool | python | condition | export | end
    description: string
    input_schema: object
    output_schema: object
    config: object
edges:
  - from: string
    to: string
    condition: string | null
acceptance_checks:
  - string
```

约束：

1. Workflow 必须包含 Start 和 End。
2. 每个非 Start/End 节点必须有输入输出定义。
3. 节点执行状态必须可记录。
4. 技术设计必须将 `llm/tool/python/condition/export` 映射到 OpenJiuwen 真实 Workflow/Component API。

### 7.4 Project Version

```yaml
version_id: string
generation_id: string
commit_message: string
file_count: number
created_at: datetime
test_status: passed | failed | skipped
summary: string
```

Demo 中可使用内部版本号，不要求真实 git 仓库。

## 8. OpenJiuwen 集成约束

### 8.1 总原则

Agent Builder Demo 必须生成基于 OpenJiuwen 能力的 Python 工程。所有 OpenJiuwen 调用必须通过适配层隔离，避免 UI、生成模板和运行器直接散落调用 SDK。

### 8.2 技术设计前置任务

详细技术设计 Agent 必须先完成 OpenJiuwen API 盘点：

1. 当前可用的 Agent 创建 API。
2. 当前可用的 Tool 注册 API。
3. 当前可用的 Workflow/Component/Runner API。
4. 当前可用的模型配置方式。
5. 当前可用的流式输出、运行日志和错误处理 API。
6. 本地运行所需依赖、环境变量和最小示例。

输出文件建议：

```text
docs/technical/openjiuwen_api_inventory.md
```

盘点完成前，技术设计不得把本文档里的示例 API 名称当作真实 API。

### 8.3 适配层要求

生成系统内部应有以下适配层：

```text
src/openjiuwen_adapter/
├── agent_adapter.py
├── workflow_adapter.py
├── model_adapter.py
├── tool_adapter.py
├── runner_adapter.py
└── errors.py
```

适配层职责：

1. 封装 OpenJiuwen 真实 SDK。
2. 对上暴露稳定的内部接口。
3. 将 OpenJiuwen 运行事件转换为前端可展示的事件。
4. 将异常转换为统一错误码。
5. 支持 mock 模式，便于无模型环境下完成 Demo smoke test。

### 8.4 生成代码中的 OpenJiuwen 约束

生成出的 Agent/Workflow 项目也必须通过项目内 adapter 或清晰封装调用 OpenJiuwen。

禁止：

1. 生成 LangGraph/CrewAI/Dify 等框架工程。
2. 只生成伪代码。
3. 只生成 README 而不生成可运行 Python。
4. 在测试中完全跳过 Agent/Workflow 核心逻辑。
5. 把模型密钥硬编码进源码。

允许：

1. 使用 OpenAI-compatible 模型客户端接入 OpenJiuwen 模型服务，前提是 Agent/Workflow 编排能力仍基于 OpenJiuwen。
2. 在 Demo 环境使用 mock 模型响应，但需要在 README 中说明如何切换到真实 OpenJiuwen 配置。

## 9. 功能需求

### FR-001：首页自然语言入口

描述：用户通过首页输入自然语言需求，并选择生成 Agent 或 Workflow。

输入：

```yaml
generation_type: agent | workflow
prompt: string
mode: auto
model: string | null
```

输出：

```yaml
generation_id: string
status: planning
```

验收标准：

1. 首页默认聚焦自然语言输入框。
2. 用户可以切换“智能体/工作流”。
3. 提交后进入生成工作台。
4. 技能/Skills 不作为 P0 创建入口。

### FR-002：需求解析与生成计划

描述：系统将自然语言需求解析成 Agent Spec 或 Workflow Spec，并展示生成计划。

验收标准：

1. Agent 需求生成 Agent Spec。
2. Workflow 需求生成 Workflow Spec。
3. 页面展示计划步骤，例如“解析需求、生成工具、生成 Agent、写入配置、生成测试、运行测试”。
4. 计划可以在生成过程中更新。
5. 解析失败时展示可理解的错误信息和重新输入入口。

### FR-003：Agent 代码生成

描述：系统生成基于 OpenJiuwen 的 Agent Python 工程。

标准目录：

```text
generated/{generation_id}/
├── pyproject.toml
├── README.md
├── .env.example
├── config/
│   └── agent_llm_config.json
├── src/
│   ├── agents/
│   │   ├── __init__.py
│   │   └── agent.py
│   ├── tools/
│   │   ├── __init__.py
│   │   └── {tool_name}.py
│   ├── openjiuwen_runtime/
│   │   ├── __init__.py
│   │   ├── agent_runtime.py
│   │   └── model_config.py
│   └── main.py
├── examples/
│   └── input.md
└── tests/
    └── test_agent_smoke.py
```

验收标准：

1. 必须生成 `pyproject.toml`。
2. 必须生成 `README.md`。
3. 必须生成 Agent 核心文件。
4. 如需求需要工具，必须生成工具文件和工具测试逻辑。
5. 必须生成 `.env.example`，列出 OpenJiuwen 所需环境变量。
6. 必须生成 smoke test。
7. 必须能通过运行器启动示例输入。

### FR-004：Workflow 代码生成

描述：系统生成基于 OpenJiuwen 的 Workflow Python 工程。

标准目录：

```text
generated/{generation_id}/
├── pyproject.toml
├── README.md
├── .env.example
├── workflow.yaml
├── src/
│   ├── workflows/
│   │   ├── __init__.py
│   │   └── workflow.py
│   ├── components/
│   │   ├── __init__.py
│   │   ├── extract_requirement.py
│   │   ├── match_solution.py
│   │   ├── generate_demo_plan.py
│   │   └── export_report.py
│   ├── openjiuwen_runtime/
│   │   ├── __init__.py
│   │   ├── workflow_runtime.py
│   │   └── model_config.py
│   └── main.py
├── examples/
│   └── input.md
└── tests/
    └── test_workflow_smoke.py
```

验收标准：

1. 必须生成 `workflow.yaml`。
2. 必须生成 Workflow 核心文件。
3. 必须生成组件文件。
4. 必须有 Start 和 End。
5. 必须记录节点输入、输出、状态和耗时。
6. 必须生成 smoke test。
7. 必须能运行示例输入并得到最终输出。

### FR-005：生成过程可观测

描述：生成工作台左侧展示对话、思考过程、计划、文件变更、命令执行和测试结果。

事件类型：

```yaml
- thought
- plan_created
- plan_updated
- file_created
- file_updated
- command_started
- command_finished
- test_started
- test_finished
- run_started
- run_finished
- error
```

验收标准：

1. 每次生成至少展示计划、文件创建、测试结果三类事件。
2. 文件事件包含相对路径。
3. 命令事件包含命令名称、退出码和摘要。
4. 错误事件包含错误原因和建议操作。
5. 完成后展示收起/展开步骤能力。

### FR-006：自动运行与 smoke test

描述：代码生成后，系统自动运行一次测试或示例输入。

验收标准：

1. Agent 生成后运行 `tests/test_agent_smoke.py` 或等效 smoke test。
2. Workflow 生成后运行 `tests/test_workflow_smoke.py` 或等效 smoke test。
3. 测试通过时展示“测试通过”。
4. 测试失败时展示失败文件、错误摘要和重新生成入口。
5. 无真实模型配置时，允许使用 mock 模式，但必须标记为 mock test。

### FR-007：Agent 效果测试台

描述：用户可以在生成完成后输入消息测试 Agent 回复效果。

页面参考 `4生成效果.bmp`。

验收标准：

1. 显示 Agent 名称、图标和模型名称。
2. 显示可用工具数量。
3. 用户输入消息后可看到 Agent 回复。
4. 若 Agent 调用工具，运行记录中可查看工具名称、输入、输出。
5. 支持重新运行或清空会话。

### FR-008：Workflow 运行记录

描述：用户可以查看 Workflow 的节点运行状态和最终输出。

验收标准：

1. 展示节点列表或节点图。
2. 每个节点展示状态：pending、running、success、failed、skipped。
3. 每个节点可展开查看输入输出。
4. 展示最终输出。
5. 失败时标记失败节点并显示错误摘要。

### FR-009：源码查看

描述：用户可以查看生成项目的源码。

验收标准：

1. 左侧显示项目文件树。
2. 右侧显示代码内容。
3. 支持打开多个文件 Tab。
4. 底部显示终端、运行记录、输出三个面板。
5. 文件路径必须与生成事件中的路径一致。

### FR-010：代码导出

描述：用户可以导出生成的 Agent/Workflow 工程。

导出包：

```text
{project_name}.zip
├── pyproject.toml
├── README.md
├── .env.example
├── src/
├── examples/
└── tests/
```

验收标准：

1. 导出包包含完整源码。
2. 导出包不包含密钥。
3. README 包含安装、配置、运行、测试说明。
4. 导出包可在本地解压运行 smoke test。

### FR-011：版本与修改记录

描述：每次生成完成形成一个版本。

验收标准：

1. 完成卡片显示版本号。
2. 显示版本摘要，例如 `feat: 创建塔罗占卜 Agent，支持抽牌与解读`。
3. 支持查看修改记录。
4. 支持回到当前版本视图。
5. P0 不要求真实 git commit，但内部数据结构应可映射到后续 git 集成。

### FR-012：错误处理

描述：系统需要对解析、生成、运行、测试和导出失败进行明确反馈。

错误码建议：

| 错误码 | 场景 |
| --- | --- |
| `PROMPT_PARSE_FAILED` | 无法解析用户需求 |
| `SPEC_VALIDATION_FAILED` | Spec 缺少必要字段 |
| `OPENJIUWEN_API_UNAVAILABLE` | OpenJiuwen SDK 或服务不可用 |
| `CODE_GENERATION_FAILED` | 文件生成失败 |
| `TEST_FAILED` | smoke test 失败 |
| `RUN_FAILED` | 示例运行失败 |
| `EXPORT_FAILED` | 导出失败 |

验收标准：

1. 错误展示给用户时必须可理解。
2. 技术日志保留详细堆栈。
3. 用户可重新生成。
4. 失败任务不会覆盖上一个成功版本。

## 10. 非功能需求

### 10.1 可演示性

1. 从提交需求到展示生成过程，首个事件应在 3 秒内出现。
2. 标准示例应在 2 分钟内完成生成与测试。
3. Demo 环境无真实模型密钥时，必须能以 mock 模式跑通完整流程。

### 10.2 可维护性

1. 生成模板、OpenJiuwen 适配层、运行器、前端展示层分离。
2. OpenJiuwen API 变化时，只需要修改 adapter 和模板少量位置。
3. Spec schema 必须版本化。

### 10.3 安全性

1. 不允许把 API Key 写入生成源码。
2. 运行命令必须限制在生成项目目录内。
3. 导出包不得包含 `.env`、缓存、日志中的密钥。
4. 用户输入不得直接拼接为 shell 命令。

### 10.4 可测试性

1. 需求解析、Spec 校验、模板渲染、导出打包都应有单元测试。
2. Agent 和 Workflow 至少各有一个端到端 smoke test。
3. OpenJiuwen adapter 需要 mock 测试。

## 11. API 草案（已实现）

API 名称以实际工程路由为准。

### 11.1 创建 Draft（Spec 解析）

```http
POST /api/generations/drafts
```

请求：

```json
{
  "type": "agent",
  "prompt": "一个塔罗牌占卜 Agent。首先询问用户想要占卜的问题，之后抽取塔罗牌并解读。"
}
```

响应：

```json
{
  "draft_id": "draft_123",
  "status": "pending",
  "type": "agent",
  "user_prompt": "...",
  "spec": null,
  "parser_mode": "llm",
  "created_at": "..."
}
```

### 11.2 获取 Draft

```http
GET /api/generations/drafts/{draft_id}
```

### 11.3 更新 Draft Spec

```http
PUT /api/generations/drafts/{draft_id}/spec
```

### 11.4 确认并创建 Generation

```http
POST /api/generations/drafts/{draft_id}/confirm
```

响应：

```json
{
  "generation_id": "gen_123",
  "status": "planning"
}
```

### 11.5 获取生成任务

```http
GET /api/generations/{generation_id}
```

响应：

```json
{
  "generation_id": "gen_123",
  "type": "agent",
  "title": "塔罗牌占卜 Agent",
  "status": "completed",
  "active_version_id": "ver_001",
  "project_path": "generated/gen_123"
}
```

### 11.3 订阅生成事件

```http
GET /api/generations/{generation_id}/events
```

技术设计可选择 SSE 或 WebSocket。

事件：

```json
{
  "event_id": "evt_001",
  "generation_id": "gen_123",
  "type": "file_created",
  "message": "创建文件 src/agents/agent.py",
  "payload": {
    "path": "src/agents/agent.py"
  },
  "created_at": "2026-07-08T00:00:00Z"
}
```

### 11.4 获取文件树

```http
GET /api/generations/{generation_id}/files
```

### 11.5 获取文件内容

```http
GET /api/generations/{generation_id}/files/content?path=src/agents/agent.py
```

### 11.6 运行 Agent 测试消息

```http
POST /api/generations/{generation_id}/agent/runs
```

请求：

```json
{
  "message": "我想看看最近职业发展的趋势"
}
```

### 11.7 运行 Workflow

```http
POST /api/generations/{generation_id}/workflow/runs
```

请求：

```json
{
  "inputs": {
    "requirement_doc": "客户希望建设一个智能客服 Demo..."
  }
}
```

### 11.8 导出代码

```http
POST /api/generations/{generation_id}/exports
```

响应：

```json
{
  "download_url": "/api/exports/export_123/download"
}
```

## 12. 前端页面需求

### 12.1 首页

必须展示：

1. 类型切换。
2. 自然语言输入框。
3. Auto 模式选择。
4. 提交按钮。

### 12.2 生成工作台

布局：

```text
左侧：对话、计划、生成事件、完成摘要
右侧：预览/测试台/源码
底部：终端、运行记录、输出
```

状态：

1. `planning`：展示计划。
2. `generating`：展示文件和命令事件。
3. `testing`：展示测试执行中。
4. `completed`：展示完成摘要和测试台。
5. `failed`：展示错误和重新生成。

### 12.3 Agent 测试台

必须展示：

1. Agent 名称。
2. 当前模型。
3. 工具数量。
4. 输入框。
5. 回复区。
6. 运行记录入口。

### 12.4 Workflow 运行页

必须展示：

1. 节点状态。
2. 节点输入输出。
3. 运行耗时。
4. 最终输出。

### 12.5 源码页

必须展示：

1. 文件树。
2. 代码查看器。
3. 文件 Tab。
4. 底部运行记录。

## 13. 后端模块（已实现）

```text
apps/api/src/
├── generations/         # Generation 生命周期 + 事件 + 版本
├── spec/                # Spec 解析（LLM/mock）+ 校验
├── codegen/             # 代码生成引擎（Template / OpenCode）+ lint
├── orchestration/       # 编排 pipeline（生成→测试→完成）+ 导出
├── sandbox/             # Docker/Mock sandbox 运行器 + 命令构建 + 脱敏
├── files/               # 文件树扫描 + 安全路径读取 + 导出过滤
├── health/              # 健康检查
└── database/            # SQLite 存储 + schema 迁移（内存模式 for CI）
```

职责：

| 模块 | 职责 |
| --- | --- |
| generations | 编排生成任务生命周期、事件记录、版本管理、Draft 流程 |
| spec | LLM/mock Spec 解析（始终走 LLM，无确定性绕过）+ Zod schema 校验 |
| codegen | TemplateEngine（确定性模板）+ OpenCodeEngine（真实 LLM Docker 沙箱）+ lint gate |
| orchestration | 异步 pipeline（生成 → lint → smoke test → 完成/重试）、repair、导出 |
| sandbox | Docker/Mock sandbox 命令构建（安全参数）、执行、脱敏 |
| files | 项目文件树扫描、安全路径读取、导出 zip 过滤 |
| database | SQLite（better-sqlite3）+ 自动迁移 |

## 14. 生成模板要求

### 14.1 模板输入

模板输入来自 Agent Spec 或 Workflow Spec，不允许模板直接读取原始 prompt 拼接代码。

### 14.2 Agent 模板必须包含

1. OpenJiuwen Agent 创建代码。
2. 模型配置读取。
3. 工具注册。
4. main 入口。
5. 示例输入。
6. smoke test。
7. README。

### 14.3 Workflow 模板必须包含

1. OpenJiuwen Workflow 创建代码。
2. 节点/组件定义。
3. 边定义。
4. runner 入口。
5. 示例输入。
6. smoke test。
7. README。

### 14.4 README 必须包含

1. 项目说明。
2. 环境变量说明。
3. 安装命令。
4. 运行命令。
5. 测试命令。
6. 生成来源说明。
7. 如何切换 mock/真实 OpenJiuwen 配置。

## 15. 验收清单

### 15.1 产品验收

1. 用户能从首页输入 Agent 需求并开始生成。
2. 用户能从首页输入 Workflow 需求并开始生成。
3. 生成过程中能看到计划、文件、命令、测试事件。
4. 生成完成后能看到完成摘要。
5. Agent 能进入效果测试台并返回回复。
6. Workflow 能展示节点执行结果和最终输出。
7. 用户能查看源码。
8. 用户能导出代码包。
9. Skills/技能不作为 P0 独立创建流程。

### 15.2 技术验收

1. 生成代码基于 OpenJiuwen 能力。
2. OpenJiuwen 真实 API 已完成盘点并写入技术设计。
3. UI 不直接调用 OpenJiuwen SDK。
4. 生成模板不硬编码密钥。
5. smoke test 可运行。
6. mock 模式可跑通无密钥 Demo。
7. 导出包可解压并按 README 运行。

### 15.3 Demo 验收

1. 塔罗占卜 Agent 示例可以完整生成。
2. 塔罗占卜 Agent 至少包含一个工具调用。
3. 售前需求分析 Workflow 示例可以完整生成。
4. Workflow 至少包含 5 个节点。
5. 两个示例均能展示源码。
6. 两个示例均能展示运行记录。

## 16. 交付给技术设计 Agent 的任务拆分

### Task 1：OpenJiuwen API 盘点

输出：

```text
docs/technical/openjiuwen_api_inventory.md
```

必须回答：

1. Agent 如何创建。
2. Tool 如何注册。
3. Workflow 如何定义节点和边。
4. Runner 如何运行。
5. 如何配置模型。
6. 如何采集运行事件。
7. 本地最小可运行示例是什么。

### Task 2：系统架构设计

输出：

```text
docs/technical/agent_builder_architecture.md
```

必须包含：

1. 前端页面架构。
2. 后端服务模块。
3. 任务生命周期。
4. 事件流。
5. 文件存储方案。
6. OpenJiuwen 适配层。

### Task 3：Spec Schema 设计

输出：

```text
docs/technical/spec_schema.md
```

必须包含：

1. Agent Spec JSON Schema。
2. Workflow Spec JSON Schema。
3. 校验规则。
4. 示例 Spec。

### Task 4：生成模板设计

输出：

```text
docs/technical/code_generation_templates.md
```

必须包含：

1. Agent 工程模板。
2. Workflow 工程模板。
3. README 模板。
4. test 模板。
5. mock/真实 OpenJiuwen 切换方式。

### Task 5：运行与沙箱设计

输出：

```text
docs/technical/runtime_and_sandbox.md
```

必须包含：

1. 命令执行边界。
2. 环境变量注入方式。
3. 超时控制。
4. 日志采集。
5. 错误处理。

### Task 6：前端交互设计

输出：

```text
docs/technical/frontend_interaction_design.md
```

必须包含：

1. 首页。
2. 生成工作台。
3. Agent 测试台。
4. Workflow 运行页。
5. 源码查看页。
6. 事件状态展示。

### Task 7：验收测试设计

输出：

```text
docs/technical/acceptance_test_plan.md
```

必须包含：

1. 塔罗占卜 Agent E2E 测试。
2. 售前需求分析 Workflow E2E 测试。
3. mock 模式测试。
4. 导出包测试。
5. 错误场景测试。

## 17. 最终边界声明

Agent Builder Demo v0.3（P2 代码实现状态）的边界是：

```text
自然语言输入
-> Spec 确认页（用户可见 LLM 解析结果，可编辑 JSON）
-> 生成基于 OpenJiuwen 的 Python 工程（Template 或 OpenCode 引擎）
-> 展示生成过程（Timeline、文件变更、命令执行、测试结果）
-> 自动运行 smoke test
-> Agent 测试台 / Workflow 运行页
-> 查看源码（文件树 + 代码查看器）
-> 导出代码包（zip，过滤密钥）
```

不是：

```text
完整低代码平台
Skills 管理平台
多框架 Agent 平台
生产部署平台
企业权限平台
```

**与 PRD v0.3 原文的关键差异（P2 演进）：**

1. **Spec 解析统一走 LLM**：不再有针对 tarot/presales 的确定性关键词匹配。所有 prompt 均通过 LLM（或 mock LLM）解析。
2. **Draft/Spec 确认流程**：用户提交 prompt 后先看到 LLM 的解析结果，可编辑 Spec JSON 后再确认生成。
3. **双代码生成引擎**：TemplateEngine（确定性模板，快速稳定）和 OpenCodeEngine（真实 LLM + Docker 沙箱，高质量动态生成）。
4. **lint gate**：生成后检查必需文件、禁止框架（LangGraph/CrewAI/Dify）、密钥泄露。
5. **自动重试**：OpenCode 模式下 smoke test 失败自动重试（最多 N 次），带错误上下文反馈。

本版本成败标准：

> 是否能清晰演示”通过自然语言生成基于 OpenJiuwen 的 Python Agent/Workflow 代码，并能运行、测试、查看源码和导出”。
