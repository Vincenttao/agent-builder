# Agent Builder P3 工作点

版本：v0.1 | 日期：2026-07-12

来源：真实 LLM + 真实 OpenCode 配置下的无头浏览器验收。

## 一、本轮真实链路验证

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

### 验收样例

样例 prompt：

```text
做一个企业制度问答 Agent。用户输入关于请假、报销、远程办公的问题时，Agent 调用 search_policy 工具检索制度条款，再用简洁中文回答，并列出引用的制度名称和建议下一步动作。
```

无头浏览器执行路径：

```text
首页
-> 输入 Agent prompt
-> 创建 Draft
-> 等待真实 LLM 解析 Spec
-> Spec 确认
-> 进入 Generation Workspace
-> 等待真实 OpenCode 生成
```

### 验收结果

| 阶段 | 结果 | 说明 |
|---|---|---|
| 首页提交 | 通过 | 无头 Chromium 可正常进入 Draft 页面 |
| 真实 LLM Spec 解析 | 通过 | Draft 页面显示 `llm / deepseek-chat` |
| Spec 质量 | 基本通过 | 生成了 `企业制度问答助手`，包含 `search_policy` 工具和结构化输入输出 schema |
| Spec 确认 | 通过 | 确认后创建 generation |
| 真实 OpenCode 生成 | 失败 | sandbox allowlist 拒绝命令：`command contains absolute path or ..` |
| Agent 源码查看 | 未到达 | OpenCode 未生成源码文件 |
| Agent 测试台 | 未到达 | generation failed，无 active version |
| 导出 | 未到达 | 无可导出版本 |

生成记录：

| 字段 | 值 |
|---|---|
| Draft | `draft_011bdd06-3b6c-4345-b8c5-8ed5b4e8f2d4` |
| Generation | `gen_e4824318-5457-4f39-806c-891131f5a968` |
| 最终状态 | `failed` |
| 错误码 | `CODE_GENERATION_FAILED` |
| 错误信息 | `命令被沙箱拒绝：command contains absolute path or ..` |

关键事件：

```text
1. plan_created
2. command_started: 开始生成代码：企业制度问答助手
3. opencode_started: OpenCode 会话启动
4. command_started: [自动修复] 开始生成代码：企业制度问答助手
5. opencode_started: OpenCode 会话启动
6. command_started: [自动修复] 开始生成代码：企业制度问答助手
7. opencode_started: OpenCode 会话启动
8. error: 命令被沙箱拒绝：command contains absolute path or ..
```

本轮截图保存在本机临时目录：

| 文件 | 说明 |
|---|---|
| `/tmp/agent-builder-real-draft.png` | 真实 LLM Spec 确认页 |
| `/tmp/agent-builder-real-workspace.png` | OpenCode 失败后的工作区 |

## 二、测试结果

| 命令 | 结果 | 备注 |
|---|---|---|
| `npm run lint` | 通过 | 当前 lint 已恢复 |
| `npm run typecheck` | 通过 | contracts/api/web/shared typecheck 通过 |
| `npm run test` | 通过 | contracts 15、api 144、web 20、python 10 通过 |
| `npm --workspace @agent-builder/web run test:e2e` | 通过 | 4 条 Playwright 主流程通过 |

说明：

1. 常规测试和 mock E2E 证明基础产品链路没有被破坏。
2. 常规测试没有覆盖真实 OpenCode v1 命令通过 sandbox allowlist 的场景。
3. 当前最关键失败只会在真实 OpenCode 配置下暴露。

## 三、演示价值判断

### 可以演示的价值

当前系统已经足够演示以下价值：

1. 自然语言进入 Agent/Workflow 创建入口。
2. 真实 LLM 可以把非内置需求解析成结构化 Spec。
3. Spec 确认页能让用户看到模型理解结果。
4. mock/template 主链路可以完成源码、运行、导出。
5. 失败路径能在工作区呈现错误，而不是白屏或静默卡死。

### 不足以演示的价值

如果演示目标是“真实 LLM + 真实 OpenCode 完整生成一个可运行 Agent”，当前还不够。原因是：

1. 真实 OpenCode 在 sandbox allowlist 层被拦截，还未真正执行。
2. 失败后没有自动切换到可控 fallback 以保证现场闭环。
3. 工作区未提供足够明确的“失败原因、修复建议、切换模板引擎”操作。
4. 版本、diff、运行日志 UI 仍未完整打通。
5. 真实生成链路缺少专项 E2E 和诊断页面。

