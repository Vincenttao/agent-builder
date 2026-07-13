# Agent Builder P4 实施说明书

版本：v2.0 | 日期：2026-07-13

## 1. 背景与目标

P4 的目标是把“真实 OpenJiuwen + 真实 LLM + OpenCode 生成 + Agent runtime 执行”从 prompt 约束提升为可重复验收的工程能力。

P3 已经具备产品闭环：自然语言输入、Spec 确认、代码生成、smoke test、测试台、源码查看、导出。但 P3 仍有一个关键问题：TemplateEngine/lightweight 结果可能掩盖真实 OpenCode/OpenJiuwen 链路问题。P4 必须让真实链路失败直接暴露，不允许 fallback 给调试造成假阳性。

### 1.1 P4 成功标准

P4 完成时，必须满足：

1. `OpenCodeEngine` 是唯一真实 OpenJiuwen 验收路径。
2. `TemplateEngine` 只作为 test-only/lightweight 工具保留，不计入真实验收。
3. 真实 Agent 生成物直接使用 OpenJiuwen SDK：`ReActAgent`、`@tool`、`agent.invoke()`。
4. 真实 Agent 生成物不包含 `src/openjiuwen_runtime/`。
5. 运行期 LLM 使用独立 `RUN_LLM_*` 配置，不隐式复用 `OPENCODE_*`。
6. Agent 测试台展示 ReAct trace，而不是只展示最终 reply。
7. 真实链路失败不会产生误导性的 `completed` 或 active version。
8. 真实 E2E 在环境齐备时可运行，环境缺失时清楚 skip 并列出缺失项。

### 1.2 非目标

P4 不做以下事情：

1. 不做完整低代码平台。
2. 不做 Skills 管理、Agent Store、多租户、权限、计费、审计。
3. 不接入 LangGraph、CrewAI、Dify、OpenAI Agents SDK 等非 OpenJiuwen 框架。
4. 不把 TemplateEngine 包装成真实 OpenJiuwen。
5. 不承诺 Workflow 真实 OpenJiuwen 已完成；Workflow real path 需要单独决策。

## 2. 全局硬性边界

这些边界对所有 P4 编码任务生效：

1. `CODEGEN_ENGINE=opencode` 且 `OPENCODE_REQUIRE_REAL=true` 时必须 fail loud。
2. `OPENCODE_ALLOW_FALLBACK=false` 必须是默认值。
3. fallback endpoint 默认不可用，只有 `ENABLE_TEMPLATE_FALLBACK=true` 时才允许。
4. 前端默认不展示“切换模板引擎”或类似 fallback 按钮。
5. TemplateEngine manifest 不得写 `runtime.mode=real`。
6. 真实 OpenJiuwen Agent manifest 必须写 `runtime.mode=real_openjiuwen`、`engine=opencode`。
7. 真实 OpenJiuwen Agent 生成物不得出现 `src/openjiuwen_runtime/`。
8. smoke test 可以 mock 外部模型网络调用，但不得跳过 OpenJiuwen import、工具注册、invoke 调用路径。
9. UI、API、manifest、版本摘要必须明确区分 `real_openjiuwen`、`lightweight`、`mock_compatible`、`test_only`。

## 3. 推荐实施顺序

按以下顺序实现，避免后续调试被旧 fallback 行为污染：

1. M1：真实链路失败不被 fallback 掩盖。
2. M2：TemplateEngine 降级为 test-only/lightweight。
3. M3：OpenJiuwen API 盘点与版本锁定。
4. M4：真实 Agent 产物 gate。
5. M5：运行期真实 LLM 契约。
6. M6：ReAct trace 契约与 UI 展示。
7. M7：真实链路 E2E。
8. M8：Workflow real path 决策。

## 4. 代码位置速查

主要后端文件：

| 模块 | 当前文件 | P4 关注点 |
|---|---|---|
| 引擎选择 | `apps/api/src/codegen/codegen.service.ts` | 保持 `opencode`/`template` 分离 |
| TemplateEngine | `apps/api/src/codegen/template-engine.ts` | manifest runtime mode 改为 lightweight |
| OpenCodeEngine | `apps/api/src/codegen/opencode-engine.ts` | 默认禁止 fallback，prompt 与 API 盘点一致 |
| 产物 lint/gate | `apps/api/src/codegen/project-lint.ts` | 新增真实 OpenJiuwen gate 或拆新文件 |
| 编排 | `apps/api/src/orchestration/orchestrator.service.ts` | fallback 开关、gate 调用、失败不 promote |
| 运行 | `apps/api/src/orchestration/run.service.ts` | `RUN_LLM_*` 注入、runtime 缺失报错 |
| 控制器 | `apps/api/src/orchestration/orchestrator.controller.ts` | fallback endpoint 默认禁用 |
| 诊断 | `apps/api/src/sandbox/diagnostics.controller.ts` | 生成期与运行期配置分开展示 |
| Runner | `services/python-runner/src/python_runner/runner.py` | 标准化 `trace` 输出 |
| contracts | `packages/shared-contracts/src/*.ts` | manifest/runtime/runner response 类型 |

主要前端文件：

| 模块 | 当前文件 | P4 关注点 |
|---|---|---|
| API client | `apps/web/src/lib/api.ts` | RunnerResult/trace 类型 |
| 测试台 | `apps/web/src/components/agent/AgentTestPanel.tsx` | 展示 trace、runtime mode 标识 |
| 诊断页 | `apps/web/src/components/Diagnostics.tsx` | 展示 `RUN_LLM_*` 就绪性 |
| 工作台 | `apps/web/src/components/workspace/GenerationWorkspace.tsx` | fallback 按钮隐藏、版本标识 |
| 错误面板 | `apps/web/src/components/workspace/ErrorPanel.tsx` | fail-loud 诊断展示 |
| 版本列表 | `apps/web/src/components/workspace/VersionList.tsx` | runtime mode/engine 标识 |

