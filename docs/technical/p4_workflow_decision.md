# P4 Workflow Real Path 决策

日期: 2026-07-13 | 决策: P4 不验收真实 Workflow

## 决策输入

基于 `openjiuwen_api_inventory.md` 和源码阅读（`agent-core/openjiuwen/core/application/workflow_agent/`）：

1. OpenJiuwen **提供** WorkflowComponent / Runner API。
2. API 路径: `openjiuwen.core.application.workflow_agent.WorkflowAgent`。
3. Workflow 定义方式: YAML + Python component files。
4. 运行方式: `Runner.run_workflow()` 或 `WorkflowSession`。
5. 节点状态、输入输出、耗时理论上可记录。
6. 可在当前 sandbox image 中运行（已安装 openjiuwen 0.1.15）。

**但是**：

- Agent real path 仍在调试中（prompt 质量、gate 验收）。
- Workflow 比 Agent 更复杂（多节点编排、条件分支、错误恢复）。
- 没有时间在 P4 窗口内完成 Agent + Workflow 两条真实路径。
- 前端 Workflow 运行面板（`WorkflowRunPanel`）尚未改造。

## 决策

**P4 不验收真实 OpenJiuwen Workflow。**

## 影响

1. PRD、UI、README 中 Workflow 标记为 **lightweight/test-only**。
2. P4 验收报告列出 "Workflow real path 未覆盖"。
3. 当前生成 Workflow 时使用 TemplateEngine 或 lightweight prompt。
4. Demo 话术中禁止声称 "Workflow 已真实 OpenJiuwen 集成"。
5. M4 gate (`validateRealOpenJiuwenAgent`) 仅检查 Agent，不检查 Workflow。

## P5 路线图

若 P5 要实现 Workflow real path，需：

1. 基于 `openjiuwen_api_inventory.md` 盘点 WorkflowComponent API。
2. 设计 OpenCode prompt 的 Workflow 代码模板。
3. 实现 `validateRealOpenJiuwenWorkflow()` gate。
4. 改造前端 `WorkflowRunPanel` 展示节点 trace。
5. E2E 脚本增加 Workflow case。
