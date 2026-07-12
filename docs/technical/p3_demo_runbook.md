# P3 演示 Runbook

版本：v1.0 | 日期：2026-07-12

面向内部同事的 P3 演示与恢复手册。按本文档操作即可完成一次完整的 Agent Builder 演示；真实链路失败时有明确的可恢复路径。

---

## 一、环境前置

| 能力 | 要求 | 检查方式 |
|---|---|---|
| Node.js | ≥ 18（提供全局 `fetch`） | `node -v` |
| Docker | ≥ 20.10，当前用户可访问 socket | `docker info` |
| Python | 3.11.x（沙箱镜像内置） | 镜像内已固定 |
| Redis | ≥ 6.0（生产部署需要） | 本地演示用内存 DB，可跳过 |
| 真实 LLM Key | DeepSeek OpenAI 兼容 | `apps/api/.env`（gitignored） |

`.env`（`apps/api/.env`，不提交）最小配置：

```env
SPEC_LLM_PROVIDER=openai-compatible
SPEC_LLM_BASE_URL=https://api.deepseek.com/v1
SPEC_LLM_API_KEY=<your-deepseek-key>
SPEC_LLM_MODEL=deepseek-chat
CODEGEN_ENGINE=opencode
OPENCODE_REQUIRE_REAL=true
OPENCODE_CLI_STYLE=v1
OPENCODE_PROVIDER=deepseek
OPENCODE_MODEL=deepseek-chat
OPENCODE_BASE_URL=https://api.deepseek.com/v1
OPENCODE_API_KEY=<your-deepseek-key>
SKILL_LLM_TLS_VERIFY=false
```

> 密钥只写在 `apps/api/.env`，不写入任何文档、日志或提交文件。

**就绪自检**：启动 API 后访问首页，左侧 "Runtime Diagnostics" 应为：Spec LLM / Code Engine / OpenCode Real / Sandbox / Python Runner 全部绿点。或直接：

```bash
curl -s http://localhost:3001/health/deep
# 期望：opencode.require_real=true、opencode.key_present=true、
#       sandbox.docker_available=true、python_runner.src_present=true
```

---

## 二、启动服务

两个终端：

```bash
# 终端 A：后端（加载 .env 真实配置）
npm run dev:api:llm      # http://localhost:3001

# 终端 B：前端
npm run dev:web          # http://localhost:3000
```

打开 http://localhost:3000。

---

## 三、标准演示流程

### 样例 A：Agent（员工政策问答）

标准 prompt：

```
做一个员工政策问答 Agent，用户输入制度问题后调用 search_policy 工具检索政策条款并给出简明回答。
```

步骤：

1. 首页选择 **Agent**，粘贴 prompt，点击 **开始生成**。
2. 跳转到草稿确认页，等待 Spec 解析完成（真实 LLM，约 3–6s），检查工具 `search_policy` 已识别，点击 **确认并生成**。
3. 工作台展示生成轨迹：
   - 左侧 Generation Trace：理解需求 → 生成代码 → 运行测试 → 完成交付。
   - 完成后出现 **生成完成摘要**（解析方式 llm、代码引擎 opencode、版本、运行模式）与 **Versions** 版本列表。
4. 切到 **源码** 标签：自动打开 `src/agents/agent.py`，文件树含 `agent_builder_manifest.json`、`tests/test_agent_smoke.py`、`pyproject.toml`、`README.md`。
5. 切到 **Agent 测试台** 标签：消息框已预填 manifest 的 `example_input`，点击 **发送**，查看 Agent 回复与 `search_policy` 工具调用记录。
6. 点击右上角 **导出代码包**，下载 `.zip`（含 manifest，已过滤 `.env`）。

**成功标志**：状态徽标为"已完成"，摘要"测试结果：通过"。

### 样例 B：Workflow（合同审核）

标准 prompt：

```
合同审核流程，读取合同文档，抽取关键条款，标注风险等级，输出审核结果。
```

步骤同上，类型选 **Workflow**。工作台切到 **Workflow 运行** 标签，输入框预填示例需求，点击 **运行 Workflow**，查看节点运行状态（`end` 节点 `success`）与 Markdown 报告。

### 真实链路一键验证（无浏览器）

