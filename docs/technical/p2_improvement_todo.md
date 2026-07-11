# Agent Builder P2 改进代办

版本：v0.2 | 日期：2026-07-11

来源：对照 `docs/technical/p2_plan.md`、`docs/technical/p2_defects.md`、当前代码实现与最新审查结论。

## 一、当前判断

当前 P2 已经具备内部 demo 主链路：

```text
首页 / Prompt 模板
-> Spec draft / 确认
-> Generation workspace
-> 源码查看 / Agent 测试台 / Workflow 运行 / 导出
```

自动化验证中，`typecheck`、单元/集成测试、4 条 Playwright E2E 主流程可以通过；但 `lint` 当前仍失败，且部分 P2 计划项只做到后端 API 或演示 fallback，尚未成为完整用户功能。

因此，下一阶段不应继续扩大功能面，而应集中修订以下三类问题：

1. 修复质量门禁和已知实现缺口，保证 P2 可以被稳定验收。
2. 补齐 manifest、smoke test、版本/diff/log UI 等 P2 核心承诺。
3. 明确 mock/fallback/real 状态，避免内部 demo 误判系统真实能力。

## 二、优先级总览

| 优先级 | 目标 | 说明 |
|---|---|---|
| P0 | 恢复验收门禁 | `npm run lint` 必须通过，否则 P2 不能算完成 |
| P0 | 补齐生成物契约 | `agent_builder_manifest.json`、smoke test 防漏、runner 错误语义 |
| P0 | 补齐工作台关键 UI | 版本、diff、日志、repair 返回值必须可解释 |
| P1 | 提升 demo 可重复性 | 环境自检、seed/reset、runbook 和状态展示 |
| P1 | 强化真实/Mock 边界 | runner fallback、OpenCode fallback、Docker/mock 状态要显式 |
| P2 | 安全基线加固 | Docker read-only/tmpfs/cap-drop 等增强项，避免阻塞主链路 |

## 三、处理状态总览

最新核对提交：`aa9bcbb fix: T-002 manifest contract, T-003 smoke test leak, T-004 repair contract`

| 任务 | 当前状态 | 说明 | 下一步 |
|---|---|---|---|
| T-001 lint 门禁 | 未处理 | `npm run lint` 仍因 `react-hooks/exhaustive-deps` 未配置规则失败 | 必修 |
| T-002 manifest 契约 | 部分处理 | 已新增 shared manifest 类型，TemplateEngine 会生成 manifest，runner 会读取 manifest 文件；但 runner 尚未实际使用 `entrypoint/test_command/run_command/example_input`，OpenCode `buildPrompt()` 未写入完整 manifest 约束 | 继续补齐 |
| T-003 smoke test 漏检 | 部分处理 | OpenCode 缺失测试文件已返回失败并触发修复路径；但 OpenCode 有测试文件且测试失败时仍可能 promote 为 Passed | 必修 |
| T-004 repair 响应契约 | 部分处理 | 后端/shared contract 已改为 `version_id: string \| null`；前端 `repairGeneration()` 类型仍声明 `version_id: string` | 必修 |
| T-005 版本/Diff/日志 UI | 未处理 | API helper 存在，但工作区 UI 未消费，`CompletionSummary` 仍传 `version={null}` | P2 完整验收前处理 |
| T-006 runner fallback 状态 | 未处理 | Python runner 异常 fallback 仍返回 `status: "success"`，会掩盖真实失败 | P2 完整验收前处理 |
| T-007 环境自检/reset | 未处理 | 仍只有基础 `/health`/`/healthz`，没有深度自检和 demo reset | 后续迭代 |
| T-008 P2 专项 E2E | 未处理 | 现有 P0/P1 E2E 覆盖主链路，但没有独立 `p2-demo-flows.spec.ts` | 后续迭代 |
| T-009 Docker 安全增强 | 未处理 | 已有 `--init`、资源限制、`no-new-privileges`、`--network none`，未补 `cap-drop/read-only/tmpfs` | 后续迭代 |
| T-010 CLI/runner 测试 | 未处理 | Python runner 有基础测试，CLI 薄层和 manifest/error/fallback 专项覆盖不足 | 后续迭代 |

当前门禁状态：