建议内部演示分两档：

| 演示档位 | 是否建议 | 说明 |
|---|---|---|
| 价值概念演示 | 可以 | 使用真实 LLM Spec 解析 + template/mock 生成闭环 |
| 真实 OpenCode 生成演示 | 暂不建议 | 需先修复 sandbox allowlist 与 fallback 策略 |

## 四、P3 目标

P3 的目标不是继续堆功能，而是把 P2 demo 从“mock/template 可演示”推进到“真实 LLM + 真实 OpenCode 可重复演示”。

P3 完成定义：

1. 真实 LLM 可以稳定解析非内置 Agent/Workflow prompt。
2. 真实 OpenCode 可以至少成功生成一个 Agent 和一个 Workflow。
3. 生成物包含 manifest、README、源码、测试、示例输入。
4. smoke test 失败不会被误标为通过。
5. 失败时用户能明确选择 retry、fallback、查看日志或回到 Spec 修改。
6. 内部同事可以按 runbook 在 15 分钟内完成一次真实链路演示。

## 五、P3 工作点

### P3-001：修复真实 OpenCode sandbox allowlist

**优先级：P0**

**问题：** OpenCode v1 把自然语言 prompt 作为 argv 参数传入，当前 `command-allowlist` 对所有参数执行 `arg.includes('..')` 检查，会把普通文本中的 `...` 误判为路径逃逸。

**工作内容：**

1. 区分路径参数和普通文本参数，不要对 prompt 文本做路径逃逸判断。
2. 对 `opencode run` 设计专用 allowlist 校验。
3. 覆盖 `--model deepseek/deepseek-chat`、`--json`、长 prompt、包含省略号的 prompt。
4. 增加真实命令形态单元测试。

**验收：**

1. 当前真实 OpenCode v1 命令不再被 allowlist 拒绝。
2. `rm`、`bash -c`、绝对路径文件写入等危险命令仍被拒绝。
3. 单元测试覆盖误判回归。

### P3-002：修复 OpenCode prompt 传递方式

**优先级：P0**

**问题：** 当前 v1 命令把完整生成说明放在 argv 中，既容易触发 allowlist 误判，也不利于日志和安全审计。

**工作内容：**

1. 优先让 OpenCode 读取 `.agent_builder/prompt.md`，不要把完整 prompt 作为 argv 文本传入。
2. `buildPrompt()` 写入 manifest、smoke test、README、禁止框架、目录结构等完整约束。
3. v0/v1/v3 CLI 风格统一使用同一份 prompt 文件。
4. OpenCode 命令只保留必要 flags，例如 model、format、权限策略。

**验收：**

1. `.agent_builder/prompt.md` 是唯一完整生成指令来源。
2. 不同 CLI 风格不会丢失 manifest/smoke test 约束。
3. OpenCode stderr/stdout 日志不包含密钥。

### P3-003：真实 OpenCode fallback 策略

**优先级：P0**

**问题：** 当前真实 OpenCode 失败后只 retry，最终 failed；演示现场无法继续完成源码查看、测试台、导出。

**工作内容：**

1. 当 OpenCode 被本地环境或 CLI 问题阻断时，允许用户一键切换 TemplateEngine。
2. 标准 demo 可以配置自动 fallback，但 UI 必须明确标记。
3. 失败面板显示：失败原因、retry、fallback、查看日志、回到 Spec 修改。
4. fallback 后保留原失败版本和事件，用于解释真实链路问题。

**验收：**

1. 真实 OpenCode 失败时，演示者可以继续完成 demo 闭环。
2. UI 不会把 fallback 结果伪装成真实 OpenCode 结果。
3. 事件流记录 fallback 原因。

### P3-004：修复 smoke test 失败误晋级

**优先级：P0**

**问题：** OpenCode 模式下 pytest 失败时仍可能 promote version 并标记 Passed。

**工作内容：**

1. 移除 `passed || codegenEngine === opencode` 的通过逻辑。
2. 测试失败时进入 retry；retry 耗尽后 generation failed。
3. 只有 smoke test 通过的版本才能成为 active version。
4. 增加“有测试文件但测试失败”的 orchestration 回归测试。

**验收：**

1. 测试失败版本不会成为 active version。
2. UI 显示失败版本和失败日志。
3. retry 成功后才 promote 新版本。

### P3-005：完成 manifest 契约消费

**优先级：P1**

**问题：** manifest 已开始生成和读取，但 runner 尚未实际使用其关键字段。

**工作内容：**