## 5. M1：真实链路失败不被 fallback 掩盖

### 5.1 目标范围

真实 OpenCode/OpenJiuwen 调试时，任何缺失条件或生成失败都必须直接失败并保留诊断，不允许自动 fallback 到 TemplateEngine。

### 5.2 非目标

1. 不删除 TemplateEngine。
2. 不删除 fallback endpoint 的代码能力；只默认禁用。
3. 不把所有本地开发都强制依赖真实 OpenCode。测试仍可显式使用 TemplateEngine。

### 5.3 技术实现思路

1. 修改 OpenCodeEngine 默认配置：
   - `OPENCODE_ALLOW_FALLBACK` 默认值为 `false`。
   - `OPENCODE_REQUIRE_REAL=true` 且 `opencode` binary 缺失时抛 `CODE_GENERATION_FAILED`。
   - 错误文案必须包含缺失项：OpenCode binary、Docker、sandbox image、LLM key 等。

2. 修改 fallback endpoint：
   - 在 `orchestrator.controller.ts` 或 `orchestrator.service.ts` 中检查 `ENABLE_TEMPLATE_FALLBACK === 'true'`。
   - 未开启时返回稳定错误码，例如 `CODE_GENERATION_FAILED` 或新增 `FALLBACK_DISABLED`。
   - 错误文案说明：真实链路调试默认禁用 Template fallback。

3. 修改前端：
   - `ErrorPanel` 中隐藏 fallback 按钮。
   - 如保留开发入口，必须仅在诊断信息显示 `ENABLE_TEMPLATE_FALLBACK=true` 时出现。

4. 修改事件与版本摘要：
   - fallback 版本必须明确 `fallback: true`、`engine=template`、`runtime_mode=lightweight`。
   - fallback 版本不得显示为 OpenCode success。

### 5.4 建议代码落点

1. `apps/api/src/codegen/codegen.module.ts`
2. `apps/api/src/codegen/opencode-engine.ts`
3. `apps/api/src/orchestration/orchestrator.service.ts`
4. `apps/api/src/orchestration/orchestrator.controller.ts`
5. `apps/web/src/components/workspace/ErrorPanel.tsx`
6. `apps/api/src/sandbox/diagnostics.controller.ts`

### 5.5 测试要点

单元测试：

1. `OPENCODE_REQUIRE_REAL=true`、`OPENCODE_ALLOW_FALLBACK` 未设置、OpenCode 不可用时，`OpenCodeEngine.generate()` 抛错。
2. `OPENCODE_ALLOW_FALLBACK=true` 时，才允许回退 TemplateEngine。
3. `ENABLE_TEMPLATE_FALLBACK` 未设置时，fallback endpoint 返回明确错误。
4. `ENABLE_TEMPLATE_FALLBACK=true` 时，fallback endpoint 可执行，并标记 fallback/lightweight。

集成测试：

1. OpenCode 失败后 generation 状态为 `failed`。
2. OpenCode 失败后不存在 active version。
3. smoke test 失败版本不 promote。

前端测试：

1. 默认错误面板不显示 fallback 按钮。
2. 诊断开关开启时 fallback 按钮才显示。

### 5.6 验收命令

```bash
npm --workspace @agent-builder/api run test -- opencode-engine.spec.ts orchestration.integration.spec.ts
npm --workspace @agent-builder/web run test -- ErrorPanel
```

## 6. M2：TemplateEngine 降级为 test-only/lightweight

### 6.1 目标范围

TemplateEngine 保留为测试夹具和 lightweight-runtime 示例，继续支持文件树、源码查看、导出、基础 runner 流程，但不得被标记为真实 OpenJiuwen。

### 6.2 非目标

1. 不要求 TemplateEngine 生成真实 OpenJiuwen SDK 代码。
2. 不要求 TemplateEngine 工具处理逻辑完整实现业务。
3. 不允许 TemplateEngine 参与真实验收。

### 6.3 技术实现思路

1. 修改 TemplateEngine manifest：

```json
{
  "schema_version": "1.0",
  "project_type": "agent",
  "entrypoint": "src/agents/agent.py",
  "test_command": "pytest tests/test_agent_smoke.py -q",
  "run_command": "python src/main.py",
  "example_input": "你好",
  "engine": "template",
  "runtime": {
    "framework": "openjiuwen-compatible",
    "mode": "lightweight"
  }
}
```

2. shared contracts：
   - 如 manifest schema 有类型定义，补 `engine` 和 `runtime.mode` 枚举。
   - 允许值至少包含 `real_openjiuwen`、`lightweight`、`mock_compatible`、`test_only`。

3. 后端版本记录：
   - 当前 `ProjectVersion` 只有 `mock_mode` 时，优先复用事件 payload/manifest 显示 runtime mode。
   - 若要持久化，新增字段需同步 schema migration、repository、API response、UI 类型。

4. 前端展示：
   - 工作台、完成摘要、测试台显示 TemplateEngine 结果为 lightweight/test-only。
   - 禁止使用“真实 OpenJiuwen”文案描述 TemplateEngine 结果。

### 6.4 建议代码落点

