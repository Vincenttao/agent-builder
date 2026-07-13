# PRD v0.3：Agent Builder Demo - 基于 OpenJiuwen 的自然语言生成 Agent/Workflow Python 代码

## 0. 文档目的

本文档是 Agent Builder Demo v0.3 的产品需求定义。技术设计 Agent 基于本文档完成了系统架构、模块设计、接口设计和代码实现。

**当前代码实现边界（P4 完成，2026-07-13）：**

- 核心产品闭环已具备：首页输入 → Spec 确认 → 代码生成 → **产物 Gate** → smoke test → 测试台/运行页 → 源码查看 → 导出。
- **P4 完成**：真实 OpenJiuwen 0.1.15 集成、fail-loud 默认、产物 Gate (12 规则)、RUN_LLM_* 契约、ReAct trace、项目骨架、API 盘点。详见 `docs/technical/p4_work_items.md` §17 验收清单。
- Spec 解析统一走 LLM parser，不再有针对 demo prompt 的确定性关键词绕过。
- `OpenCodeEngine` 是唯一真实 OpenJiuwen 验收路径；`TemplateEngine` 降级为 lightweight/test-only。
- OpenCode 真实链路 **fail-loud 已落地**：`OPENCODE_ALLOW_FALLBACK=false` 默认，fallback endpoint 需 `ENABLE_TEMPLATE_FALLBACK=true` 启用。
- Agent 真实 OpenJiuwen 约束已提升为代码级 gate（`real-openjiuwen-gate.ts`）+ 项目骨架（`agent-real-openjiuwen/`）。
- Workflow 真实 OpenJiuwen 集成不在 P4 范围；Workflow 标记为 lightweight。

本 PRD 的核心不是完整商业化平台，而是一个可演示的 Demo：

> 用户用自然语言描述想要的智能体或工作流，系统自动生成基于 OpenJiuwen 能力的 Python 代码，展示生成过程，自动运行测试，并允许查看源码与运行效果。

### 0.1 待完成项目（P4 规划）

以下需求已明确但尚未完全实现或未在所有分支落地。按优先级排列：

| # | 项目 | 优先级 | 状态 | 说明 |
|---|---|---|---|---|
| **R1** | **禁用真实链路自动 fallback** | P0 | 待实现/待收紧 | `OpenCodeEngine` 失败必须失败，不得自动生成 TemplateEngine 版本。后端 fallback endpoint 只能在显式开发开关下启用，前端默认隐藏。 |
| **R2** | **TemplateEngine 降级为 test-only/lightweight** | P0 | 待实现 | Template 产物 manifest 必须标记 `openjiuwen-compatible` + `mock_compatible` 或 `lightweight`，不得标记 `runtime.mode=real`。 |
| **R3** | **Agent 真实 OpenJiuwen 产物验收 gate** | P0 | 待实现 | 生成代码必须 import `openjiuwen.core.single_agent.ReActAgent`，使用 `@tool`，调用 `agent.invoke()`，且不得生成 `src/openjiuwen_runtime/`。 |
| **R4** | **运行阶段真实 LLM 环境变量契约** | P0 | 待实现 | Agent/Workflow runtime 使用独立 `RUN_LLM_*` 环境变量，不复用或隐式依赖 `OPENCODE_*`。 |
| **R5** | **OpenJiuwen API 盘点文档** | P0 | 待完成 | 必须产出 `docs/technical/openjiuwen_api_inventory.md`，锁定 OpenJiuwen 版本、import、模型配置、tool 注册、runner API。 |
| R6 | **ReAct trace 返回与前端展示** | P1 | 待实现 | 测试台不能只展示最终 `reply`，需展示 tool call、tool result、iteration、错误信息。 |
| R7 | **Workflow 真实 OpenJiuwen 集成** | P1 | 待实现 | Workflow 需对接真实 Workflow/Component/Runner API。lightweight workflow 不计入真实验收。 |
| R8 | **导出包真实运行契约** | P1 | 待实现 | 明确导出包是依赖沙箱预装 OpenJiuwen，还是在 `pyproject.toml` 中声明可本地安装依赖。 |
| R9 | **真实链路 E2E 验收命令** | P1 | 待实现 | 提供可重复命令验证 LLM Spec -> OpenCode -> OpenJiuwen Agent -> runtime LLM -> ReAct trace。 |

