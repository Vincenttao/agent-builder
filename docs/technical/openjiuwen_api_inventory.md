# OpenJiuwen API 盘点（P4 Agent 验收用）

版本: 1.0 | 日期: 2026-07-13 | 基于: openjiuwen 0.1.15

本文档锁定 P4 Agent Builder 生成 Agent 所需的 OpenJiuwen SDK API。
所有 import 路径、函数签名、返回结构均来自实际源码阅读（`agent-core/`），
供 `opencode-engine.ts` prompt、M4 product gate、smoke test 共同引用。

---

## 1. 包信息

| 项目 | 值 |
|---|---|
| 包名 | `openjiuwen` |
| 版本 | 0.1.15 |
| 安装 | `pip install /tmp/agent-core`（Docker sandbox） |
| 验证 | `python -c "from openjiuwen.core.single_agent import ReActAgent; print('OK')"` |
| 镜像 | `agent-builder-sandbox:latest`（`feature/openjiuwen-real` 分支） |

---

## 2. Agent API

### 2.1 AgentCard

```python
from openjiuwen.core.single_agent import AgentCard

# 最小创建
card = AgentCard(name="my_agent", description="My agent")

# 完整字段
card = AgentCard(
    id="custom_id",          # str, 默认 uuid
    name="agent_name",       # str
    description="...",       # str
)
```

### 2.2 ReActAgent

```python
from openjiuwen.core.single_agent import ReActAgent

agent = ReActAgent(card=card)
```

方法:
- `agent.configure(config: ReActAgentConfig) -> ReActAgent` — 设置配置
- `agent.ability_manager.add(tool_card)` — 注册工具
- `await agent.invoke(inputs, session=None) -> dict` — 执行 ReAct 循环
- `async for event in agent.stream(inputs, session=None) -> AsyncIterator` — 流式执行

### 2.3 ReActAgentConfig

```python
from openjiuwen.core.single_agent import ReActAgentConfig

config = (ReActAgentConfig()
    .configure_model_client(
        provider="deepseek",
        api_key=os.getenv("DEEPSEEK_API_KEY", ""),
        api_base=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
        model_name=os.getenv("AGENT_BUILDER_MODEL", "deepseek-v4-flash"),
    )
    .configure_prompt_template([
        {"role": "system", "content": SYSTEM_PROMPT}
    ])
    .configure_max_iterations(5)
)
```

字段:
- `max_iterations: int` — 最大 ReAct 轮次（默认 5）
- `parallel_tool_calls: bool` — 是否并行执行工具调用（默认 True）

---

## 3. Tool API

### 3.1 @tool 装饰器

```python
from openjiuwen.core.foundation.tool import tool

@tool(
    name="my_tool",
    description="工具描述",
)
def my_tool(param1: str, param2: int = 0) -> dict:
    """工具实现"""
    return {"result": f"{param1} + {param2}"}
```

行为:
- 自动从函数签名提取 JSON Schema（`CallableSchemaExtractor`）
- 返回 `LocalFunction` 实例，`.card` 属性是 `ToolCard`
- `@tool()` 不加参数也能工作（name=函数名, description=docstring）

### 3.2 Tool 注册

```python
from openjiuwen.core.runner import Runner, DEFAULT_RUNNER_CONFIG

# 初始化 Runner
runner_config = DEFAULT_RUNNER_CONFIG.model_copy(deep=True)
Runner.set_config(runner_config)

# 注册工具到 Runner 资源管理器
Runner.resource_mgr.add_tool(my_tool)       # my_tool 是 @tool 装饰后的函数

# 注册到 Agent
agent.ability_manager.add(my_tool.card)     # .card 是 ToolCard
```

---

## 4. LLM 配置

### 4.1 configure_model_client 参数

| 参数 | 类型 | 说明 |
|---|---|---|
| `provider` | str | provider 名，如 `"deepseek"`, `"openai"` |
| `api_key` | str | API key |
| `api_base` | str | Base URL |
| `model_name` | str | 模型名 |
| `verify_ssl` | bool | 默认 False |

### 4.2 环境变量约定（Agent Builder）

P4 生成 Agent 从以下环境变量读取配置：

```python
api_key = os.getenv("DEEPSEEK_API_KEY", "")
base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
model = os.getenv("AGENT_BUILDER_MODEL", "deepseek-v4-flash")
```

`DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` 由 `RunService.buildRunEnv()` 根据 `RUN_LLM_PROVIDER` 注入。

---

## 5. Invoke 返回结构

### 5.1 输入

```python
result = await agent.invoke({"query": "用户消息"})
# 或带 conversation_id:
result = await agent.invoke({"query": "...", "conversation_id": "sess_123"})
```

### 5.2 输出

```json
{
    "output": "Agent 的最终回复文本",
    "result_type": "answer"
}
```

可能值:
- `result_type: "answer"` — 正常完成
- `result_type: "error"` — 异常（此时 `output` 是错误消息）
- `result_type: "interrupt"` — 中断等待用户输入

### 5.3 如何提取

