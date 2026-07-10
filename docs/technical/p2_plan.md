# Agent Builder P2 内部 Demo 价值计划

版本：v0.2 | 日期：2026-07-10

依据：`docs/prd/PRD-v0.3-agent-builder.md` + `docs/technical/p1_implementation_report.md` + `docs/technical/agent_builder_architecture.md`

## 一、P2 定位

P1 已经把 Agent Builder 推进到“真实 LLM + OpenCode 代码生成 + Docker 沙箱”的可演示 Beta，但用户感知仍然容易被以下问题打断：

1. 生成完成后，Agent 测试台与 OpenCode 输出结构不完全兼容。
2. Spec 确认已有后端 API，但前端缺少可见的确认、修改和继续生成入口。
3. 非标准 prompt 的生成质量和 smoke test 稳定性还不够，容易出现缺少测试文件、Runner 无法解析输出等失败。
4. 模型、沙箱、fallback、重试、修复等能力已经存在一部分，但前端表达不够清楚，演示用户不知道系统正在做什么。
5. 现有 P2 任务里 GitHub 导出、多项目、生产部署等内容偏产品化，对“内部 demo 可用感”的贡献靠后。

因此，P2 不以“可交付产品”作为第一目标，而以“内部 demo 有价值”为第一目标：

```text
用户输入自然语言
-> 看到结构化 Spec 和生成计划
-> 确认后进入生成工作台
-> 看到真实生成过程、文件变化、测试结果
-> 能在 Agent 测试台或 Workflow 运行页试用结果
-> 能查看源码、版本、日志，并导出代码包
```

P2 的核心判断标准是：内部演示时，售前、产品、技术负责人能在 10 到 15 分钟内完整理解“自然语言生成 OpenJiuwen Agent/Workflow 工程”的价值，而不是只看到一组后端 API 或一段不可运行的代码。

## 二、P2 成功标准

### 2.1 必须达成

1. 两条标准演示脚本稳定可跑：
   - 塔罗占卜 Agent。
   - 售前需求分析 Workflow。
2. 首页、Prompt 模板、Spec 确认、生成工作台、源码查看、效果测试、导出形成一条连续路径。
3. 生成过程至少展示：解析模式、生成引擎、计划步骤、文件变更、命令执行、测试结果、版本摘要。
4. Agent 测试台能对 OpenCode 生成的 Agent 工程完成一次用户输入和回复展示。
5. Workflow 运行页能展示节点状态、节点输入输出、耗时和最终 Markdown 报告。
6. 失败时用户能看到明确原因和可执行动作，例如“重新生成”“修复并重试”“回到 Spec 修改”。
7. 所有 mock、fallback、真实 LLM、OpenCode、Docker 沙箱状态必须在 UI 中明确标记，不让演示用户误解。
8. 导出的 zip 包包含 README、`.env.example`、源码、示例输入和 smoke test，并过滤密钥、缓存和内部工作目录。

### 2.2 可以接受

1. 内部 demo 可以使用 mock OpenJiuwen runtime，但必须标记为 mock。
2. 非标准 prompt 可以使用 best-effort 生成，只要失败路径可理解、可修复、可回退。
3. 模型配置可以先依赖 `.env`，前端只展示“已配置/未配置”和当前 provider/model。
4. 沙箱可以先使用 Docker hardened baseline，不强制在 P2 完成 gVisor。
5. P2 不要求多人协作、云端生产部署、GitHub PR、Agent Store 或 Skills 独立创建。

### 2.3 明确后移

| 后移项 | 后移原因 |
|---|---|
| GitHub 导出 / 创建 PR | 对内部 demo 是加分项，不是核心闭环 |
| 多项目空间 | 当前任务历史已能支撑单机演示 |
| PostgreSQL / Redis / BullMQ / Worker Pool | 属于生产化，不直接增强 demo 可用感 |
| 完整模型配置中心 | P2 先做状态可见和切换入口，密钥管理后移 |
| gVisor 完整落地 | 保留架构方向，P2 先完成 Docker 安全基线 |
| 在线源码编辑 | PRD P0 可只读，先保证查看、运行、导出 |