1. runner 使用 manifest 的 `entrypoint` 定位运行入口。
2. runner 使用 `example_input` 自动填充 Agent 测试台 / Workflow 运行页。
3. smoke test 使用 manifest 的 `test_command` 或进行安全映射。
4. UI 展示 manifest 中的 runtime、entrypoint、example input。

**验收：**

1. OpenCode 生成物不依赖固定目录结构也能运行。
2. 示例输入可以自动加载。
3. manifest 缺失或非法时有明确错误。

### P3-006：真实运行状态语义

**优先级：P1**

**问题：** Python runner fallback 异常时仍返回 `status: "success"`，容易误导演示用户。

**工作内容：**

1. 返回 `mode: "real" | "mock_fallback"`。
2. fallback 时状态使用 `fallback` 或显式字段，不再伪装为纯成功。
3. Agent/Workflow UI 显示 fallback 原因。
4. E2E 覆盖 fallback 展示。

**验收：**

1. 用户能区分真实运行、mock runtime、fallback 运行。
2. 失败不会被误写为成功。

### P3-007：真实链路 E2E

**优先级：P1**

**问题：** 当前 E2E 覆盖 mock/template 主链路，没有覆盖真实 LLM + 真实 OpenCode。

**工作内容：**

1. 新增手动触发的 `real-opencode` E2E，不进入 CI 默认门禁。
2. 使用真实 `.env`，但测试日志不得输出密钥。
3. 至少覆盖一个 Agent 样例。
4. 记录耗时、失败阶段、生成文件清单、smoke test 结果。

**验收：**

1. 有密钥和 OpenCode 环境时，可一键跑真实链路验收。
2. 无密钥环境时自动跳过并给出说明。

### P3-008：演示诊断页

**优先级：P1**

**问题：** 演示前无法一眼判断真实 LLM、OpenCode、Docker/sandbox、Python runner 是否可用。

**工作内容：**

1. 新增 `/health/deep` 或 `/demo/diagnostics`。
2. 检查 LLM key、base URL、model、OpenCode binary、CLI style、sandbox allowlist、Docker/mock runner。
3. 首页显示诊断状态。
4. 提供“复制诊断报告”按钮。

**验收：**

1. 演示前 1 分钟内可以判断是否能跑真实链路。
2. 失败项提供明确修复建议。

### P3-009：版本、Diff、日志 UI

**优先级：P1**

**问题：** 后端已有 versions/diff/runs/log API，但前端没有完整消费。

**工作内容：**

1. 完成页显示 active version、engine、test status、fallback 状态。
2. 工作区增加版本列表和 diff 面板。
3. ErrorPanel 增加真实 run log 查看入口。
4. repair 后自动刷新版本列表。

**验收：**

1. 用户无需手工查 API 就能理解失败和版本变化。
2. 内部评审能看到“可追踪、可恢复”的产品价值。

### P3-010：内部演示 runbook

**优先级：P2**

**问题：** 当前演示依赖操作者知道 `.env`、OpenCode、fallback、端口和恢复方式。

**工作内容：**

1. 编写 `docs/technical/p3_demo_runbook.md`。
2. 包含真实链路、fallback 链路、常见失败、恢复命令。
3. 固化 2 个标准 prompt：企业制度问答 Agent、售前需求分析 Workflow。
4. 给出截图 checklist。

**验收：**

1. 非开发同事可以按 runbook 复现演示。
2. 演示失败时能在 3 分钟内切换 fallback 完成价值展示。

## 六、建议实施顺序

### Milestone 1：真实 OpenCode 能启动

1. P3-001 修复 allowlist。
2. P3-002 修复 prompt 传递方式。
3. P3-004 修复 smoke test 失败误晋级。
4. 跑一次真实 Agent 样例。

完成判定：真实 OpenCode 至少开始执行并产出文件；失败也必须来自生成质量或测试，而不是本地 sandbox 误拦截。

### Milestone 2：真实链路能闭环

1. P3-003 fallback 策略。
2. P3-005 manifest 契约消费。
3. P3-006 真实运行状态语义。
4. 跑 Agent 测试台和导出。

完成判定：真实链路或明确 fallback 链路可以完成源码查看、运行、导出。

### Milestone 3：内部演示可重复

1. P3-007 真实链路 E2E。
2. P3-008 演示诊断页。
3. P3-009 版本/Diff/日志 UI。
4. P3-010 runbook。

完成判定：内部同事可以按文档完成演示，失败时有可解释、可恢复路径。

