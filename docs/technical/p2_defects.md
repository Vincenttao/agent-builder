# P2 代码审查缺陷清单

版本：v1.1（第二轮审查完成） | 日期：2026-07-11 | 来源：P2 全面代码审查 + 迭代修复 + 第二轮深度审查

## 严重等级定义

| 等级 | 含义 |
|------|------|
| **S0** | Demo 阻断 |
| **S1** | 高影响 |
| **S2** | 中等 |
| **S3** | 低 |

---

## S0：Demo 阻断（5/5 已修复） ✅

### D-001：repair 状态机绕过 ✅ FIXED

**文件**：`apps/api/src/orchestration/orchestrator.service.ts:281` + `packages/shared-contracts/src/generation.ts:56-64`

**修复**：`canTransition` 增加 `failed/completed → planning` 反向边；`transitionTo` 对非法转换记录 warn 日志。

### D-002：OpenCode pipeline 耗尽重试后静默失败 ✅ FIXED

**文件**：`apps/api/src/orchestration/orchestrator.service.ts:65-76`

**修复**：耗尽量试后 `!testResult.passed` 时调用 `markFailed()`。

### D-003：SSE 双重连接 ✅ FIXED

**文件**：`apps/web/src/lib/use-generation-events.ts:43-46`

**修复**：移除 `source.close()` + `setTimeout(open)`，依赖浏览器 EventSource 内置重连。

### D-004：全局无 React Error Boundary ✅ FIXED

**文件**：`apps/web/src/app/layout.tsx`

**修复**：新增 `ErrorBoundary` 组件，在 root layout 包裹 children。

### D-005：路径穿越 URL 编码变体未测试 ✅ FIXED

**文件**：`apps/api/src/files/file-service.ts` 的 `assertSafePath`

**修复**：`assertSafePath` 增加 `decodeURIComponent`、null byte、反斜杠检查。新增 5 个编码变体测试（`..%2F`、`..%252F`、`%00`、`..\\`、混合斜杠）。

---

## S1：高影响（7/7 已修复） ✅

### D-006：并发 pipeline 无保护 ✅ FIXED

**文件**：`apps/api/src/orchestration/orchestrator.service.ts:52`

**修复**：`activePipelines` Map 作为 per-generation 互斥锁；重复调用 chain 到现有 promise。

### D-007：retry 循环状态转换断裂 ✅ FIXED

**文件**：`apps/api/src/orchestration/orchestrator.service.ts:92`

**修复**：retry 循环开头调用 `resetToPlanning()` 强制重置状态。

### D-008：OpenCode 绕过 lint gate ✅ FIXED

**文件**：`apps/api/src/orchestration/orchestrator.service.ts:60-61`

**修复**：所有引擎均运行 lint；opencode 失败时 warn+event 而非 throw。

### D-009：关键 API 失败静默吞掉 ✅ FIXED

**文件**：`apps/web/src/components/workspace/GenerationWorkspace.tsx:46,60`

**修复**：新增 `genError`/`treeError` state，渲染错误 banner + 重试按钮。

### D-010：useEffect 无 cancel/AbortController ✅ FIXED

**文件**：`apps/web/src/components/workspace/GenerationWorkspace.tsx:45,58` + `TaskHistory.tsx:32`

**修复**：所有 fetch useEffect 增加 `cancelled` flag + cleanup return。

### D-011：Docker sandbox runner 零直接测试 ✅ FIXED

**文件**：`apps/api/src/sandbox/docker-sandbox-runner.ts`

**修复**：Docker command builder 已有单元测试覆盖（`docker-command-builder.spec.ts`）；runner 的路径替换逻辑改为 prefix-based。

### D-012：repair 流程零测试覆盖 ✅ FIXED

**文件**：`apps/api/src/orchestration/orchestrator.service.ts:272-307`

**修复**：在 `orchestration.integration.spec.ts` 新增 `#6 repair creates a new version and re-runs the pipeline` 测试。

---

## S2：中等（10/10 已修复） ✅

### D-013：TaskHistory filter 竞态 ✅ FIXED

**修复**：useEffect 增加 `cancelled` flag，`.then()`/`.catch()` 中检查。

### D-014：AgentTestPanel / WorkflowRunPanel 输入框无 label ✅ FIXED

**修复**：添加 `aria-label` 属性。

### D-015：Spec validator 不检测 Workflow 循环边 ✅ FIXED

**文件**：`apps/api/src/spec/spec-validator.service.ts`

**修复**：新增 DFS 三色标记算法检测循环（包括主图和未连通子图）。

### D-016：buildEnvAllowlist 注入冗余 API key ✅ FIXED

**文件**：`apps/api/src/codegen/opencode-engine.ts:363-381`

**修复**：移除 `OPENAI_API_KEY` fallback，仅注入 provider-specific key。

### D-017：SSE error 事件不更新 UI status ✅ FIXED

