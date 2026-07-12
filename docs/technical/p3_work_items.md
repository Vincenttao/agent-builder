# Agent Builder P3 工作点

版本：v0.2 | 日期：2026-07-12

来源：对照当前代码、P3 原始验收记录、真实 LLM + 真实 OpenCode 手动验证结果。

## 一、当前结论

P3 原始记录中的关键失败：

```text
真实 OpenCode 生成失败：命令被沙箱拒绝：command contains absolute path or ..
```

已经不是当前主状态。当前工作树已经可以在真实配置下跑通一个 Agent 样例：

| 能力 | 当前结果 |
|---|---|
| 真实 LLM Spec Parser | 已验证通过 |
| 真实 OpenCode v1 生成 Agent | 已验证通过 |
| Docker sandbox smoke test | 已验证通过 |
| 生成物 manifest / README / 源码 / smoke test | 已验证通过 |
| 生成物文件属主可清理 | 已修复并验证 |

但 P3 还不能判定全部完成。主要缺口集中在：

1. `pytest` 失败版本仍可能被 promote 为 active version，P3-004 还未完全修复。
2. 真实 OpenCode 失败后的 UI fallback 闭环不完整。
3. manifest 还没有被 runner/UI 充分消费。
4. 真实链路专项 E2E、诊断页、版本/Diff/日志 UI、runbook 尚未补齐。

因此，当前状态应定义为：

```text
P3 Milestone 1 基本达成，但 P3 尚未完成。
```

## 二、真实链路验证状态

### 环境配置

本轮使用 `apps/api/.env` 中的真实配置：

| 能力 | 配置 |
|---|---|
| Spec LLM | `SPEC_LLM_PROVIDER=openai-compatible` |
| Spec 模型 | `SPEC_LLM_MODEL=deepseek-chat` |
| 代码生成 | `CODEGEN_ENGINE=opencode` |
| OpenCode 模式 | `OPENCODE_REQUIRE_REAL=true` |
| OpenCode CLI | `OPENCODE_CLI_STYLE=v1` |
| OpenCode 模型 | `OPENCODE_PROVIDER=deepseek` / `OPENCODE_MODEL=deepseek-chat` |

密钥未写入文档、日志或提交。

### 已验证样例

样例 prompt：

```text
做一个员工政策问答 Agent，用户输入制度问题后调用工具检索政策条款并给出简明回答。
```

验证路径：

```text
清理 workspace
-> 真实 LLM 解析 Spec
-> 真实 OpenCode v1 生成
-> Docker sandbox 执行 OpenCode
-> pip install -e . --no-build-isolation
-> pytest tests/ -q
-> generation completed
```

### 验证结果

| 字段 | 值 |
|---|---|
| Generation | `gen_45c4eedb-8ab5-43b9-903a-25c8a3c97166` |
| Version | `ver_6e37961d-a00e-4621-941e-fb722f2f54d7` |
| 最终状态 | `completed` |
| 测试状态 | `passed` |
| mock_mode | `false` |
| 生成文件数 | 15 |
| 后端 smoke test | `11 passed` |

生成物包含：

```text
agent_builder_manifest.json
README.md
pyproject.toml
src/main.py
src/openjiuwen_runtime/__init__.py
src/agents/agent.py
tests/test_agent_smoke.py
```

manifest 示例：

```json
{
  "schema_version": "1.0",
  "project_type": "agent",
  "entrypoint": "src/agents/agent.py",
  "test_command": "pytest tests/test_agent_smoke.py -q",
  "run_command": "python src/main.py",
  "example_input": "请查询年假政策",
  "runtime": {
    "framework": "openjiuwen",
    "mode": "mock-compatible"
  }
}
```

## 三、测试结果

最新已验证命令：