## 三、P1→P2 承接策略

| P1 现状 / 遗留 | P2 Demo 处理策略 | 用户可感知结果 |
|---|---|---|
| LLM Spec Parser + deterministic fallback 已完成 | 在前端暴露 parser mode、parse warnings、Spec 确认页 | 用户知道系统理解了什么，并能改 |
| OpenCodeEngine 已能在 Docker sandbox 执行 | 强化 prompt、生成清单、manifest 和 smoke test 修复闭环 | 用户看到真实代码生成，而不是固定模板 |
| DockerSandboxRunner + Mock 降级已完成 | UI 显示当前 sandbox mode、network、mock/fallback 状态 | 用户能判断演示可信度 |
| Agent 测试台与 OpenCode 输出不兼容 | Runner 自发现 + manifest 协议 + 友好错误 | 生成后能立即试用 Agent |
| Workflow mock runtime 已增强 | 补齐前端运行记录和节点详情 | 用户能看到流程编排价值 |
| 版本、Diff、日志、修复 API 已有 | 工作台做可见入口和演示路径串联 | 用户能理解“可恢复、可追踪” |
| Prompt 模板和任务历史已完成 | 作为 demo 入口，而不是隐藏能力 | 演示者能快速进入标准场景 |

## 四、P2 任务清单

### Task D0: Demo 脚本与验收数据锁定

**目标：** 先锁定内部 demo 的叙事和可重复输入，避免实现方向发散。

| 子任务 | 说明 |
|---|---|
| 标准脚本 A | 塔罗占卜 Agent：输入问题、抽牌、解读、源码查看、导出 |
| 标准脚本 B | 售前需求分析 Workflow：需求文本、节点执行、报告输出、源码查看、导出 |
| 演示模式开关 | `DEMO_MODE=true` 时优先使用稳定 prompt 模板、固定示例输入和可控 fallback |
| 验收数据 | 保存两个 prompt、示例输入、预期完成摘要、预期文件清单 |
| 演示彩排清单 | 启动命令、模型配置检查、Docker 检查、常见失败恢复步骤 |

**验收：**

1. `README.md` 或 `docs/technical` 中有一份可执行的内部 demo runbook。
2. 两个标准脚本可以从首页开始，不需要手工调用 API。
3. 演示者可以在 15 分钟内完成两条主链路。

### Task D1: 首页与 Prompt 模板改成 Demo 入口

**目标：** 让用户第一屏就知道可以生成 Agent 或 Workflow，并快速选择标准示例。

| 子任务 | 说明 |
|---|---|
| 首页主入口 | 保留自然语言大输入框和 Agent/Workflow 类型切换 |
| 模板卡片 | 将 6 个 Prompt 模板分组，突出 2 个标准 demo 模板 |
| 不可用类型处理 | Skills、网页应用、移动应用等入口隐藏或灰态并提示暂未开放 |
| 当前环境状态 | 显示 LLM、OpenCode、Docker sandbox、mock fallback 的状态摘要 |
| 历史任务入口 | 最近任务可一键继续查看，避免演示中断后从零开始 |

**验收：**

1. 用户无需阅读文档即可从首页进入塔罗 Agent 或售前 Workflow 生成。
2. 首页不暴露 P0/P2 不支持的独立 Skills 创建流程。
3. 环境缺失时，首页给出明确提示，而不是生成中才失败。

### Task D2: Spec 确认前端闭环

**目标：** 把已实现的 draft/confirm API 变成用户可见流程，降低 LLM 不确定性。