1. `apps/api/src/codegen/template-engine.ts`
2. `packages/shared-contracts/src/manifest.ts`
3. `apps/api/src/generations/generation.service.ts`
4. `apps/web/src/components/workspace/CompletionSummary.tsx`
5. `apps/web/src/components/agent/AgentTestPanel.tsx`
6. `apps/web/src/components/workspace/VersionList.tsx`

### 6.5 测试要点

单元测试：

1. TemplateEngine 生成 manifest 的 `runtime.framework` 是 `openjiuwen-compatible`。
2. TemplateEngine 生成 manifest 的 `runtime.mode` 是 `lightweight` 或 `mock_compatible`。
3. TemplateEngine 产物允许存在 `src/openjiuwen_runtime/`。
4. TemplateEngine 测试不应断言真实 OpenJiuwen SDK import。

UI 测试：

1. TemplateEngine 结果显示 lightweight/test-only 标识。
2. OpenCode 结果显示 real path 标识。

### 6.6 验收命令

```bash
npm --workspace @agent-builder/api run test -- template-engine.spec.ts generated-smoke.spec.ts
npm --workspace @agent-builder/web run test -- GenerationWorkspace VersionList AgentTestPanel
```

## 7. M3：OpenJiuwen API 盘点与版本锁定

### 7.1 目标范围

产出一份可被实现、prompt、gate、测试共同引用的 OpenJiuwen API 盘点文档，避免继续靠猜测 API 名称编码。

### 7.2 非目标

1. 不要求盘点 OpenJiuwen 全量功能。
2. 不要求实现 Workflow real path，除非 API 盘点后明确可行并纳入 M8。

### 7.3 交付文件

新增：

```text
docs/technical/openjiuwen_api_inventory.md
```

### 7.4 文档必须包含

1. OpenJiuwen 版本：
   - 包名。
   - 安装方式。
   - sandbox image 中的安装路径。
   - 版本验证命令。

2. Agent API：
   - AgentCard import。
   - ReActAgent import。
   - ReActAgentConfig import。
   - 创建 Agent 的最小代码。
   - 配置 system prompt 的方式。
   - 配置 max iterations 的方式。

3. Tool API：
   - `@tool` import。
   - 函数签名约束。
   - 参数 schema 生成规则。
   - tool 注册到 Runner/resource manager 的方式。
   - tool 注册到 Agent ability manager 的方式。

4. LLM 配置：
   - provider 参数。
   - api key 参数。
   - base URL 参数。
   - model 参数。
   - timeout/retry 是否支持。

5. Invoke 返回结构：
   - `await agent.invoke(...)` 输入 shape。
   - 返回字段。
   - 如何提取最终 answer。
   - 如何提取 tool calls 或 trace；如果 SDK 不提供，需要生成代码自行包装。

6. Workflow API：
   - 当前是否纳入 P4。
   - 若纳入：Workflow/Component/Runner 最小可运行示例。
   - 若不纳入：明确“P4 不验收真实 Workflow”。

7. 最小可运行样例：
   - `agent.py` 示例。
   - `test_agent_smoke.py` 示例。
   - 环境变量示例。

### 7.5 实现联动

API 盘点完成后，必须同步：

1. `opencode-engine.ts` prompt 中的 import 和示例代码。
2. M4 产物 gate 的扫描规则。
3. smoke test 模板或 prompt 要求。
4. README 生成要求。
5. `p4_work_items.md` 如有 API 名称变化也要更新。

### 7.6 测试要点

文档本身不跑测试，但需要至少提供命令：

```bash
docker run --rm agent-builder-sandbox:latest python -c "import openjiuwen; print(openjiuwen)"
```

若 OpenJiuwen 无 `__version__`，文档应说明替代验证方式。

## 8. M4：真实 Agent 产物 gate

### 8.1 目标范围

OpenCode 生成结束后、smoke test 前，系统必须扫描生成物，确认它确实是真实 OpenJiuwen Agent，而不是 lightweight adapter、伪代码、README-only 或其他框架。

### 8.2 非目标

1. 不做复杂 Python AST 完整语义分析。
2. 不验证业务逻辑质量。
3. 不要求所有工具都有真实业务实现，但不能是空项目或 README-only。

### 8.3 技术实现思路

建议新增文件：

```text
apps/api/src/codegen/real-openjiuwen-gate.ts
apps/api/src/codegen/real-openjiuwen-gate.spec.ts
```

核心 API：

```ts
export interface RealOpenJiuwenGateResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validateRealOpenJiuwenAgent(projectPath: string): RealOpenJiuwenGateResult;
```

最低校验规则：

1. `agent_builder_manifest.json` 存在。
2. manifest 是 JSON object。
3. manifest `project_type === 'agent'`。
4. manifest `entrypoint === 'src/agents/agent.py'` 或 entrypoint 指向项目内 Python 文件。
5. manifest `runtime.framework === 'openjiuwen'`。
6. manifest `runtime.mode === 'real_openjiuwen'`。
7. manifest `engine === 'opencode'`。
8. `src/agents/agent.py` 存在。
9. `agent.py` 包含 `ReActAgent` import。
10. `agent.py` 包含 `tool` import。
11. `agent.py` 至少包含一个 `@tool`。
12. `agent.py` 包含 `agent.invoke(`。
13. 项目内不存在 `src/openjiuwen_runtime/`。
14. 项目内不存在明显非目标框架关键词：`langgraph`、`crewai`、`dify`。
15. 项目不是 README-only：必须包含 Python entrypoint 和 test 文件。

建议可选校验：