### 0.2 引擎策略

| 引擎 | 用途 | OpenJiuwen | 是否计入真实验收 |
|---|---|---|---|
| `OpenCodeEngine` | 主开发线、真实调试、Demo 验收 | Docker 沙箱预装真实 OpenJiuwen SDK | 是 |
| `TemplateEngine` | 单元测试、集成测试夹具、本地 lightweight 示例 | 项目内 `openjiuwen_runtime` 兼容层 | 否 |
| fallback endpoint | 特殊开发救援路径 | TemplateEngine | 默认禁用，不计入真实验收 |

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
4. 真实验收路径必须通过 `OpenCodeEngine` 生成 **基于真实 OpenJiuwen 框架** 的 Python 工程代码。
5. 生成的 Agent 必须包含 **真实的 ReAct 循环**（Think → Act → Observe → Repeat），由 LLM 驱动工具调用。
6. **运行阶段必须接入真实 LLM**：Agent 在测试台运行时，通过环境变量注入的 API key 调用大模型，不得返回占位/模拟文案。
7. 系统展示生成过程，包括计划、文件变更、命令执行、测试结果。
8. 系统自动运行一次 smoke test。
9. 系统提供效果测试台。
10. 系统提供源码查看，包括文件树和代码查看。
11. 系统提供导出代码包能力。
12. 系统明确记录生成版本，并支持查看修改记录。

### 4.2 P0 不支持

1. 不做 Skills/技能的独立创建、管理、测试和导出。
2. 不做 Agent Store。
3. 不做多租户、企业权限、计费、审计等平台能力。
4. 不做云端生产部署。
5. 不支持 LangGraph、CrewAI、OpenAI Agents SDK、Dify 等非 OpenJiuwen 框架生成。
6. 不支持复杂多人协作编辑。
7. 不支持任意前端应用生成，本 Demo 只关注 Agent/Workflow Python 工程。
8. 不支持把 TemplateEngine 结果包装成真实 OpenJiuwen 结果。
9. 不支持真实链路失败后静默 fallback；失败必须暴露给调试者。

### 4.3 P1 可延后

1. 技能市场或技能包引用。
2. 多 Agent 协作。
3. 可视化拖拽编辑 Workflow。
4. 代码在线编辑并回写生成上下文。
5. 部署到远端环境。

### 4.4 硬性限制条件

以下限制对 P4 真实链路验收生效：

1. `CODEGEN_ENGINE=opencode` 且 `OPENCODE_REQUIRE_REAL=true` 时，OpenCode 不可用、Docker 不可用、OpenJiuwen SDK 不可用、真实 LLM 配置缺失或生成产物不合格，都必须导致生成失败。
2. `OPENCODE_ALLOW_FALLBACK` 默认必须为 `false`。只有显式开发开关允许 fallback endpoint，且 fallback 产物必须标记为 lightweight/test-only。
3. 真实 OpenJiuwen Agent 产物不得包含 `src/openjiuwen_runtime/`。
4. 真实 OpenJiuwen Agent 产物必须直接 import OpenJiuwen SDK，并使用 `ReActAgent`、`@tool`、`agent.invoke()`。
5. 真实 runtime LLM 配置必须使用 `RUN_LLM_PROVIDER`、`RUN_LLM_API_KEY`、`RUN_LLM_BASE_URL`、`RUN_LLM_MODEL` 等运行期变量；OpenCode 生成期变量不得被隐式当作运行期变量。
6. smoke test 可以 mock 外部模型调用，但必须验证真实 OpenJiuwen 入口、工具注册和 invoke 调用路径。测试完全跳过 Agent/Workflow 核心逻辑不得算通过。
7. UI、API 返回、manifest、版本摘要必须清楚区分 `real_openjiuwen`、`lightweight`、`mock_compatible`、`test_only`。

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

Agent Builder Demo 的真实验收路径必须生成基于真实 OpenJiuwen SDK 的 Python 工程。

边界说明：

1. UI 不直接调用 OpenJiuwen SDK。
2. API 编排层不在主进程执行生成代码，只负责调度沙箱、记录事件和读取 manifest。
3. 生成产物可以直接 import OpenJiuwen SDK；SDK 版本、import 路径和最小代码样例必须由 `docs/technical/openjiuwen_api_inventory.md` 固化。
4. 平台侧可以封装 sandbox、manifest、环境变量注入和产物验收 gate；不得用项目内 mock adapter 伪装真实 OpenJiuwen。
5. `src/openjiuwen_runtime/` 只允许出现在 TemplateEngine/lightweight 测试产物中，不允许出现在真实 OpenCode 验收产物中。

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