| 子任务 | 说明 |
|---|---|
| Draft 页面 | `/drafts/:id` 展示 Spec 摘要、解析模式、warnings |
| 可编辑 JSON | 支持编辑 Agent/Workflow Spec JSON，并实时 schema validate |
| 摘要视图 | Agent 显示工具、模型、验收项；Workflow 显示节点、边、输入输出 |
| Confirm 按钮 | 确认后创建 generation 并跳转工作台 |
| 返回修改 | validation 失败或用户不满意时可回到 prompt 修改 |

**验收：**

1. 标准 Agent 和 Workflow prompt 都会进入 Spec 确认页。
2. 用户能修改 Spec 中的名称、描述、工具或节点说明。
3. validation 错误能定位到字段，并阻止确认。

### Task D3: Runner 与生成物兼容

**目标：** 解决 P1 最大用户可见缺口：生成完成后能在测试台真实跑起来。

| 子任务 | 说明 |
|---|---|
| 生成物 manifest | 要求 OpenCode/TemplateEngine 输出 `agent_builder_manifest.json`，记录类型、入口文件、测试命令、运行命令、示例输入 |
| 自动发现 fallback | manifest 缺失时扫描 `src/**/agent.py`、`src/**/workflow.py`、`workflow.yaml`、`pyproject.toml` |
| PYTHONPATH 标准化 | Runner 统一设置项目根、`src`、editable install 后的 import 路径 |
| Agent I/O 协议 | Runner 输出统一为 `{reply, tool_calls, logs, raw}` |
| Workflow I/O 协议 | Runner 输出统一为 `{nodes, final_output, logs, raw}` |
| 友好错误 | import、依赖、入口、输出解析失败时返回可读错误和修复建议 |

**验收：**

1. Agent 测试台不再依赖固定目录结构才能运行。
2. Workflow 运行页能展示节点状态和最终报告。
3. Runner 失败时不再出现泛化的“Python Runner 输出无法解析”。

### Task D4: 生成质量闭环

**目标：** 提高 OpenCode 生成成功率，并让失败可自动修复、可解释。

| 子任务 | 说明 |
|---|---|
| Prompt 强化 | 在 OpenCode prompt 中直接嵌入 Spec JSON、必需文件清单、禁止框架和测试要求 |
| smoke test 防漏 | 要求生成阶段必须产出 `tests/test_agent_smoke.py` 或 `tests/test_workflow_smoke.py` |
| exit 4 修复 | pytest 未找到测试文件时自动触发修复 prompt，补齐测试文件和 manifest |
| Lint gate | 保留 contract、forbidden import、secret scan；结果显示到工作台 |
| 重试可见 | UI 展示第几次生成/修复、失败原因、下一步动作 |
| 稳定 fallback | 标准 demo 在 OpenCode 失败时允许回退 TemplateEngine，但必须标记 fallback |

**验收：**

1. 两个标准 demo 在 clean workspace 下连续生成 3 次，至少 2 次无需人工干预完成。
2. 标准 demo 即使触发 fallback，也能完成源码查看、测试台、导出。
3. 非标准 prompt 失败时有明确修复入口和错误摘要。

### Task D5: 工作台可感知体验补齐

**目标：** 让生成过程和结果对非开发用户也可理解。

| 子任务 | 说明 |
|---|---|
| Timeline 分组 | 将事件按“理解需求、生成代码、运行测试、完成交付”分组 |
| Completion Summary | 显示生成对象、文件数量、测试结果、版本号、engine、parser mode、fallback |
| 默认源码文件 | Agent 默认打开 `src/**/agent.py`，Workflow 默认打开 `src/**/workflow.py` 或 `workflow.yaml` |
| 底部面板 | 终端、运行记录、输出三栏内容与当前任务联动 |
| 错误面板 | 修复重试、回到 Spec、查看日志三个动作清晰可见 |
| 修改记录 | 版本摘要、Diff、激活当前版本入口可从完成页进入 |

**验收：**

1. 用户能从完成页直接进入测试台、源码、导出、日志。
2. Timeline 不只是原始日志，要能表达“系统正在完成什么”。
3. 错误状态不死路，必须至少有一个下一步动作。