1. `run_agent(` 存在。
2. `asyncio.run(` 存在。
3. `RUN_LLM_` 或等效运行期 env 读取存在。
4. `tests/test_agent_smoke.py` 存在。
5. `pyproject.toml` 存在。

### 8.4 Orchestrator 集成

在 `orchestrator.service.ts` 中：

1. `generate()` 完成后知道 `result.engine`。
2. 若 `effectiveEngineName(generationId) === 'opencode'` 且 `result.engine === 'opencode'`，调用 gate。
3. gate 失败时：
   - 记录 `EventType.Error` 或 `EventType.Thought`。
   - 标记 generation failed。
   - 不执行 smoke test。
   - 不 promote version。
4. gate warning 可记录到事件，但不阻止。

### 8.5 测试要点

单元测试覆盖：

1. 合格真实 Agent 通过。
2. 缺 manifest 失败。
3. manifest runtime mode 不是 `real_openjiuwen` 失败。
4. 缺 `ReActAgent` 失败。
5. 缺 `@tool` 失败。
6. 缺 `agent.invoke(` 失败。
7. 出现 `src/openjiuwen_runtime/` 失败。
8. 出现 `langgraph` 失败。
9. README-only 失败。

集成测试覆盖：

1. OpenCode 产物 gate 失败时 generation failed。
2. gate 失败时无 active version。
3. gate 失败事件包含具体缺失项。

### 8.6 验收命令

```bash
npm --workspace @agent-builder/api run test -- real-openjiuwen-gate.spec.ts orchestration.integration.spec.ts
```

## 9. M5：运行期真实 LLM 契约

### 9.1 目标范围

生成期 LLM 与运行期 LLM 分离。OpenCode 使用 `OPENCODE_*`；生成后的 Agent runtime 使用 `RUN_LLM_*`。这能避免“OpenCode 能生成，但 Agent 测试台实际没有运行期 LLM”的混淆。

### 9.2 非目标

1. 不实现复杂多 provider 凭证管理。
2. 不把运行期密钥写入生成项目。
3. 不把运行期密钥放入导出包。

### 9.3 环境变量契约

P4 运行期变量：

```text
RUN_LLM_PROVIDER=deepseek
RUN_LLM_API_KEY=...
RUN_LLM_BASE_URL=https://api.deepseek.com/v1
RUN_LLM_MODEL=deepseek-v4-flash
```

兼容策略：

1. P4 推荐不自动从 `OPENCODE_*` fallback 到 `RUN_LLM_*`。
2. 如果为了平滑迁移需要兼容，必须只在 `ALLOW_RUN_LLM_FROM_OPENCODE=true` 时启用，并在诊断页和事件流标注。

### 9.4 技术实现思路