```python
result = await agent.invoke({"query": message})
reply = result.get("output", "")
result_type = result.get("result_type", "answer")

# 包装为平台要求格式
return {
    "reply": reply,
    "tool_calls": [],  # SDK 不直接返回 tool_calls 列表
}
```

**注意**：OpenJiuwen SDK 的 `invoke()` 返回不包含逐轮 tool_calls 列表。
如果需要 trace，生成代码需要在 `run_agent()` wrapper 中自行记录。
这是 M6 (ReAct trace) 的核心工作。

---

## 6. Workflow API

OpenJiuwen 提供 WorkflowComponent / Runner API（`openjiuwen.core.application.workflow_agent`），
但 P4 **不验收真实 Workflow**。Workflow 在 P4 中标记为 lightweight。
Workflow real path 决策见 M8。

---

## 7. 最小可运行样例

### 7.1 agent.py

```python
"""塔罗占卜 Agent — 基于 OpenJiuwen ReActAgent"""
import asyncio
import os
from openjiuwen.core.single_agent import AgentCard, ReActAgent, ReActAgentConfig
from openjiuwen.core.foundation.tool import tool
from openjiuwen.core.runner import Runner, DEFAULT_RUNNER_CONFIG

# ── 工具定义 ──
@tool(name="draw_tarot", description="随机抽取一张塔罗牌并返回牌名、正逆位、含义")
def draw_tarot(question: str) -> dict:
    import random
    cards = [
        {"name": "愚者", "meaning": "新的开始，冒险"},
        {"name": "魔术师", "meaning": "创造力，技能"},
        {"name": "女祭司", "meaning": "直觉，神秘"},
    ]
    card = random.choice(cards)
    upright = random.choice([True, False])
    return {
        "card": card["name"],
        "upright": upright,
        "meaning": card["meaning"] if upright else f"逆位：{card['meaning']}的阻碍",
        "question": question,
    }

# ── System Prompt ──
SYSTEM_PROMPT = """你是塔罗占卜师。流程：1. 询问用户问题 2. 调用 draw_tarot 抽牌 3. 解读牌面。"""

# ── Agent 初始化 ──
card = AgentCard(name="塔罗占卜 Agent", description="塔罗牌占卜助手")
agent = ReActAgent(card=card)
config = (ReActAgentConfig()
    .configure_model_client(
        provider="deepseek",
        api_key=os.getenv("DEEPSEEK_API_KEY", ""),
        api_base=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
        model_name=os.getenv("AGENT_BUILDER_MODEL", "deepseek-v4-flash"),
    )
    .configure_prompt_template([{"role": "system", "content": SYSTEM_PROMPT}])
    .configure_max_iterations(5))
agent.configure(config)

# ── 注册工具 ──
runner_config = DEFAULT_RUNNER_CONFIG.model_copy(deep=True)
Runner.set_config(runner_config)
Runner.resource_mgr.add_tool(draw_tarot)
agent.ability_manager.add(draw_tarot.card)

# ── 平台入口 ──
def run_agent(message: str) -> dict:
    return asyncio.run(_run(message))

async def _run(message: str) -> dict:
    result = await agent.invoke({"query": message})
    return {"reply": result.get("output", ""), "tool_calls": []}
```

### 7.2 Smoke test 关键断言

```python
from unittest.mock import patch

def test_run_agent_returns_reply():
    with patch.object(agent, 'invoke') as mock_invoke:
        mock_invoke.return_value = {"output": "测试回复", "result_type": "answer"}
        result = run_agent("测试问题")
        assert "reply" in result
        assert result["reply"] == "测试回复"

def test_manifest_has_correct_runtime_mode():
    import json
    with open("agent_builder_manifest.json") as f:
        m = json.load(f)
    assert m["runtime"]["mode"] == "real_openjiuwen"
    assert m["engine"] == "opencode"
```

### 7.3 环境变量

```bash
# 由 RunService.buildRunEnv() 注入 Docker 沙箱
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
AGENT_BUILDER_MODEL=deepseek-v4-flash
```

---

## 8. 已知限制

1. **invoke() 不返回逐轮 trace**：需要 wrapper 自行记录 tool calls。
2. **无 `__version__`**：openjiuwen 没有 `__version__` 属性，版本通过 `pyproject.toml` 确认。
3. **依赖重**：完整安装包含 sqlalchemy, pymilvus, transformers 等，镜像约 2GB。
4. **Workflow API 未盘点**：不在 P4 范围。

---

## 9. 与生成系统的联动清单

本文档完成后，以下文件必须同步更新：

- [ ] `apps/api/src/codegen/opencode-engine.ts:buildPrompt()` — import 示例和代码模板
- [ ] `apps/api/src/codegen/real-openjiuwen-gate.ts` — gate 扫描规则（M4）
- [ ] smoke test prompt 模板 — opencode 生成的测试策略
- [ ] README prompt 模板 — 生成的 README 包含正确的安装/配置说明
- [ ] `docs/technical/p4_work_items.md` — 如有 API 名称变化同步更新