### 8.3 引擎与运行时边界

P4 后的引擎语义必须固定如下：

| 路径 | 适配方式 | 安装位置 | 真实验收 |
|---|---|---|
| OpenCode real path | 真实 OpenJiuwen SDK | Docker 镜像或导出包依赖 | 是 |
| TemplateEngine | 自研 `openjiuwen_runtime` 兼容层 | 项目内 | 否 |
| fallback endpoint | TemplateEngine 重新生成 | 项目内 | 否，默认禁用 |

真实 OpenJiuwen 产物必须使用以下 API 形态（最终以 API 盘点文档为准）：

```python
from openjiuwen.core.single_agent import AgentCard, ReActAgent, ReActAgentConfig
from openjiuwen.core.foundation.tool import tool
from openjiuwen.core.runner import Runner, DEFAULT_RUNNER_CONFIG

@tool(name="my_tool", description="...")
def my_tool(**kwargs): ...

card = AgentCard(name="...", description="...")
agent = ReActAgent(card=card)
config = (ReActAgentConfig()
    .configure_model_client(provider="deepseek", ...)
    .configure_prompt_template([{"role": "system", "content": SYSTEM_PROMPT}])
    .configure_max_iterations(5))
agent.configure(config)

Runner.set_config(DEFAULT_RUNNER_CONFIG.model_copy(deep=True))
Runner.resource_mgr.add_tool(my_tool)
agent.ability_manager.add(my_tool.card)

def run_agent(message: str) -> dict:
    result = await agent.invoke({"query": message})
    return {"reply": result.get("output", "")}
```

### 8.4 生成代码中的 OpenJiuwen 约束（P4）

真实验收产物必须通过 OpenJiuwen SDK 创建和运行。

**必须**：

1. 使用 `ReActAgent` / `ReActAgentConfig` 创建 Agent（不得自写 Agent 循环）。
2. 使用 `@tool` 装饰器定义工具（openjiuwen 自动从函数签名提取 JSON Schema）。
3. 使用 `agent.invoke()` 异步执行 ReAct 循环。
4. 使用 `asyncio.run()` 将异步 invoke 包装为同步 `run_agent()` 入口。
5. API key / base URL / model 从环境变量读取，禁止硬编码。
6. 生成 `agent_builder_manifest.json`，明确 `runtime.framework=openjiuwen`、`runtime.mode=real_openjiuwen`、`engine=opencode`。
7. 生成 smoke test，测试真实 OpenJiuwen import、工具注册和 invoke 调用路径。

**禁止**：

1. 生成 LangGraph/CrewAI/Dify 等框架工程。
2. 只生成伪代码或 mock/stub adapter。
3. 用 if-else 规则引擎替代 LLM 驱动的 ReAct 循环。
4. 只生成 README 而不生成可运行 Python。
5. 在测试中完全跳过 Agent/Workflow 核心逻辑。
6. 把模型密钥硬编码进源码。
7. 使用 `from src.xxx` 导入路径（会导致 ModuleNotFoundError）。
8. 在真实验收产物中生成 `src/openjiuwen_runtime/`。
9. 把 TemplateEngine/lightweight 产物标记为 `real_openjiuwen`。
10. OpenCode 失败后自动激活 TemplateEngine 版本。

### 8.5 TemplateEngine 限制

`TemplateEngine` 只允许用于以下场景：

1. 单元测试和集成测试夹具。
2. 无 Docker、无真实 LLM、无 OpenJiuwen SDK 时的本地开发 smoke。
3. lightweight-runtime 示例，用于验证平台文件树、manifest、源码查看、导出和测试台基础能力。

TemplateEngine 产物必须满足：

1. manifest 写明 `runtime.framework=openjiuwen-compatible`。
2. manifest 写明 `runtime.mode=lightweight` 或 `runtime.mode=mock_compatible`。
3. UI 明确展示“轻量/测试运行时”，不得展示为真实 OpenJiuwen。
4. 不得作为真实链路失败后的默认 fallback。

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