### Task D6: Agent 测试台与 Workflow 运行页演示化

**目标：** 让生成结果不是“看代码”，而是“可以试用”。

| 子任务 | 说明 |
|---|---|
| Agent 测试台 | 展示 Agent 名称、模型、工具数量、输入框、回复、工具调用记录 |
| Workflow 运行页 | 展示节点列表/节点图、状态、输入输出、耗时、最终 Markdown |
| 示例输入 | 从 manifest 或 examples 自动加载示例输入 |
| 重新运行 | 支持用同一示例重新运行，清空上次输出 |
| mock 标记 | mock runtime 输出必须带明显标记 |

**验收：**

1. 塔罗 Agent 可以输入一个占卜问题并看到回复。
2. 售前 Workflow 可以加载示例需求并输出 Demo 清单和报告。
3. 运行记录能显示工具调用或节点执行细节。

### Task D7: 导出、版本与日志打通

**目标：** 将 P1 已有 API 变成 demo 中可展示的交付能力。

| 子任务 | 说明 |
|---|---|
| 导出入口 | 完成页和源码页都可导出 zip |
| 导出过滤 | 过滤 `.agent_builder/`、`.opencode/`、`opencode.json`、密钥、缓存 |
| README 质量 | 生成 README 包含安装、配置、运行、测试、mock/real 切换说明 |
| 版本列表 | 完成页显示当前版本和历史版本 |
| Diff 查看 | 支持查看当前版本相对上一版本的 unified diff |
| 日志查看 | 运行日志脱敏、tail、stream 入口在错误面板和完成页可达 |

**验收：**

1. 导出包解压后能看到完整工程结构和 smoke test。
2. 版本、Diff、日志不需要手工记 API 地址。
3. 导出包不包含 `.env` 明文密钥。

### Task D8: Demo 运维与环境自检

**目标：** 降低内部演示失败概率。

| 子任务 | 说明 |
|---|---|
| 一键启动 | 保留 Docker Compose，本地启动步骤不超过 3 条命令 |
| 环境自检 API | 检查 API、Web、OpenCode、Docker、模型 key、Python Runner |
| UI 状态灯 | 首页和工作台显示环境状态 |
| seed/reset | 支持清理 demo workspace 和恢复标准示例 |
| 日志定位 | runbook 写清楚日志路径和常见错误处理 |

**验收：**

1. 演示前能在 1 分钟内判断环境是否可用。
2. 模型 key 或 Docker 不可用时，系统能进入 mock/fallback 演示路径。
3. 演示数据可重置，避免历史失败任务污染现场。

### Task D9: 安全基线，不做过度产品化

**目标：** 修复最明显的沙箱风险，同时不牺牲内部 demo 速度。

| 子任务 | 说明 |
|---|---|
| Docker flags | 补齐 `--init`、`--security-opt no-new-privileges`、资源限制 |
| 写目录收敛 | 只允许当前 generation/version workspace 可写 |
| tmpfs 清单 | 为 opencode 必需目录配置 tmpfs，避免 read-only 破坏生成 |
| env allowlist | 只注入允许的模型和运行变量 |
| 前端展示 | 显示当前 sandbox runtime 和隔离等级 |

**验收：**

1. 安全参数有单元测试覆盖。
2. opencode 仍能写入当前任务 workspace。
3. demo 不因 gVisor、网络白名单等非必要能力阻塞。

## 五、优先级矩阵