| 命令 | 结果 | 说明 |
|---|---|---|
| `npm --workspace @agent-builder/api run typecheck` | 通过 | API TypeScript 类型检查通过 |
| `npm --workspace @agent-builder/api run test -- opencode-engine.spec.ts orchestration.integration.spec.ts docker-command-builder.spec.ts openai-compatible-spec-parser.spec.ts` | 通过 | 36 tests passed |
| `node --env-file=apps/api/.env ... verify-real-llm.ts` | 通过 | 真实 LLM 返回合法 Spec 并通过 validation |
| 真实端到端脚本 | 通过 | 真实 LLM + real OpenCode + smoke test completed |

注意：

1. API 集成测试需要本地监听权限，普通受限沙箱会报 `listen EPERM`，需在具备本地端口权限的环境运行。
2. 真实端到端验证依赖网络、Docker socket、`apps/api/.env` 中的真实密钥和 `agent-builder-sandbox:latest` 镜像。
3. 目前还没有可复用的 `real-opencode` E2E 命令，真实验证仍是手动脚本形态。

## 四、P3 完成度矩阵

| 工作点 | 状态 | 当前证据 | 仍需补充 |
|---|---|---|---|
| P3-001 修复真实 OpenCode sandbox allowlist | ✅ 完成 | `...` 不再触发路径逃逸误判；regex `/(?:^\|/)\\.\\.(?:$\|/)/`；有回归测试（含 opencode model path、ellipsis、路径逃逸拒绝） | — |
| P3-002 修复 OpenCode prompt 传递方式 | ✅ 完成 | 默认 v1；v0 兼容前缀已加入 allowlist；instruction 简化为文件读取 | — |
| P3-003 真实 OpenCode fallback 策略 | 部分完成 | OpenCode 不可用时可回退 TemplateEngine，并记录 fallback 事件 | 真实 OpenCode 失败后 UI 仍只有 repair，没有一键 fallback |
| P3-004 修复 smoke test 失败误晋级 | ✅ 完成 | `promoteVersion()` 仅在 `passed && latestVersion` 时调用；失败版本不 promote | — |
| P3-005 完成 manifest 契约消费 | 部分完成 | TemplateEngine 和 OpenCode prompt 都要求生成 manifest；runner 会尝试读取 manifest 文件 | runner 没有实际使用 `entrypoint/test_command/run_command/example_input`；UI 未展示 runtime、entrypoint、example input |
| P3-006 真实运行状态语义 | 部分完成 | Python runner fallback 返回 `status: "fallback"`、`mode: "mock_fallback"`；Agent UI 有 fallback 提示 | Workflow UI 未显示 fallback 状态；缺专项 E2E 覆盖 |
| P3-007 真实链路 E2E | 未完成 | 手动真实端到端已验证 | 缺可一键触发、无密钥自动 skip、输出报告的 `real-opencode` E2E |
| P3-008 演示诊断页 | 未完成 | 基础 `/health` 存在 | 缺 `/health/deep` 或 `/demo/diagnostics`；首页无 LLM/OpenCode/Docker/Python runner 诊断 |
| P3-009 版本、Diff、日志 UI | 部分完成 | 后端 versions/diff/runs/log API 已存在，前端 API helper 已存在；CompletionSummary 可显示 engine/fallback | 工作区未消费 versions/diff/runs/log；`CompletionSummary` 仍传 `version={null}`；ErrorPanel 只展示事件摘要，不展示真实 run log 内容 |
| P3-010 内部演示 runbook | 未完成 | 本文档记录了当前状态 | 缺 `docs/technical/p3_demo_runbook.md`，缺标准 prompt、恢复命令和截图 checklist |

## 五、必须优先修复的问题

### 1. P3-004：pytest 失败版本不再成为 active version ✅ FIXED (164e615)

已修复：`promoteVersion()` 仅在 `passed && latestVersion` 时调用。失败版本不会成为 active version。OpenCode 模式下返回 `{passed: false}` 由 retry loop 处理。

### 2. P3-002：v0 CLI 默认值 ✅ FIXED (164e615)

默认改为 `v1`，同时将 `['opencode', '-p']` 加入 allowlist 以支持 v0 兼容。

### 3. P3-003：失败后没有 UI fallback 闭环