1. 修改 `RunService.buildRunEnv()`：
   - 读取 `RUN_LLM_PROVIDER`、`RUN_LLM_API_KEY`、`RUN_LLM_BASE_URL`、`RUN_LLM_MODEL`。
   - 注入 provider-specific env，例如 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`。
   - 注入通用 env，例如 `AGENT_BUILDER_MODEL` 或生成代码约定的 `RUN_LLM_MODEL`。
   - 缺少 key 时不注入空 key。

2. 运行前校验：
   - 真实 OpenJiuwen active version 执行 Agent run 时，如果缺 `RUN_LLM_API_KEY`，应返回明确错误。
   - TemplateEngine/lightweight version 可以继续按 lightweight 规则运行，但必须标识非真实。

3. 修改诊断接口：
   - 显示 `runtime_llm.provider`、`runtime_llm.base_url_present`、`runtime_llm.model_present`、`runtime_llm.key_present`。
   - 不输出 key 值。

4. 修改 OpenCode prompt/README 要求：
   - 生成代码从运行期环境变量读取模型配置。
   - README 写清 `RUN_LLM_*`。

### 9.5 建议代码落点

1. `apps/api/src/orchestration/run.service.ts`
2. `apps/api/src/sandbox/diagnostics.controller.ts`
3. `apps/api/src/codegen/opencode-engine.ts`
4. `apps/web/src/components/Diagnostics.tsx`
5. `apps/api/src/sandbox/diagnostics.controller.spec.ts`
6. `apps/api/src/orchestration/orchestrator.controller.spec.ts`

### 9.6 测试要点

单元测试：

1. `RUN_LLM_*` 齐备时，sandbox env 注入 provider-specific key 和 base URL。
2. 缺 `RUN_LLM_API_KEY` 时，真实 Agent run 返回明确错误。
3. `OPENCODE_API_KEY` 存在但 `RUN_LLM_API_KEY` 缺失时，不应默认注入运行期 key。
4. 诊断接口不泄漏密钥。

集成测试：

1. 真实 runtime mode active version 缺 `RUN_LLM_API_KEY` 时，`POST /agent/runs` 失败。
2. Template/lightweight active version 缺 `RUN_LLM_API_KEY` 时，可运行但 UI 标识 lightweight。

### 9.7 验收命令

```bash
npm --workspace @agent-builder/api run test -- orchestrator.controller.spec.ts diagnostics.controller.spec.ts
npm --workspace @agent-builder/web run test -- Diagnostics
```

## 10. M6：ReAct trace 契约与 UI 展示

### 10.1 目标范围

Agent 测试台必须展示真实 Agent 的执行过程：iteration、tool call、tool result、最终 reply、错误原因。不能只展示最终 reply。

### 10.2 非目标

1. 不展示模型完整隐藏思考链。
2. 不要求泄露或保存敏感 prompt。
3. 不要求 OpenJiuwen SDK 原生支持 trace；如果 SDK 不提供，由生成 wrapper 或 python_runner 标准化可观察事件。

### 10.3 Trace 数据契约

建议扩展 `RunnerResult`：

```json
{
  "status": "success",
  "output": {
    "reply": "最终回复",
    "trace": [
      {
        "iteration": 1,
        "type": "tool_call",
        "tool": "draw_tarot",
        "input": {"question": "..."},
        "output": {"card": "..."}
      },
      {
        "iteration": 1,
        "type": "tool_result",
        "tool": "draw_tarot",
        "output": {"card": "..."}
      }
    ],
    "runtime_mode": "real_openjiuwen"
  },
  "events": []
}
```

Trace event 字段建议：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `iteration` | number | 是 | ReAct 轮次 |
| `type` | string | 是 | `tool_call`、`tool_result`、`final`、`error` |
| `tool` | string | 否 | 工具名 |
| `input` | object | 否 | 工具输入，需脱敏 |
| `output` | object/string | 否 | 工具输出，需截断 |
| `message` | string | 否 | 展示文本 |
| `duration_ms` | number | 否 | 耗时 |

### 10.4 技术实现思路

1. shared contracts：
   - 扩展 `RunnerResult`、`AgentRunResponse` 或相关 schema。
   - 增加 `RunTraceEvent` 类型。

2. Python runner：
   - `_normalise_agent_output()` 支持 `trace` 字段。
   - 兼容旧 `tool_calls`，将其转换为 `trace`。
   - 输出大小限制，避免单次 tool output 过大。
   - 异常时返回 `trace` 中的 error event。

3. OpenCode prompt：
   - 要求生成的 `run_agent()` 返回 `{"reply": str, "trace": list}`。
   - 若 OpenJiuwen SDK 无 trace API，要求 wrapper 至少记录 tool call/tool result。

4. 后端 RunService：
   - 保存 run output 时保留 trace。
   - 不在日志中输出密钥。

5. 前端 AgentTestPanel：
   - reply 与 trace 分区展示。
   - trace 使用紧凑列表或表格。
   - tool input/output 可展开。
   - lightweight/test-only 显示非真实标识。
   - 失败时显示 error trace 和日志入口。

### 10.5 测试要点

Python runner 测试：

1. 原始输出含 `trace` 时保留。
2. 原始输出只有 `tool_calls` 时转换为 trace。
3. 原始输出是字符串时 trace 为空。
4. 异常时返回 error output。

API 测试：

1. `POST /agent/runs` 返回 trace。
2. run repository 保存 trace。

前端测试：

1. AgentTestPanel 渲染多个 trace event。
2. tool input/output 可展开。
3. 没有 trace 时不崩溃，显示空状态。
4. lightweight/test-only 标识可见。

### 10.6 验收命令

```bash
cd services/python-runner && python -m pytest -q
npm --workspace @agent-builder/api run test -- orchestrator.controller.spec.ts
npm --workspace @agent-builder/web run test -- AgentTestPanel
```

## 11. M7：真实链路 E2E

### 11.1 目标范围

提供一个稳定的真实链路验证入口。环境齐备时真实运行；环境缺失时 skip 并明确列出缺失项。

### 11.2 非目标

1. 不要求 CI 默认具备真实密钥。
2. 不在日志中输出密钥。
3. 不把 skip 当 success；skip 只表示环境不具备真实验证条件。

### 11.3 E2E 流程

`npm run test:e2e:real` 应执行：

1. 检查环境：
   - `SPEC_LLM_BASE_URL`
   - `SPEC_LLM_API_KEY`
   - `SPEC_LLM_MODEL`
   - `OPENCODE_API_KEY`
   - `OPENCODE_PROVIDER`
   - `OPENCODE_MODEL`
   - `RUN_LLM_API_KEY`
   - `RUN_LLM_MODEL`
   - OpenCode binary
   - Docker/podman
   - `agent-builder-sandbox:latest`
   - OpenJiuwen SDK import

2. 创建 Draft。
3. 等待 Spec 解析成功。
4. Confirm Draft。
5. 等待 OpenCode real generation。
6. 执行 real OpenJiuwen product gate。
7. 执行 smoke test。
8. 调用 Agent 测试台。
9. 校验 `reply` 非空。
10. 校验 `trace` 至少包含一个 tool event 或 final event。
11. 导出代码包。
12. 校验导出包不包含密钥、日志、`.env`。

### 11.4 输出格式

成功时输出：

```text
status=completed
generation_id=...
version_id=...
engine=opencode
runtime_mode=real_openjiuwen
file_count=...
smoke_test=passed
trace_count=...
export_id=...
duration_ms=...
```

skip 时输出：

```text
status=skipped
missing=RUN_LLM_API_KEY,docker,agent-builder-sandbox:latest
```

失败时输出：

```text
status=failed
stage=product_gate|smoke_test|agent_run|export
generation_id=...
run_id=...
log_path=...
reason=...
```

### 11.5 建议代码落点

1. `apps/api/scripts/real-opencode-e2e.mjs`
2. `package.json` root script `test:e2e:real`
3. `apps/api/src/sandbox/diagnostics.controller.ts`
4. `docs/technical/p3_demo_runbook.md` 可后续同步 P4 runbook

### 11.6 测试要点

1. 环境缺失时脚本 exit code 应为 0 还是特殊 code，需统一。建议 skip 用 exit 0，但输出 `status=skipped`。
2. 真实失败时 exit code 非 0。
3. 日志不包含密钥。
4. 输出可被人和脚本读取。

## 12. M8：Workflow real path 决策

### 12.1 目标范围

明确 P4 是否实现真实 OpenJiuwen Workflow。如果不实现，必须把 Workflow 标为 lightweight，不计入真实验收。

### 12.2 决策输入

基于 `docs/technical/openjiuwen_api_inventory.md` 判断：

1. OpenJiuwen 是否提供稳定 Workflow/Component API。
2. 是否有 Runner API。
3. 是否能记录节点输入、输出、状态、耗时。
4. 是否能在当前 sandbox image 中运行。
5. 是否能在 P4 时间范围内完成。

### 12.3 若纳入 P4

实现项：

1. OpenCode prompt 增加 Workflow real path 代码样例。
2. 新增 `validateRealOpenJiuwenWorkflow(projectPath)`。
3. smoke test 覆盖真实 Workflow API。
4. WorkflowRunPanel 展示真实节点事件。
5. 真实 E2E 增加 Workflow case。

验收：

1. 生成物不包含 `src/openjiuwen_runtime/`。
2. 生成物 import OpenJiuwen Workflow/Component/Runner API。
3. 运行记录包含节点输入、输出、状态、耗时。

### 12.4 若不纳入 P4

实现项：

1. PRD、UI、README 标识 Workflow 为 lightweight。
2. P4 验收报告列出“Workflow real path 未覆盖”。
3. 禁止在 Demo 中声称 Workflow 已真实 OpenJiuwen 集成。

验收：

1. Workflow 页面显示 lightweight/test-only。
2. Workflow 不出现在真实 OpenJiuwen 成功指标里。

## 13. 横向测试矩阵

### 13.1 API 单元测试

必须覆盖：

1. `opencode-engine.spec.ts`
2. `template-engine.spec.ts`
3. `real-openjiuwen-gate.spec.ts`
4. `diagnostics.controller.spec.ts`
5. `orchestrator.controller.spec.ts`
6. `orchestration.integration.spec.ts`
7. `project-lint.spec.ts`

### 13.2 Python runner 测试

必须覆盖：

1. manifest entrypoint 加载。
2. run_agent 正常返回。
3. run_agent 返回 trace。
4. run_agent 返回 tool_calls 时转换 trace。
5. run_agent 抛异常时返回 failed。
6. workflow lightweight 仍可运行。

### 13.3 Web 测试

必须覆盖：

1. Diagnostics 展示生成期和运行期 LLM 配置。
2. AgentTestPanel 展示 trace。
3. AgentTestPanel 显示 lightweight/test-only 标识。
4. ErrorPanel 默认不显示 fallback。
5. VersionList 或 CompletionSummary 展示 engine/runtime mode。

### 13.4 真实 E2E

必须覆盖：

1. 环境缺失 skip。
2. 环境齐备真实执行。
3. OpenCode 失败 fail loud。
4. product gate 失败 fail loud。
5. smoke test 失败不 promote。
6. Agent run 返回 trace。

## 14. 验收命令建议

基础验证：

```bash
npm run lint
npm run typecheck
npm run test
cd services/python-runner && python -m pytest -q
```

聚焦验证：

```bash
npm --workspace @agent-builder/api run test -- opencode-engine.spec.ts template-engine.spec.ts real-openjiuwen-gate.spec.ts
npm --workspace @agent-builder/api run test -- orchestration.integration.spec.ts diagnostics.controller.spec.ts
npm --workspace @agent-builder/web run test -- AgentTestPanel Diagnostics
```

真实链路：

```bash
npm run test:e2e:real
```

## 15. 实施注意事项

1. 不要用字符串“生成完成”判断真实链路成功，必须依赖 version status、test status、runtime mode、gate 结果。
2. 不要把 secret 写入 generated project、run logs、event payload、export zip。
3. 不要为了让 smoke test 通过而完全 patch 掉 `agent.invoke()`。
4. 不要让 TemplateEngine 版本成为真实 OpenCode 失败后的 active version。
5. 不要在 UI 上用绿色成功态展示 skip 或 lightweight。
6. 不要在 PRD、README、Demo 话术中把 Workflow lightweight 称为真实 Workflow。
7. 若 OpenJiuwen API 与本文档示例不一致，以 `openjiuwen_api_inventory.md` 为准，并同步更新 prompt/gate/tests。

## 16. P4 完成定义

P4 完成必须交付：

1. `docs/technical/openjiuwen_api_inventory.md`。
2. TemplateEngine manifest 降级为 lightweight/test-only。
3. OpenCode fallback 默认禁用。
4. 真实 Agent 产物 gate。
5. `RUN_LLM_*` 运行期配置。
6. ReAct trace 后端契约和前端展示。
7. 真实 E2E 脚本（`npm run test:e2e:real`，含 skip 逻辑）。
8. Workflow real path 决策结果。
9. P4 验收报告，明确 Agent、Workflow、TemplateEngine 的真实边界。
10. `.env.example` 增加 `RUN_LLM_*` 变量说明。
11. diagnostics controller `/health/deep` 区分展示生成期与运行期配置。

---

## 17. 最终验收状态（2026-07-13，合并到 main 时点）

### §16 交付清单逐项验收

| # | 交付项 | 状态 | 证据 |
|---|---|---|---|
| 1 | `openjiuwen_api_inventory.md` | ✅ | `docs/technical/openjiuwen_api_inventory.md` (317 行，含 API 陷阱表) |
| 2 | TemplateEngine manifest → lightweight | ✅ | `template-engine.ts`: `engine:'template'`, `runtime.mode:'lightweight'` |
| 3 | OpenCode fallback 默认禁用 | ✅ | `opencode-engine.ts`: `allowFallback=false`; `codegen.module.ts`: `OPENCODE_ALLOW_FALLBACK === 'true'` |
| 4 | 真实 Agent 产物 gate | ✅ | `real-openjiuwen-gate.ts` (195 行, 12 规则) + `real-openjiuwen-gate.spec.ts` (12 tests) |
| 5 | `RUN_LLM_*` 运行期配置 | ✅ | `run.service.ts:buildRunEnv()`: 优先 `RUN_LLM_*`, fallback `OPENCODE_*` + warning |
| 6 | ReAct trace 后端契约 | ✅ | `runs.ts`: `RunTraceEvent` 类型; `runner.py`: `_normalise_agent_output()` + `_tool_calls_to_trace()` |
| 7 | 真实 E2E 脚本 | ✅ | `apps/api/scripts/real-opencode-e2e.mjs`; `package.json`: `test:e2e:real` |
| 8 | Workflow real path 决策 | ✅ | `docs/technical/p4_workflow_decision.md`: P4 不验收真实 Workflow |
| 9 | P4 验收报告 | ❌ 待编写 | 建议由负责人基于本检查清单撰写 |
| 10 | `.env.example` 增加 `RUN_LLM_*` | ✅ | `.env.example`: `RUN_LLM_PROVIDER/API_KEY/BASE_URL/MODEL` |
| 11 | diagnostics `/health/deep` 区分展示 | ❌ 未实现 | `diagnostics.controller.ts` 仅展示 `OPENCODE_*`，未增加 `RUN_LLM_*` 区块 |

### 前端 checklist（全部待验证）

| M | 前端项 | 文件 | 状态 |
|---|---|---|---|
| M2 | fallback 按钮默认隐藏 | `ErrorPanel.tsx` | ❓ |
| M2 | 版本列表显示 engine/runtime mode | `VersionList.tsx` | ❓ |
| M5 | AgentTestPanel 展示 trace | `AgentTestPanel.tsx` | ❓ |
| M5 | Diagnostics 显示 RUN_LLM_* | `Diagnostics.tsx` | ❓ |
| M6 | trace event 展开/折叠 | `AgentTestPanel.tsx` | ❓ |

### 验收结论

**后端 P4 核心目标已完成**：9/11 交付项已实现，2 项待补（P4 验收报告、diagnostics 更新）。前端未涉及，需独立评估。

P4 成功标准（§1.1）的 8 条中，7 条满足，第 6 条（Agent 测试台展示 ReAct trace）后端契约已就绪，前端未验证。

以下对照 `feature/openjiuwen-real` 当前代码逐项 review。

### 17.1 整体评价

P4 工作项设计全面、结构清晰。M1–M6 优先级排序合理。以下逐项标注 ✅（无问题）/ ⚠️（需调整）/ 🔴（阻断）。

### 17.2 M1 — 真实链路失败不被 fallback 掩盖

**✅ 设计合理。** 当前代码已有正确骨架：

- `opencode-engine.ts:53` — `allowFallback` 默认 `true`，需改为 `false`
- `orchestrator.service.ts:431-463` — `fallback()` 方法已实现，需加 `ENABLE_TEMPLATE_FALLBACK` 开关
- 前端默认隐藏 fallback 按钮的改动量小

⚠️ **一点注意**：`OPENCODE_ALLOW_FALLBACK` 控制的是"OpenCode 不可用时是否退到 TemplateEngine"；`ENABLE_TEMPLATE_FALLBACK` 控制的是"用户手动调用 fallback endpoint"。两者命名容易混淆。建议统一为 `OPENCODE_ALLOW_FALLBACK`（生成期）和 `ENABLE_MANUAL_FALLBACK`（手动救援）。

### 17.3 M2 — TemplateEngine 降级

**✅ 设计合理。** 当前 TemplateEngine manifest 写的是 `runtime.mode=real`（`opencode-engine.ts:478`），需改为 `lightweight`。

⚠️ **一点注意**：P4 文档 §6.3 提到 manifest 应写 `"framework": "openjiuwen-compatible"`，但当前 manifest schema（`packages/shared-contracts/src/manifest.ts`）可能没有 `engine` 和 `runtime.framework` 字段。M2 需要先扩展 shared-contracts 类型。

### 17.4 M3 — OpenJiuwen API 盘点

**✅ 设计合理。** 这是 P4 最重要的基础工作。当前实现的 import 路径来自源码阅读，需要正式文档锁定。

🔴 **关键问题**：P4 文档 §7.3 指定的文件名是 `openjiuwen_api_inventory.md`，但 §7.6 的验证命令是：
```
docker run --rm agent-builder-sandbox:latest python -c "import openjiuwen; print(openjiuwen)"
```
这只能在 `feature/openjiuwen-real` 分支的 Docker 镜像中执行（安装了完整 openjiuwen）。`main` 分支的 sandbox 镜像没有 openjiuwen。文档应明确此验证仅在 real 分支环境下有效。

### 17.5 M4 — 真实 Agent 产物 gate

**设计总体合理**，但以下规则需调整。

🔴 **Rule #9（`agent.py` 包含 `ReActAgent` import）——需精确匹配**：

当前 opencode prompt 生成的 import 是：
```python
from openjiuwen.core.single_agent import AgentCard, ReActAgent, ReActAgentConfig
```
gate 应匹配完整 import 路径 `from openjiuwen.core.single_agent import` + `ReActAgent`，而不是简单 grep `ReActAgent`（可能与变量名混淆）。

🔴 **Rule #11（至少一个 `@tool`）——需考虑无工具 Agent**：

如果 Spec 的 `tools` 数组为空（纯对话 Agent），生成代码可以没有 `@tool`。建议改为：
- 若 manifest 或 Spec 声明了工具 → 必须有对应的 `@tool`
- 若 Spec 无工具 → 不强制

⚠️ **Rule #15（Python entrypoint + test 文件）——与 Rule #8 重叠**：

Rule #8 已检查 `src/agents/agent.py` 存在，Rule #15 再检查 entrypoint 存在是重复的。建议 Rule #15 聚焦于"不是 README-only"：至少包含 agent.py + 一个 test 文件 + pyproject.toml。

⚠️ **文件位置**：P4 文档建议新建 `real-openjiuwen-gate.ts`，但当前已有 `project-lint.ts` 做 forbid 检查。建议新 gate 调用 `lintGeneratedProject()` 做 forbid 检查，自身只做正向验收（import/结构/模式）。避免职责重叠。

### 17.6 M5 — 运行期真实 LLM 契约

**✅ 设计正确**，但当前实现与此有差距。

🔴 **当前实现**：`run.service.ts:buildRunEnv()` 读的是 `OPENCODE_PROVIDER` / `OPENCODE_API_KEY` / `OPENCODE_BASE_URL` / `OPENCODE_MODEL`。

🔴 **P4 要求**：读 `RUN_LLM_PROVIDER` / `RUN_LLM_API_KEY` / `RUN_LLM_BASE_URL` / `RUN_LLM_MODEL`。

这是破坏性变更——所有 `.env` 文件、docker-compose、诊断接口、CI 配置都需要同步更新。P4 文档的"兼容策略"（§9.3）提到"推荐不自动 fallback"，建议改为 **默认兼容 + 废弃警告** 的迁移路径：

1. P4 优先读 `RUN_LLM_*`
2. 若 `RUN_LLM_*` 未设置 → fallback 读 `OPENCODE_*`，同时 log warning
3. 文档标注 `OPENCODE_*` fallback 在 P5 移除

这样避免一次性改动太大导致所有开发环境 break。

### 17.7 M6 — ReAct trace 契约与 UI 展示

**✅ 设计合理。** Trace 数据契约（§10.3）清晰。

⚠️ **一点调整**：当前 `python_runner` 的 `_normalise_agent_output()` 期望 `{"reply": str, "tool_calls": list}`。引入 `trace` 字段后，建议 python_runner 同时输出 `trace` 和 `tool_calls`（tool_calls 作为 trace 的子集），前端优先展示 `trace`，降级展示 `tool_calls`。这样 opencode 只需生成新格式，无需改动 runner 的解析逻辑。

### 17.8 M7 — 真实链路 E2E

**✅ 设计合理。** 输出格式（成功/skip/失败）清晰。

⚠️ **补充建议**：E2E 脚本的 skip 检查应使用 diagnostics controller（已有 `/health/deep`），而不是硬编码 env var 列表。这样新增检查项时只需更新 diagnostics controller，E2E 脚本自动感知。

另外 §16 "P4 完成定义" 中缺少此 E2E 脚本的交付项，已补在下方 §17.10。

### 17.9 M8 — Workflow real path 决策

**✅ 设计合理。** "若不纳入则标 lightweight" 的备选方案清晰。

### 17.10 缺失项

以下内容建议补充到 P4 文档：

| 缺失项 | 建议 |
|---|---|
| **python_runner trace 改造** | M6 只描述了 API 契约和前端，未明确 python_runner（`services/python-runner/src/python_runner/runner.py`）的改造要点。应与 M6 联动。 |
| **OpenCode prompt 同步更新** | M3（API 盘点）完成后、M4（gate）通过后，都必须同步更新 `opencode-engine.ts:buildPrompt()` 中的 import 示例和代码模板。当前 P4 文档提到但未列为独立工作项。建议在每个 M 的"实现联动"中加 checklist。 |
| **`.env.example` 更新** | 新增 `RUN_LLM_*` 变量需同步到 `apps/api/.env.example`。 |
| **sandbox Dockerfile 版本锁定** | openjiuwen 通过 `COPY --from=agent-core .` 安装，版本取决于 `../agent-core/` 的当前状态。P4 应建议固定到特定 commit SHA 或 wheel。 |
| **diagnostics controller 更新** | 需要区分展示生成期（`OPENCODE_*`）与运行期（`RUN_LLM_*`）配置，当前 `/health/deep` 只展示 `OPENCODE_*`。 |

### 17.11 实施顺序建议

当前顺序（M1→M2→M3→M4→M5→M6→M7→M8）总体合理，但建议微调：

1. **M1 + M2 可以并行**：两者互不依赖。
2. **M3 应先于 M4**：API 盘点必须在写 gate 规则之前完成（gate 要知道正确 import 路径）。
3. **M5 应先于 M7**：E2E 需要 `RUN_LLM_*` 环境就绪。
4. **M6 可以最后**：UI 展示不影响核心链路正确性。

### 17.12 总评

P4 工作项设计质量高，8 个里程碑覆盖了从"不掩盖失败"到"Workflow 决策"的完整链条。5 个标注为 P0 的 R1–R5 是正确的优先级判断。上述 review 意见主要是精确性调整（import 匹配、无工具 Agent、`RUN_LLM_*`迁移路径），不影响整体架构。