| 优先级 | 任务 | 理由 |
|---|---|---|
| P0 | Task D0: Demo 脚本与验收数据锁定 | 没有固定脚本，就无法判断 demo 是否真的可用 |
| P0 | Task D1: 首页与 Prompt 模板改成 Demo 入口 | 内部 demo 必须从用户入口开始，而不是从后端 API 开始 |
| P0 | Task D2: Spec 确认前端闭环 | 让用户看见系统理解结果，是生成可信度的关键 |
| P0 | Task D3: Runner 与生成物兼容 | 生成后不能运行是最大用户可见失败 |
| P0 | Task D4: 生成质量闭环 | 直接决定现场成功率 |
| P0 | Task D6: Agent 测试台与 Workflow 运行页演示化 | 让用户感知“可用”，而不是只看源码 |
| P1 | Task D5: 工作台可感知体验补齐 | 让过程可解释、结果可理解 |
| P1 | Task D7: 导出、版本与日志打通 | 展示工程交付和可追踪能力 |
| P1 | Task D8: Demo 运维与环境自检 | 降低演示失败率 |
| P2 | Task D9: 安全基线，不做过度产品化 | 必要底线，不能挤占 demo 闭环 |

## 六、建议实施顺序

### Milestone 1: Demo 主链路可跑

目标：先让两个标准示例从生成到运行不掉链。

1. D0 锁定脚本、示例输入、预期文件清单。
2. D1 提供首页标准模板和 Agent/Workflow 类型入口。
3. D2 提供最小可用 Spec 确认页。
4. D3 增加 manifest、Runner 自发现、统一 I/O。
5. D4 强化 prompt、补齐 smoke test 修复、标准 demo fallback。
6. D6 打通 Agent 测试台和 Workflow 运行页。

完成判定：塔罗 Agent 和售前 Workflow 可以从首页开始完成 Spec 确认、生成、运行和源码查看。

### Milestone 2: Demo 体验像产品

目标：让演示对象不需要理解后端 API，也能看懂流程。

1. D5 Timeline、完成摘要、错误面板、默认源码文件。
2. D7 导出、版本、Diff、日志入口。
3. D1 首页环境状态、历史任务入口和模板分组增强。

完成判定：用户从首页到导出形成连续路径，失败也有下一步。

### Milestone 3: Demo 可重复、可恢复

目标：降低现场风险，给内部试用留出恢复空间。

1. D8 环境自检、seed/reset、runbook。
2. D9 Docker 安全基线和隔离等级展示。
3. 两条标准脚本连续彩排。
4. 补齐 E2E 和回归测试。

完成判定：clean workspace 下可以重复彩排，环境缺失时可以明确进入 mock/fallback 路径。

## 七、验收矩阵

| PRD 要求 | P2 验收点 | 证明方式 |
|---|---|---|
| FR-001 首页自然语言入口 | Agent/Workflow 类型选择、自然语言输入、标准模板、不可用类型灰态 | Playwright 首页用例 + 截图 |
| FR-002 需求解析与生成计划 | Spec 确认页、parse warnings、计划步骤展示 | API 测试 + Web 测试 |
| FR-003 Agent 代码生成 | 标准 Agent 文件、manifest、smoke test、测试台运行 | E2E: tarot agent |
| FR-004 Workflow 代码生成 | workflow 文件、节点、manifest、运行记录、最终报告 | E2E: presales workflow |
| FR-005 生成过程可观测 | Timeline 分组、文件事件、命令事件、测试结果 | Web 组件测试 + E2E |
| FR-006 自动运行与 smoke test | pytest 或等效 smoke test 自动执行，失败可修复 | API 编排测试 |
| FR-007 Agent 效果测试台 | 输入消息、回复、工具调用记录 | E2E: agent run |
| FR-008 Workflow 运行记录 | 节点状态、输入输出、耗时、最终输出 | E2E: workflow run |
| FR-009 源码查看 | 文件树、代码 viewer、底部面板、默认打开核心文件 | Web 测试 |
| FR-010 代码导出 | zip 完整、README、无密钥、可运行 smoke test | API 导出测试 |
| FR-011 版本与修改记录 | 版本号、摘要、Diff、激活入口 | API + Web 测试 |
| FR-012 错误处理 | 修复重试、回到 Spec、查看日志 | API 错误测试 + Web 测试 |

## 八、测试门禁