| 命令 | 状态 | 备注 |
|---|---|---|
| `npm run lint` | 未通过 | `GenerationWorkspace.tsx` 引用未配置的 `react-hooks/exhaustive-deps` rule |
| `npm run typecheck` | 通过 | 最近审查已验证 |
| `npm run test` | 通过 | 需非沙箱权限运行 Nest/Supertest 监听本地端口 |
| `npm --workspace @agent-builder/web run test:e2e` | 通过 | 4 条 Playwright 主流程通过 |

## 四、P0 必修项

### T-001：修复 lint 门禁

**状态：未处理。**

**问题：** 当前 `npm run lint` 失败，主要原因是 `GenerationWorkspace.tsx` 使用了未配置的 `react-hooks/exhaustive-deps` 规则注释。

**修改建议：**

1. 删除或改写 `react-hooks/exhaustive-deps` disable 注释，避免引用不存在的 ESLint rule。
2. 若需要 hooks 规则，应正式安装并配置 `eslint-plugin-react-hooks`，但不建议为一个注释引入新依赖。
3. 不建议为一个注释单独引入 hooks 插件；优先调整 effect 依赖或删除该 disable 注释。

**验收：**

```bash
npm run lint
npm run typecheck
```

两条命令均通过。

### T-002：实现生成物 manifest 契约

**状态：部分处理。**

**已处理：**

1. `packages/shared-contracts/src/manifest.ts` 已定义 `AgentBuilderManifest`。
2. TemplateEngine 已生成 `agent_builder_manifest.json`。
3. Python runner 已优先尝试读取 `agent_builder_manifest.json`。
4. OpenCode v1 命令文案已包含 manifest 必需文件提示。

**未处理：**

1. runner 读取 manifest 后尚未真正使用 `entrypoint`、`test_command`、`run_command`、`example_input`。
2. `.agent_builder/prompt.md` 的 `buildPrompt()` 未写入 manifest 和 smoke test 必需文件清单，v0/v3 CLI 风格可能丢失约束。
3. 缺少 manifest schema 校验与专项测试。

**问题：** P2 计划要求 OpenCode/TemplateEngine 输出并消费 `agent_builder_manifest.json`。当前只完成了“生成/读取入口”，尚未形成完整契约。

**修改建议：**

1. 在 shared contracts 中定义 manifest schema。
2. TemplateEngine 固定生成 `agent_builder_manifest.json`。
3. OpenCode prompt 将 manifest 列为必需文件，并给出 JSON 示例。
4. Python runner 优先读取 manifest，缺失时才走自动发现 fallback。
5. export zip 保留 manifest，README 中说明 manifest 字段含义。

**建议字段：**

```json
{
  "schema_version": "1.0",
  "project_type": "agent",
  "entrypoint": "src/agent.py",
  "test_command": "pytest tests/test_agent_smoke.py",
  "run_command": "python -m src.agent",
  "example_input": "我最近的职业发展会怎样？",
  "runtime": {
    "framework": "openjiuwen",
    "mode": "mock-compatible"
  }
}
```

**验收：**

1. Agent 与 Workflow 模板均生成 manifest。
2. OpenCode 生成缺失 manifest 时会触发修复或明确失败。
3. runner 测试覆盖 manifest 优先路径和 fallback 路径。

### T-003：修复 smoke test 漏检

**状态：部分处理。**

**已处理：**

1. OpenCode 模式下缺失 `tests/test_*.py` 时，不再静默跳过。
2. 缺失测试文件会记录 `MISSING_SMOKE_TEST` 风格事件，并返回失败结果供 retry/repair 使用。

**未处理：**

1. OpenCode 模式下 pytest 执行失败时，当前仍可能因为 `passed || this.codegenEngineName() === 'opencode'` 被 promote 为 Passed。
2. 还缺少覆盖“有测试文件但测试失败不能晋级”的 orchestration 回归测试。

**问题：** 缺失测试文件路径已修，但 smoke test 失败误晋级仍会把失败版本标成可用版本。

**修改建议：**

1. 对 OpenCode 输出，缺失 `tests/test_agent_smoke.py` 或 `tests/test_workflow_smoke.py` 应视为失败。
2. 失败原因使用稳定错误码，例如 `MISSING_SMOKE_TEST`。
3. 自动 repair prompt 中明确要求补齐 smoke test 和 manifest。
4. TemplateEngine 可保留确定性 smoke test，作为 fallback 基线。