当前 ErrorPanel 只有“修复并重试”。演示现场如果真实 OpenCode 因模型、网络、CLI 或 sandbox 环境失败，操作者还不能从 UI 继续 template fallback。

建议：

1. 新增后端 endpoint，例如 `POST /api/generations/:id/fallback`.
2. fallback 使用已持久化 Spec 走 TemplateEngine 生成新版本。
3. 事件流记录原失败原因和 fallback reason。
4. UI 显示“切换模板引擎完成演示”，并明确标记结果不是真实 OpenCode。

## 六、建议补充工作

### P0

1. 修复 P3-004，保证失败版本不会成为 active version。
2. 补齐 P3-002 默认 CLI style / allowlist 一致性。
3. 增加 `opencode` 真实命令形态测试：v1、v3、长 prompt、`--json`、省略号、路径逃逸拒绝。

### P1

1. 增加真实 OpenCode fallback endpoint 和 UI 按钮。
2. runner 消费 manifest：
   - 使用 `entrypoint` 定位入口。
   - 使用 `example_input` 预填 Agent/Workflow 测试输入。
   - 对 `test_command` 做安全映射后用于 smoke test。
3. 工作区接入 versions/diff/runs/log API：
   - 完成页传入 active version。
   - 新增版本列表。
   - 新增 diff 面板。
   - ErrorPanel 可查看 stdout/stderr tail。
4. WorkflowRunPanel 显示 `mode: mock_fallback` 和 fallback reason。

### P2

1. 新增手动 `real-opencode` E2E：
   - 有密钥和 OpenCode 时运行。
   - 无密钥自动 skip。
   - 输出 generation id、耗时、文件清单、smoke test 状态。
2. 新增 `/health/deep` 或 `/demo/diagnostics`：
   - 检查 LLM key 是否存在但不输出值。
   - 检查 base URL/model。
   - 检查 OpenCode binary 和 CLI style。
   - 检查 Docker runner / mock runner。
   - 检查 sandbox allowlist。
3. 编写 `docs/technical/p3_demo_runbook.md`。

## 七、演示建议

### 当前可以演示

| 演示档位 | 建议 | 说明 |
|---|---|---|
| 真实 LLM Spec 解析 | 可以 | 已可稳定展示非内置 prompt 转 Spec |
| 真实 OpenCode Agent 生成 | 可以小范围演示 | v1 + DeepSeek + Docker 环境下已验证；仍需操作者熟悉恢复方式 |
| template/mock 完整闭环 | 可以 | 源码、测试台、导出路径更稳定 |

### 当前不建议承诺

| 承诺 | 原因 |
|---|---|
| “真实 OpenCode 任意失败都可现场恢复” | 缺 UI fallback 闭环 |
| “失败版本不会影响 active version” | P3-004 仍有 promote 风险 |
| “非开发同事 15 分钟可复现” | 缺 runbook、诊断页和真实 E2E |
| “Agent/Workflow 两类真实 OpenCode 都稳定” | 当前只验证过一个 Agent 样例，Workflow 真实生成未验证 |

## 八、建议实施顺序

### Milestone 1：完成真实生成安全闭环

1. P3-004：修复 pytest failed promote bug。
2. P3-002：统一默认 CLI style 与 allowlist。
3. P3-001：补齐真实命令形态单测。
4. 跑真实 Agent 样例和真实 Workflow 样例。

完成判定：真实 OpenCode 失败只会导致 retry/failed，不会产生错误 active version。

### Milestone 2：完成演示恢复闭环

1. P3-003：fallback endpoint + UI。
2. P3-005：manifest 消费。
3. P3-006：Workflow fallback 状态展示。
4. 跑 Agent 测试台、Workflow 运行和导出。

完成判定：真实链路失败时，演示者可以从 UI 明确切换 fallback 并完成源码查看、运行、导出。

### Milestone 3：完成可重复演示

1. P3-007：真实链路 E2E。
2. P3-008：演示诊断页。
3. P3-009：版本/Diff/日志 UI。
4. P3-010：内部演示 runbook。

完成判定：内部同事可以按文档完成演示，失败时有可解释、可恢复路径。