P2 完成前至少通过以下命令：

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
```

新增或重点强化的测试：

| 测试 | 覆盖 |
|---|---|
| `apps/web/e2e/p2-demo-flows.spec.ts` | 首页 -> Spec -> 生成 -> 测试台/运行页 -> 源码 -> 导出 |
| `apps/api/src/orchestration/orchestrator.service.spec.ts` | manifest、runner I/O、修复重试 |
| `apps/api/src/sandbox/docker-command-builder.spec.ts` | Docker 安全参数、env allowlist、workspace mount |
| `services/python-runner/tests/test_runner.py` | Agent/Workflow 自发现、统一输出、错误文案 |
| `apps/web/src/components/workspace/*.test.tsx` | Timeline、CompletionSummary、ErrorPanel |

如果 `npm run test:e2e` 依赖真实模型或 Docker，必须提供 mock/fallback E2E 配置，确保 CI 和本地无 key 环境也能验证主体验。

## 九、工作量估算

| 任务 | 预估 | 说明 |
|---|---:|---|
| D0 Demo 脚本与验收数据锁定 | 0.5d | 文档、示例输入、runbook |
| D3 Runner 与生成物兼容 | 1.5d | manifest、自动发现、I/O、错误处理 |
| D4 生成质量闭环 | 1.0d | prompt、smoke test 修复、重试可见 |
| D6 测试台与运行页演示化 | 1.0d | Agent/Workflow 两条结果页 |
| D2 Spec 确认前端闭环 | 1.0d | draft 页面、JSON validate、confirm |
| D5 工作台体验补齐 | 1.0d | timeline、summary、错误面板 |
| D7 导出、版本与日志打通 | 0.75d | 主要是前端入口和验证 |
| D1 首页与 Prompt 模板增强 | 0.5d | 模板分组、状态摘要 |
| D8 Demo 运维与环境自检 | 0.75d | health、自检、seed/reset、runbook |
| D9 安全基线 | 0.5d | Docker flags、测试、展示 |
| **Total** | **约 8.5 个工作日** | 可按 Milestone 逐步验收 |

## 十、P2 不做清单

1. 不做 Skills 独立创建、管理、测试和导出。
2. 不做 Agent Store。
3. 不做 GitHub OAuth、自动开 PR。
4. 不做多租户、企业权限、计费、审计。
5. 不做 PostgreSQL/Redis/BullMQ 的生产化迁移。
6. 不做远端生产部署。
7. 不做在线代码编辑回写。
8. 不支持 LangGraph、CrewAI、OpenAI Agents SDK、Dify 等非 OpenJiuwen 框架生成。

## 十一、风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| OpenCode 输出结构不稳定 | 测试台和运行页失败 | manifest + 自动发现 + 标准 demo fallback |
| 真实 LLM 不稳定或 key 缺失 | 演示中断 | mock parser/runtime + 首页环境状态 |
| Docker 环境不可用 | sandbox 失败 | MockSandboxRunner 降级并明确标记 |
| smoke test 缺失或 exit 4 | 用户看到失败 | 自动修复 prompt + 必需文件清单 |
| UI 暴露过多内部细节 | 非技术用户看不懂 | Timeline 分组、完成摘要、明确下一步 |
| 过早做生产化 | 核心 demo 闭环延迟 | GitHub、多项目、部署全部后移 |

## 十二、最终完成定义

P2 只有在以下证据同时成立时才算完成：

1. 两条标准 demo 的 E2E 测试通过。
2. 手工彩排可以从首页开始，并完成生成、运行、源码查看、导出。
3. Agent 测试台与 Workflow 运行页对 OpenCode 生成物可用。
4. 失败状态具备修复、回到 Spec 或查看日志的可执行路径。
5. 导出包经过密钥过滤，并包含可运行说明。
6. UI 明确标记真实 LLM、OpenCode、Docker、mock、fallback 状态。
7. 文档中保留 runbook 和已知限制，内部 demo 参与者能独立复现。