**验收：**

1. 缺失测试文件不会产生 passed version。
2. retry/repair 后测试文件存在并被执行。
3. 新增 orchestration 测试覆盖 pytest exit 4 或无测试文件场景。

### T-004：修订 repair 响应契约

**状态：部分处理。**

**已处理：**

1. 后端 `repair()` 不再返回空字符串版本 ID，改为 `version_id: null`。
2. shared contract 已同步为 `version_id: string | null`。
3. repair 不再预创建孤儿版本，继续由 pipeline 生成并 promote 新版本。

**未处理：**

1. 前端 `repairGeneration()` 仍以内联类型声明 `version_id: string`，未复用 shared contract 的 `RepairResponse`。
2. `instruction` 当前只记录 debug log，尚未进入 repair prompt。

**问题：** 后端契约已修正，但前端类型和修复指令语义仍未完全对齐。

**修改建议：**

1. 不在 repair 入口预创建孤儿版本，继续由 pipeline promote version。
2. repair 响应改为返回 `generation_id`、`status`、`pipeline_started`，避免伪造 version id。
3. 如果必须保留 `version_id`，应改为可选字段并在 shared contract 中同步调整。
4. `instruction` 参数应进入 repair prompt 或从 API 中移除。

**验收：**

1. repair API 响应与 shared contract 一致。
2. 前端 ErrorPanel 调用 repair 后能刷新 generation 状态。
3. repair 不产生 orphan version，也不返回空 version id。

### T-005：补齐版本、Diff、日志 UI

**状态：未处理。**

**问题：** 后端已有 versions、diff、runs、run log API，但前端几乎未使用。P2 D5/D7 要求用户能从完成页看到版本、diff、日志和激活入口。

**修改建议：**

1. `CompletionSummary` 传入当前 active version，显示版本号、engine、fallback、test status。
2. 工作区新增“版本”视图，展示版本列表、active 标记、创建时间、测试状态。
3. 新增 diff 面板，调用 `getVersionDiff()`。
4. ErrorPanel 和完成页增加“查看日志”入口，调用 run log API。
5. 激活历史版本时明确提示会改变 active version。

**验收：**

1. 用户无需手工调用 API 即可查看版本和 diff。
2. repair 后新版本出现在版本列表中。
3. 错误状态能跳转到相关日志。

## 五、P1 改进项

### T-006：让 runner fallback 不再伪装成功

**状态：未处理。**

**问题：** Python runner 捕获异常后返回 `status: "success"` 和 mock 输出。这样有利于 demo 不中断，但会隐藏真实工程运行失败。

**修改建议：**

1. runner 返回结构增加 `mode: "real" | "mock_fallback"`。
2. 真实 import 或执行失败时，`status` 应为 `failed` 或 `fallback`，不要直接标记 success。
3. UI 中用明显状态标记 mock fallback。
4. 标准 demo 可以继续允许 fallback，但要在测试台和运行页展示原因。

**验收：**

1. 真实运行失败不会被记录为纯成功。
2. 用户能看到 fallback 原因。
3. E2E 同时覆盖 real-compatible 和 mock fallback 展示。

### T-007：补齐环境自检和 demo reset

**状态：未处理。**

**问题：** P2 计划中的环境自检、seed/reset、日志定位仍不完整。当前状态 chip 更像静态展示，不能在演示前判断环境是否可用。

**修改建议：**

1. 新增 `/health/deep` 或 `/demo/diagnostics`，检查 API、OpenCode、Docker、模型 key、Python runner。
2. 首页和工作台展示自检结果。
3. 提供 demo workspace reset 能力，清理失败生成物并恢复标准示例。
4. runbook 写清楚启动、自检、reset、常见失败恢复步骤。

**验收：**

1. 演示前 1 分钟内可以判断环境状态。
2. key 或 Docker 不可用时，系统明确进入 mock/fallback 模式。
3. reset 后两条标准 demo 可以重新执行。

### T-008：补齐 P2 专项 E2E 文件

**状态：未处理。**