```bash
npm run test:e2e:real
```

- 无密钥 / API 未启动时自动 `status: skipped` 并 `exit 0`，可安全在任何环境运行。
- 就绪时输出报告：`generation_id`、`duration`、`files`、`smoke_test`、`engine`。
- 期望输出：`status=completed`、`engine=opencode`、`smoke_test=passed`、`mock_mode=false`。

---

## 四、失败恢复路径

真实 OpenCode 可能因模型限流、网络、CLI 或沙箱环境失败。以下是 UI 可见的恢复手段。

### 路径 1：切换模板引擎（推荐，演示现场首选）

当状态徽标为"失败"且错误面板出现时（仅 OpenCode 失败可见）：

1. 在 **生成失败** 面板点击 **切换模板引擎**。
2. 后端用确定性 TemplateEngine 重新生成（mock 模式），事件流记录原始失败原因与 fallback reason。
3. 生成完成，摘要标注"代码引擎：template（已回退）"，版本 `mock_mode=true`。
4. 源码 / 测试台 / 导出均可继续演示。

> API 等价命令：`POST /api/generations/<gen_id>/fallback`（仅 `failed` 状态可调用）。

### 路径 2：修复并重试（继续走真实 OpenCode）

1. 在错误面板点击 **修复并重试**。
2. 后端 reset 到 planning，重跑 OpenCode 流水线（受 `OPENCODE_MAX_RETRIES` 限制）。
3. 查看错误面板的 **最近一次运行的 stdout / stderr（tail 200）** 定位真实失败原因。

> API：`POST /api/generations/<gen_id>/repair`。

### 路径 3：版本激活（回到历史通过版本）

左侧 **Versions** 列表：

- 点击非激活版本的 **查看 Diff**，对比与当前激活版本的文件级差异（增/删/改 + hunks）。
- 对测试通过的版本点击 **激活**，回滚到该版本。
- API：`POST /api/generations/<gen_id>/versions/<ver_id>/activate`。

### 路径 4：诊断

- 首页 **Runtime Diagnostics** 或 `curl http://localhost:3001/health/deep` 检查 LLM key、OpenCode 配置、Docker、Python runner 是否就绪（密钥仅检测是否存在，不输出值）。

---

## 五、截图 Checklist

演示前确认以下画面均可呈现：

- [ ] 首页 Runtime Diagnostics 全绿点。
- [ ] 草稿确认页：Spec 已解析，工具列表正确。
- [ ] 工作台：状态徽标"已完成"。
- [ ] 生成完成摘要：解析方式=llm、代码引擎=opencode、测试结果=通过。
- [ ] Versions 列表：显示版本、active 标签、mock 标签。
- [ ] 源码标签：`src/agents/agent.py`、`agent_builder_manifest.json`。
- [ ] Agent 测试台：消息预填 example_input，回复含工具调用记录。
- [ ] 导出：下载 `.zip`，解压含 manifest、无 `.env`。
- [ ] （恢复演示）切换模板引擎后摘要显示"已回退"，仍可查看源码与导出。

---

## 六、常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 命令被沙箱拒绝：`command contains absolute path or ..` | allowlist 拒绝（含 `..` 路径逃逸或绝对路径） | 检查 manifest `test_command` 是否为 `pytest …` 标准形式；prompt 文本中的省略号 `...` 不再误判 |
| `pip install` 失败 | 网络 / 镜像源 | 错误面板查看 stderr tail；切换模板引擎兜底 |
| 状态长时间"生成中" | OpenCode 真实生成耗时 30–120s | 等待；`REAL_E2E_TIMEOUT_MS` 可调 |
| 首页 Diagnostics 全灰 | API 未启动或 key 未配置 | `npm run dev:api:llm` 加载 `.env`；检查 `/health/deep` |
| `npm run test:e2e:real` 输出 `skipped` | 真实栈未就绪 | 检查 `.env` 与 API 进程；就绪后会真实生成 |

---

## 七、一键回归

提交前确认：

```bash
npm run lint            # 0 error
npm run typecheck       # 通过
npm run test            # api + web + python 全绿
npm run test:e2e        # 4 个 Playwright 流程
npm run test:e2e:real   # 真实 OpenCode（无密钥自动 skip）
```
