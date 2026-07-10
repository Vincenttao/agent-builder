# P2 代码审查缺陷清单

版本：v0.1 | 日期：2026-07-11 | 来源：P2 全面代码审查

## 严重等级定义

| 等级 | 含义 | 修复窗口 |
|------|------|---------|
| **S0** | Demo 阻断 — 会导致白屏、数据丢失、安全漏洞 | 下一轮迭代立即修复 |
| **S1** | 高影响 — 用户明显可感知的异常或体验断裂 | 本周内修复 |
| **S2** | 中等 — 边界 case 或非核心路径的问题 | 本 milestone 内修复 |
| **S3** | 低 — 代码整洁度或未来风险 | 后续迭代 |

---

## S0：Demo 阻断

### D-001：repair 状态机绕过

**文件**：`apps/api/src/orchestration/orchestrator.service.ts:281`
**发现者**：API 架构审查

`repair()` 调用 `transitionTo(Planning)` 试图从 `failed`/`completed` 回到 `planning`。但 `canTransition`（`packages/shared-contracts/src/generation.ts:56-64`）只允许线性前进，反向转换静默 no-op。随后 `promoteVersion` → `markCompleted` 直接写 `completed`，完全绕过 `planning → generating → testing`。

**修复方向**：
- `canTransition` 增加 `failed → planning` 和 `completed → planning` 反向边
- 或 `transitionTo` 对非法转换 throw/log 而非静默吞掉

---

### D-002：OpenCode pipeline 耗尽重试后静默失败

**文件**：`apps/api/src/orchestration/orchestrator.service.ts:65-76`
**发现者**：架构审查

`runPipeline` 的 retry 循环中，opencode smoke test 返回 `{passed: false}` 且耗尽 `maxRetries` 后，代码走到 `return;`（第 76 行），未调用 `markFailed()`。Generation 永久卡在 `testing`，不进入 `failed`。

**修复方向**：
```ts
if (!testResult.passed) {
  await this.genService.markFailed(generationId, ErrorCode.TestFailed, '...');
}
return;
```

---

### D-003：SSE 双重连接

**文件**：`apps/web/src/lib/use-generation-events.ts:43-46`
**发现者**：前端审查

`source.onerror` 中手动 `source.close()` + `setTimeout(() => open(), 2000)`。浏览器 EventSource API **自动重连**，导致每次断线产生两个并发 SSE 连接。

**修复方向**：移除手动 `open()` 调用，依赖浏览器内置重连；或使用 `EventSource` 的非标准 `reconnectInterval` 控制重连间隔。

---

### D-004：全局无 React Error Boundary

**文件**：`apps/web/src/app/layout.tsx`
**发现者**：前端审查

应用无任何 Error Boundary。任何组件 JS 异常 → 白屏，无 fallback UI。

**修复方向**：在 `layout.tsx` 添加 `<ErrorBoundary>` 包裹 `{children}`；为关键页面（generations/[id]、drafts/[id]）添加 `error.tsx`。

---

### D-005：路径穿越 URL 编码变体未测试

**文件**：`apps/api/src/files/file-service.ts` 的 `assertSafePath`
**发现者**：测试覆盖审查

当前只测试 `../etc/passwd`。未覆盖 `..%2F`、`..%252F`、`%00`（null byte）、反斜杠 `..\\`、Unicode overlong 编码等绕过变体。这是暴露在 HTTP 上的文件读取 API。

**修复方向**：补充 8-10 个编码变体测试；考虑在 `assertSafePath` 中先做 URL decode 再校验。

---

## S1：高影响

### D-006：并发 pipeline 无保护

**文件**：`apps/api/src/orchestration/orchestrator.service.ts:52`
**发现者**：API 架构审查

`runPipeline` 无 mutex/in-memory-lock。重复 POST 或同时触发 repair 可导致两个 pipeline 并行执行，竞争 `promoteVersion`、`active_version_id`、事件序列。

**修复方向**：`Map<string, Promise<void>>` 作为 per-generation 锁；或数据库 advisory lock。

---

### D-007：retry 循环状态转换断裂

**文件**：`apps/api/src/orchestration/orchestrator.service.ts:92`
**发现者**：API 架构审查

opencode retry 循环中 `continue` 后下一轮调用 `transitionTo(Generating)`。但若上一轮已是 `Testing`，`canTransition(Testing, Generating)` 返回 false。Generation status 与 pipeline 实际进度永久脱节。

**修复方向**：在 retry 循环开头显式重置 status 为 `Planning`；或放宽 `canTransition`。

---

### D-008：OpenCode 绕过 lint gate

**文件**：`apps/api/src/orchestration/orchestrator.service.ts:60-61`
**发现者**：架构审查

```ts
if (this.codegenEngineName() !== 'opencode') {
  lintGeneratedProject(projectPath, spec);
}
```

TemplateEngine 生成物经过契约检查 + forbidden import（langgraph/crewai/dify）+ secret scan。OpenCode 生成物完全跳过。opencode 虽然被 prompt 约束，但没有硬检查。