描述：真实验收路径通过 OpenCode 生成基于真实 OpenJiuwen SDK 的 Agent Python 工程。

真实 OpenCode 产物标准目录：

```text
generated/{generation_id}/
├── agent_builder_manifest.json    # 平台 manifest（schema v1.0）
├── pyproject.toml
├── README.md
├── src/
│   ├── agents/
│   │   └── agent.py              # Agent 入口: run_agent(), @tool 定义, ReActAgent 创建
│   └── main.py                   # CLI 入口
└── tests/
    └── test_agent_smoke.py
```

说明：
- `openjiuwen` 框架已在 Docker 沙箱镜像中预装，无需作为项目文件生成。
- `agent.py` 直接 import `openjiuwen.core.single_agent.ReActAgent`。
- `.env.example` / `config/` 目录在 P3 中非强制 — 凭证通过 Docker 环境变量注入。
- `examples/` 目录的示例输入已通过 `agent_builder_manifest.json` 的 `example_input` 字段提供。
- TemplateEngine 可以生成 `src/openjiuwen_runtime/`，但该产物只属于 lightweight/test-only，不适用本条真实验收。

验收标准：

1. 必须生成 `agent_builder_manifest.json`（含 `entrypoint`、`test_command`、`example_input`）。
2. 必须生成 `pyproject.toml`（`build-backend: setuptools.build_meta`）。
3. 必须生成 `README.md`。
4. 必须生成 `src/agents/agent.py`（包含 `run_agent()` 入口函数）。
5. 必须使用 `from openjiuwen.core.single_agent import ReActAgent`（不得自写循环）。
6. 必须生成 smoke test（`tests/test_agent_smoke.py`）。
7. 必须能通过 python_runner 启动示例输入并返回 LLM 驱动的真实回复。
8. 不得生成 `src/openjiuwen_runtime/`。
9. 产物扫描必须验证 `@tool`、`ReActAgent`、`agent.invoke()` 三类关键代码点。

### FR-004：Workflow 代码生成

描述：系统生成 Workflow Python 工程。P4 前，TemplateEngine/lightweight workflow 只能用于平台能力验证；真实验收必须对接 OpenJiuwen Workflow/Component/Runner API。

lightweight 当前目录：

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
8. 真实 OpenJiuwen Workflow 验收不得依赖 `src/openjiuwen_runtime/`。
9. 真实 Workflow 产物必须使用 API 盘点文档确认的 OpenJiuwen Workflow/Component/Runner API。

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
5. 真实链路 smoke test 可 mock 外部 LLM 网络调用，但必须覆盖真实 OpenJiuwen import、工具注册和 invoke 调用路径。
6. 无真实模型配置时，只允许运行 test-only/lightweight 模式；不得标记为真实 OpenJiuwen Demo 通过。
7. OpenCode 真实链路 smoke test 失败不得 promote active version。

### FR-007：Agent 效果测试台

描述：用户可以在生成完成后输入消息测试 Agent 回复效果。

页面参考 `4生成效果.bmp`。

验收标准：

1. 显示 Agent 名称、图标和模型名称。
2. 显示可用工具数量。
3. 用户输入消息后可看到 Agent 回复。
4. 若 Agent 调用工具，运行记录中可查看工具名称、输入、输出。
5. 支持重新运行或清空会话。
6. 真实 OpenJiuwen Agent 测试台必须展示 ReAct trace：iteration、tool call、tool result、最终 reply、失败原因。
7. lightweight/test-only 运行结果必须有明确标识。

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
4. README 必须说明运行时依赖：依赖沙箱预装 OpenJiuwen，或通过 `pyproject.toml` 安装 OpenJiuwen。
5. 若声明“本地可运行”，导出包必须能在本地解压并按 README 运行 smoke test。
6. 若只声明“沙箱可运行”，导出包不得承诺脱离沙箱可直接运行。

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
3. 真实 OpenJiuwen Demo 必须具备真实模型密钥、Docker、OpenCode、OpenJiuwen SDK 和网络访问。
4. Demo 环境无真实模型密钥时，只能运行 test-only/lightweight 流程，并必须在 UI、manifest、版本摘要中明确标识。
5. 真实链路失败时，系统必须展示失败阶段、诊断项和日志入口，不得自动 fallback 掩盖问题。

### 10.2 可维护性