**问题：** 当前 E2E 已覆盖主流程，但没有单独的 `p2-demo-flows.spec.ts` 来承载 P2 验收语义。

**修改建议：**

1. 新增 `apps/web/e2e/p2-demo-flows.spec.ts`。
2. 覆盖塔罗 Agent 和售前 Workflow 两条标准脚本。
3. 每条脚本至少验证：Spec 确认、生成完成、默认源码打开、运行结果、版本摘要、导出。
4. 增加 fallback 标记断言，避免 mock 被误认为真实运行。

**验收：**

```bash
npm --workspace @agent-builder/web run test:e2e
```

P2 专项脚本稳定通过。

## 六、P2 加固项

### T-009：Docker 沙箱安全基线增强

**状态：未处理。**

**问题：** 当前已有 `--init`、资源限制、`no-new-privileges`、`--network none` 等基础参数，但未覆盖 read-only、tmpfs、cap drop 等更完整的隔离基线。

**修改建议：**

1. 增加 `--cap-drop=ALL`。
2. 评估 `--read-only`，为必须写入目录配置 `--tmpfs`。
3. 收敛可写目录到当前 generation/version workspace。
4. 为 Docker command builder 补齐单元测试。
5. 前端展示 sandbox isolation level。

**验收：**

1. 安全参数有测试覆盖。
2. OpenCode 仍能在允许目录内写文件。
3. demo 不因安全增强阻断。

### T-010：补 CLI 与 runner 专项测试

**状态：未处理。**

**问题：** `p2_defects.md` 保留了 D-026，runner auto-discovery 也主要依赖间接测试。

**修改建议：**

1. 为 Python runner CLI 增加薄层测试，覆盖 argparse 到 runner 调用。
2. 为 manifest、自动发现、错误返回、mock fallback 增加专项测试。
3. 保留集成测试，但不要只依赖 E2E 覆盖 runner 行为。

**验收：**

1. CLI 入口参数错误、agent run、workflow run 均有测试。
2. auto-discovery 缺失/多候选/无入口三类场景有明确断言。

## 七、建议实施顺序

### Milestone A：恢复可验收状态

1. T-001 修复 lint。
2. T-003 修复 OpenCode smoke test 失败误晋级。
3. T-004 同步前端 repair 响应类型。
4. 跑通 `npm run lint && npm run typecheck && npm run test`。

完成后，P2 至少不再被基础质量门禁阻断。

### Milestone B：补齐 P2 核心闭环

1. T-002 manifest 契约。
2. T-003 smoke test 防漏剩余测试覆盖。
3. T-005 版本、diff、日志 UI。
4. T-006 runner fallback 状态语义。

完成后，P2 计划中的“生成、运行、测试、修复、追踪”才算完整。

### Milestone C：提升 demo 可重复性

1. T-007 环境自检和 reset。
2. T-008 P2 专项 E2E。
3. 更新 runbook 和 `p2_defects.md` 的保留项。

完成后，内部演示可以重复彩排，并能解释环境差异。

### Milestone D：安全与测试补强

1. T-009 Docker 安全基线增强。
2. T-010 CLI 与 runner 专项测试。

完成后，P2 可以进入下一阶段产品化评审。

## 八、最终验收门禁

P2 改进完成前，至少需要以下命令通过：

```bash
npm run lint
npm run typecheck
npm run test
npm --workspace @agent-builder/web run test:e2e
```

另外需要保留以下人工验收证据：

1. 塔罗 Agent 从首页到导出完整录屏或截图。
2. 售前 Workflow 从首页到最终 Markdown 报告完整录屏或截图。
3. OpenCode 失败或 Docker 不可用时的 fallback 标记截图。
4. 版本列表、diff、日志查看截图。
5. 导出 zip 解压后的文件清单，确认不包含 `.env`、`.opencode/`、`.agent_builder/` 等敏感或内部目录。

## 九、暂不处理事项

以下事项继续后移，不纳入本轮 P2 改进：

1. GitHub OAuth、自动开 PR、远端仓库同步。
2. 多项目空间、多人协作、权限体系。
3. PostgreSQL、Redis、BullMQ、worker pool 生产化迁移。
4. Agent Store、Skills 独立创建和发布。
5. 在线源码编辑回写。
6. gVisor 完整落地。