**修复方向**：对 opencode 也运行 lint gate，失败行为由 throw 改为 warn+event。

---

### D-009：关键 API 失败静默吞掉

**文件**：`apps/web/src/components/workspace/GenerationWorkspace.tsx:46,60`
**发现者**：前端审查

```ts
getGeneration(id).then(setGen).catch(() => undefined);
getFileTree(id).then(setTree).catch(() => undefined);
```

API 完全不可达时，UI 显示空壳（title="生成工作台"、status="等待"），用户看不到任何错误。

**修复方向**：catch 中 set 一个 error state 并渲染 ErrorPanel 或 toast。

---

### D-010：useEffect 无 cancel/AbortController

**文件**：
- `apps/web/src/components/workspace/GenerationWorkspace.tsx:45,58`
- `apps/web/src/components/history/TaskHistory.tsx:32`

**发现者**：前端审查

fetch promise 在组件卸载后仍 resolve → setState on unmounted component。同时无 AbortController → 已发出的请求无法取消。

**修复方向**：添加 `cancelled` flag 或 `AbortController`；`useEffect` cleanup 中 abort。

---

### D-011：Docker sandbox runner 零直接测试

**文件**：`apps/api/src/sandbox/docker-sandbox-runner.ts`
**发现者**：测试覆盖审查

生产隔离层完全未直接测试。`isAvailable()`、`cleanup()`、完整 `run()` 方法、workspace path 替换逻辑均只通过 mock runner 间接覆盖。

**修复方向**：至少添加 `buildDockerArgs` 输出的单元测试；为 Docker runner 的 isAvailable/cleanup 添加测试。

---

### D-012：repair 流程零测试覆盖

**文件**：`apps/api/src/orchestration/orchestrator.service.ts:272-307`
**发现者**：测试覆盖审查

整个 `repair` 方法从未被任何测试调用。包括：version ordering、promotion after repair、active_version 切换、max retries guard。

**修复方向**：在 `orchestration.integration.spec.ts` 增加 repair flow 测试。

---

## S2：中等

### D-013：TaskHistory filter 竞态

**文件**：`apps/web/src/components/history/TaskHistory.tsx:32-39`
**发现者**：前端审查

快速切换 filter 时，旧请求的 `.finally(() => setLoading(false))` 覆盖新请求的 loading 状态。

**修复方向**：使用 `cancelled` flag 或 `AbortController`。

---

### D-014：AgentTestPanel / WorkflowRunPanel 输入框无 label

**文件**：
- `apps/web/src/components/agent/AgentTestPanel.tsx:54`
- `apps/web/src/components/workflow/WorkflowRunPanel.tsx:68`

**发现者**：前端审查

`<input>` 和 `<textarea>` 仅有 `placeholder`，无 `<label>` 或 `aria-label`。不符合 WCAG 2.1 SC 4.1.2。

**修复方向**：添加 `<label htmlFor="...">` 或 `aria-label`。

---

### D-015：Spec validator 不检测 Workflow 循环边

**文件**：`apps/api/src/spec/spec-validator.service.ts`
**发现者**：测试覆盖审查

边 A→B→C→A 的循环不会被 validator 拒绝，可能导致 mock workflow runner 死循环或无限递归。

**修复方向**：在 validator 中添加 cycle detection（DFS / topological sort）。

---

### D-016：buildEnvAllowlist 注入冗余 API key

**文件**：`apps/api/src/codegen/opencode-engine.ts:363-381`
**发现者**：架构审查

同时注入 `OPENCODE_API_KEY`、`OPENAI_API_KEY`、`DEEPSEEK_API_KEY`，三者是同一 secret 的不同 key 名。扩大 secret 暴露面。

**修复方向**：只注入 opencode 实际需要的 key（通常 `DEEPSEEK_API_KEY` + `DEEPSEEK_BASE_URL`）。

---

### D-017：SSE error 事件不更新 UI status

**文件**：`apps/web/src/lib/use-generation-events.ts:80-85`
**发现者**：前端审查

SSE 收到 `error` event 后只加入事件数组，不更新 `status`。若 stream 在无 `output` event 的情况下出错，UI status 永远不到 `failed`。

**修复方向**：收到 `EventType.Error` 时将 status 设为 `GenerationStatus.Failed`。

---

### D-018：api.ts 无请求超时

**文件**：`apps/web/src/lib/api.ts:13-24`
**发现者**：前端审查

所有 `fetch` 调用无 `AbortSignal.timeout()`。网络挂起时请求永不超时。

**修复方向**：`jsonFetch` 内部添加 `signal: AbortSignal.timeout(30_000)`。

---

### D-019：SandboxService catch 块 durationMs 丢失

**文件**：`apps/api/src/sandbox/sandbox.service.ts:107`
**发现者**：API 架构审查

```ts
result = { ... durationMs: 0, ... };
```