1. OpenCode prompt、真实产物验收 gate、运行器、前端展示层分离。
2. OpenJiuwen API 变化时，必须先更新 API 盘点文档，再更新 prompt、产物 gate 和 smoke test。
3. Spec schema 必须版本化。
4. TemplateEngine 与真实 OpenCode 产物不得共享“真实运行时”状态标记。

### 10.3 安全性

1. 不允许把 API Key 写入生成源码。
2. 运行命令必须限制在生成项目目录内。
3. 导出包不得包含 `.env`、缓存、日志中的密钥。
4. 用户输入不得直接拼接为 shell 命令。

### 10.4 可测试性

1. 需求解析、Spec 校验、模板渲染、导出打包都应有单元测试。
2. Agent 和 Workflow 至少各有一个端到端 smoke test。
3. TemplateEngine 需要 lightweight/test-only 测试。
4. OpenCode real path 需要可跳过的真实 E2E：缺少密钥、Docker、OpenCode 或 OpenJiuwen SDK 时 skip 并输出缺失项；环境齐备时必须真实运行。
5. 真实 Agent 产物 gate 需要单测覆盖：缺失 `ReActAgent`、缺失 `@tool`、缺失 `agent.invoke()`、出现 `src/openjiuwen_runtime/` 都必须失败。

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
| codegen | OpenCodeEngine（真实 LLM Docker 沙箱）+ TemplateEngine（test-only/lightweight）+ 产物验收 gate |
| orchestration | 异步 pipeline（生成 -> 产物 gate -> lint -> smoke test -> 完成/失败）、repair、导出；fallback 默认禁用 |
| sandbox | Docker/Mock sandbox 命令构建（安全参数）、执行、脱敏 |
| files | 项目文件树扫描、安全路径读取、导出 zip 过滤 |
| database | SQLite（better-sqlite3）+ 自动迁移 |

## 14. 生成模板要求

### 14.1 模板输入

模板输入来自 Agent Spec 或 Workflow Spec，不允许模板直接读取原始 prompt 拼接代码。

### 14.2 真实 Agent 生成约束

1. 真实 OpenJiuwen Agent 创建代码：`ReActAgent`、`ReActAgentConfig`。
2. `@tool` 工具定义和注册。
3. `agent.invoke()` 调用路径。
4. 运行期模型配置读取：`RUN_LLM_*`。
5. main 入口。
6. manifest 示例输入。
7. smoke test。
8. README。
9. 不得生成 `src/openjiuwen_runtime/`。

### 14.3 真实 Workflow 生成约束

1. OpenJiuwen Workflow/Component/Runner 创建代码。
2. 节点/组件定义。
3. 边定义。
4. runner 入口。
5. 示例输入。
6. smoke test。
7. README。
8. 不得生成 `src/openjiuwen_runtime/`。

### 14.4 TemplateEngine/lightweight 限制

1. TemplateEngine 可以保留项目内 `src/openjiuwen_runtime/`。
2. TemplateEngine 产物必须标记为 lightweight/test-only。
3. TemplateEngine 产物不得出现在真实 OpenJiuwen 验收报告中。
4. TemplateEngine 不得作为 OpenCode 真实链路的默认 fallback。

### 14.5 README 必须包含

1. 项目说明。
2. 环境变量说明。
3. 安装命令。
4. 运行命令。
5. 测试命令。
6. 生成来源说明。
7. 当前运行模式：`real_openjiuwen`、`lightweight`、`mock_compatible` 或 `test_only`。
8. 若为真实 OpenJiuwen：OpenJiuwen 依赖来源、运行期 LLM 环境变量、沙箱/本地运行限制。

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

1. OpenCode real path 生成代码基于真实 OpenJiuwen SDK。
2. OpenJiuwen 真实 API 已完成盘点并写入技术设计。
3. UI 不直接调用 OpenJiuwen SDK。
4. 生成模板不硬编码密钥。
5. smoke test 可运行。
6. TemplateEngine/lightweight 模式不得计入真实 OpenJiuwen 验收。
7. 真实链路失败不得自动 fallback。
8. 导出包运行能力与 README 声明一致。

### 15.3 Demo 验收