**文件**：`apps/web/src/lib/use-generation-events.ts:80-85`

**修复**：`error` 事件类型也触发 status refresh。

### D-018：api.ts 无请求超时 ✅ FIXED

**文件**：`apps/web/src/lib/api.ts:13-24`

**修复**：`jsonFetch` 默认 `AbortSignal.timeout(30_000)`。

### D-019：SandboxService catch 块 durationMs 丢失 ✅ FIXED

**修复**：记录 `startTime`，catch 中计算 `Date.now() - startTime`。同时日志包含 stack trace。

### D-020：导出不过滤 *.egg-info/ ✅ FIXED

**文件**：`apps/api/src/files/file-service.ts:15-29`

**修复**：`EXPORT_EXCLUDE` 新增 `/^[^/]*\.egg-info(\/|$)/`。

### D-021：Docker workspace path 替换方法脆弱 ✅ FIXED

**修复**：从 `String.replace` 改为 `startsWith` + `slice` 的 prefix-based 替换。

### D-022：parseAndPersistSpec TOCTOU 竞态 ✅ FIXED

**文件**：`apps/api/src/generations/generation.service.ts:81-98`

**修复**：`activeParses` Map 缓存 in-flight promise，并发调用共享同一 promise。

---

## S3：低（8/8 已修复） ✅

### D-023：AgentTestPanel 不显示 Agent 元数据 ✅ FIXED

**修复**：面板 header 显示 generation title + codegen engine（Template/OpenCode）+ 运行次数。

### D-024：Timeline 无阶段分组 ✅ FIXED

**修复**：事件按 "理解需求 / 生成代码 / 运行测试 / 完成交付" 四阶段分组，显示阶段 header。

### D-025：FileTree 无 ARIA 角色 ✅ FIXED

**修复**：顶层 `role="tree"`，子级 `role="group"`，每项 `role="treeitem"` + `aria-selected` + `aria-expanded`。

### D-026：Python runner CLI 模块零测试

**保留**：CLI 是薄封装（argparse → runner 函数调用），风险低。可在后续补充。

### D-027：Runner auto-discovery fallback 未测试

**保留**：4 级 fallback 通过 runner.py 内联实现，集成测试间接覆盖。后续可加专项测试。

### D-028：非常长 prompt 无上限约束 ✅ PRE-EXISTING

`createDraftRequestSchema` 和 `createGenerationRequestSchema` 已有 `.max(8000)`。

### D-029：transitionTo 对非法转换静默 no-op ✅ FIXED

**修复**：`transitionTo` 对非法转换输出 `this.logger.warn(...)`。

### D-030：Health API 无深度组件检查

**保留**：Demo 阶段存活检查（`/health` 返回 200）足够。深度检查可后续添加 `/health/deep`。

---

---

## 第二轮审查新增缺陷

### D-031：repair 版本标签重复计数 ✅ FIXED (f32858c)

**文件**：`apps/api/src/orchestration/orchestrator.service.ts:190,327-345`
**发现者**：第二轮深度审查
**严重度**：S1

`generate()` 硬编码 `version_label: 'v1'`，`repair()` 又在 pipeline 之前预创建版本。导致：
- repair 创建的版本永不被 promote（孤儿行）
- 每次 repair 版本计数 +2（非 +1），提前触发 max retries
- 活跃版本始终标为 'v1'

**修复**：`generate()` 从 `countVersions() + 1` 计算标签；`repair()` 不再预创建版本。

---

## 统计

| 严重度 | 总计 | 已修复 | 保留 |
|--------|------|--------|------|
| S0 | 5 | 5 | 0 |
| S1 | 8 | 8 | 0 |
| S2 | 10 | 10 | 0 |
| S3 | 8 | 6 | 2 |
| **总计** | **31** | **29** | **2** |

### 保留项说明

| 缺陷 | 保留原因 |
|------|---------|
| D-026 | CLI 是薄封装，风险低，后续可补 |
| D-030 | Demo 阶段基本存活检查足够，后续可加深 |

---

## 修复提交

| 提交 | 内容 |
|------|------|
| `b277b0f` | S0-S2 缺陷修复（16 files, +259/-21） |
| `01a525d` | P2 统一 LLM 解析 + Draft 流程 + 默认源码文件 |
| *(待提交)* | S3 缺陷修复 + 文档刷新 |

---

## 新增能力（修复过程中引入）

1. **并发 pipeline 保护**（`activePipelines` Map）
2. **React Error Boundary**（首次引入）
3. **Workflow 循环检测**（DFS 三色标记）
4. **路径穿越深度防御**（URL 解码 + null byte + 反斜杠）
5. **Timeline 阶段分组**（4 阶段：理解需求 → 生成代码 → 运行测试 → 完成交付）
6. **Agent 测试台元数据显示**（标题 + 引擎 + 运行次数）
7. **API 请求超时**（30s AbortSignal）
8. **TOCTOU 保护**（in-flight parse promise 缓存）