runner 异常时 `durationMs` 硬编码为 0，丢失实际等待时间。

**修复方向**：在 try 前记录 `startTime`，catch 中计算 `Date.now() - startTime`。

---

### D-020：导出不过滤 *.egg-info/

**文件**：`apps/api/src/files/file-service.ts:15-29`
**发现者**：架构审查

`EXPORT_EXCLUDE` 未过滤 `*.egg-info/`（pip editable install 构建产物）。

**修复方向**：添加 `/^[^/]*\.egg-info(\/|$)/` 到 `EXPORT_EXCLUDE`。

---

### D-021：Docker workspace path 替换方法脆弱

**文件**：`apps/api/src/sandbox/docker-sandbox-runner.ts:66-69`
**发现者**：API 架构审查

使用 `String.replace(str, str)` 只替换第一次出现。若 `containerDir` 在更深层路径段出现，只替换 prefix 不符合预期。

**修复方向**：改为 `startsWith` + `slice` 的 prefix-based 替换。

---

### D-022：parseAndPersistSpec TOCTOU 竞态

**文件**：`apps/api/src/generations/generation.service.ts:81-98`
**发现者**：API 架构审查

两个并发 `parseAndPersistSpec` 调用同时看到 `existing === null`，同时调用 LLM，浪费一次 API 调用。

**修复方向**：`INSERT OR IGNORE` + 捕获冲突后重新读取。

---

## S3：低

### D-023：AgentTestPanel 不显示 Agent 元数据

**文件**：`apps/web/src/components/agent/AgentTestPanel.tsx`
**发现者**：前端审查

面板不显示 Agent 名称、模型名称、工具数量。用户只能看到 bare input/output。

**修复方向**：从 generation 数据中读取 spec metadata 并在面板头部展示。

---

### D-024：Timeline 无阶段分组

**文件**：`apps/web/src/components/workspace/GenerationTimeline.tsx`
**发现者**：P2 计划对齐审查

事件按时间平铺，无 "理解需求 → 生成代码 → 运行测试 → 完成交付" 的阶段分组。

**修复方向**：根据事件类型将 timeline 分为 4 个阶段 section。

---

### D-025：FileTree 无 ARIA 角色

**文件**：`apps/web/src/components/source/FileTree.tsx`
**发现者**：前端审查

缺少 `role="tree"`、`role="treeitem"`、`aria-expanded`、`aria-selected`。

**修复方向**：添加 WAI-ARIA tree pattern 属性。

---

### D-026：Python runner CLI 模块零测试

**文件**：`services/python-runner/src/python_runner/cli.py`
**发现者**：测试覆盖审查

CLI 参数解析、exit code、错误输出均未测试。

**修复方向**：添加 `test_cli.py` 覆盖 arg parsing 和 error output。

---

### D-027：Runner auto-discovery fallback 未测试

**文件**：`services/python-runner/src/python_runner/runner.py:18-64` 的 `_load_spec`
**发现者**：测试覆盖审查

4 级 fallback 中只测试了标准路径。自动发现路径（`_find_file` scan、JSON scan、minimal spec）缺少测试。

**修复方向**：在 `test_runner.py` 中为每级 fallback 添加测试。

---

### D-028：非常长 prompt 无上限约束

**文件**：`packages/shared-contracts/src/` 的 Zod schema
**发现者**：测试覆盖审查

无 `maxLength` 约束。超长 prompt 可导致内存/DB/LLM 问题。

**修复方向**：在 `createDraftRequestSchema` 和 `createGenerationRequestSchema` 中添加 `prompt.max(10000)`。

---

### D-029：`transitionTo` 对非法转换静默 no-op

**文件**：`apps/api/src/generations/generation.service.ts:142-148`
**发现者**：API 架构审查

generation 不存在和非法状态转换都静默吞掉，不 log、不 throw。

**修复方向**：至少对非法转换 `this.logger.warn(...)`。

---

### D-030：Health API 无深度组件检查

**文件**：`apps/api/src/health/health.controller.ts`
**发现者**：P2 计划对齐审查

只返回 `{status:'ok', service, version}`，不检查 OpenCode binary、Docker daemon、模型 API key、Python runner。

**修复方向**：添加 `/health/deep` 端点，逐组件检查并返回各组件状态。

---

## 统计

| 严重度 | 数量 | 标签 |
|--------|------|------|
| S0 | 5 | demo-blocker |
| S1 | 7 | high-impact |
| S2 | 10 | medium |
| S3 | 8 | low |
| **总计** | **30** | |

## 建议修复批次

### Batch 1：Demo 稳定性（S0，~3h）
D-001, D-002, D-003, D-004, D-005

### Batch 2：韧性（S1，~4h）
D-006, D-007, D-008, D-009, D-010, D-011, D-012

### Batch 3：体验与安全（S2，~3h）
D-013, D-014, D-015, D-016, D-017, D-018, D-019, D-020, D-021, D-022

### Batch 4：完善（S3，后续迭代）
D-023 至 D-030