1. 塔罗占卜 Agent 示例可以完整生成。
2. 塔罗占卜 Agent 至少包含一个工具调用。
3. 售前需求分析 Workflow 示例可以完整生成。
4. Workflow 至少包含 5 个节点。
5. 两个示例均能展示源码。
6. 两个示例均能展示运行记录。
7. 真实 Agent 示例必须展示 ReAct trace。
8. 若 Workflow 仍为 lightweight，Demo 必须明确标识“非真实 OpenJiuwen Workflow”。

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

1. OpenCode real path prompt 契约。
2. Agent 真实 OpenJiuwen 产物 gate。
3. Workflow 真实 OpenJiuwen 产物 gate。
4. TemplateEngine lightweight/test-only 边界。
5. README 模板。
6. smoke test 模板。

### Task 5：运行与沙箱设计

输出：

```text
docs/technical/runtime_and_sandbox.md
```

必须包含：

1. 命令执行边界。
2. 生成期 `OPENCODE_*` 与运行期 `RUN_LLM_*` 环境变量注入方式。
3. 超时控制。
4. 日志采集。
5. 错误处理。
6. fallback 默认禁用策略。

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
3. lightweight/test-only 模式测试。
4. 导出包测试。
5. 错误场景测试。

## 17. 最终边界声明

Agent Builder Demo v0.3 在 P4 之前的真实边界是：

```text
自然语言输入
-> Spec 确认页（用户可见 LLM 解析结果，可编辑 JSON）
-> OpenCode real path 生成真实 OpenJiuwen Agent 工程
-> 产物 gate 验证 OpenJiuwen SDK / @tool / agent.invoke / 无 openjiuwen_runtime
-> Docker 沙箱 smoke test
-> Agent 测试台运行真实 runtime LLM
-> 展示 ReAct trace
-> 查看源码（文件树 + 代码查看器）
-> 导出代码包（zip，过滤密钥，并说明运行依赖）
```

不是：

```text
完整低代码平台
Skills 管理平台
多框架 Agent 平台
生产部署平台
企业权限平台
TemplateEngine fallback 演示平台
```

本版本成败标准：

> 是否能在真实配置下，通过 OpenCode 生成直接使用 OpenJiuwen SDK 的 Agent 工程，并由真实 runtime LLM 驱动 ReAct 执行；TemplateEngine/lightweight 结果不得计入该成功标准。

## 18. P4 实现对照 Review（2026-07-13）

### 18.1 当前可保留能力

| 能力 | 当前状态 | P4 口径 |
|---|---|---|
| 首页 -> Draft/Spec -> 生成工作台 | 已具备 | 保留 |
| Spec 解析统一走 LLM parser 或测试 parser | 已具备 | 保留 |
| OpenCode real generation | 已具备基础路径 | 增加 fail-loud 和产物 gate |
| Docker sandbox smoke test | 已具备 | 增加真实 OpenJiuwen gate |
| python_runner 运行 active version | 已具备 | 增加 runtime LLM 和 ReAct trace 契约 |
| TemplateEngine | 已具备 | 降级为 test-only/lightweight |

### 18.2 P4 必须修正

| 问题 | P4 处理 |
|---|---|
| TemplateEngine 产物可能被标记为 `runtime.mode=real` | 改为 `openjiuwen-compatible` + `lightweight` 或 `mock_compatible` |
| OpenCode 失败可被 fallback 掩盖 | 默认禁用 fallback，真实链路 fail loud |
| 真实 OpenJiuwen 约束主要靠 prompt | 增加代码级产物 gate |
| 运行期 LLM 复用生成期 `OPENCODE_*` | 拆出 `RUN_LLM_*` |
| Agent 测试台只展示最终 reply | 增加 ReAct trace |
| Workflow 真实 OpenJiuwen 未完成 | 明确不计入真实验收，或在 P4 单独实现 |
| API 盘点文档缺失 | 新增 `docs/technical/openjiuwen_api_inventory.md` |

### 18.3 P4 工作项索引

P4 详细实现内容见：

```text
docs/technical/p4_work_items.md
```

该文档按以下里程碑拆分：

1. 真实链路失败不被 fallback 掩盖。
2. TemplateEngine 降级为 test-only/lightweight。
3. OpenJiuwen API 盘点与版本锁定。
4. 真实 Agent 产物 gate。
5. 运行期真实 LLM 契约。
6. ReAct trace 契约与 UI 展示。
7. 真实链路 E2E。
8. Workflow real path 决策。
