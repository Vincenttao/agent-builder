# Agent Builder P2 执行计划

版本：v0.1 | 依据：`docs/prd/PRD-v0.3-agent-builder.md` + `docs/technical/agent_builder_architecture.md`

## 一、P1→P2 承接

P1 已完成：Docker sandbox + opencode v1.17.18 真实代码生成。P2 从"可演示 Beta"推进到"可交付产品"。

| P1 遗留 | P2 处理 |
|---|---|
| Agent 测试台与 opencode 输出不兼容 | Runner 自适应或 opencode 生成规范统一 |
| 模型配置硬编码 .env | 模型配置中心 UI |
| Docker 沙箱安全：无 cap-drop、无 read-only | 硬化沙箱参数 |
| Spec 确认只有 API，无前端 | SpecConfirmation 页面 |
| smoke test exit 4 频繁（缺少 test 文件） | prompt 强化 + 生成质量闭环 |

## 二、P2 任务清单

### Task 1: Docker 沙箱安全硬化

**目标：** 恢复安全边界，同时不破坏 opencode 写入能力。

| 子任务 | 说明 |
|---|---|
| 容器 `--read-only` + 精确 tmpfs | `/root/.local`, `/root/.cache`, `/root/.config`, `/root/.opencode`, `/tmp` 为 tmpfs；`/workspace` 为 bind mount RW |
| 容器 `--cap-drop ALL --cap-add DAC_OVERRIDE` | 保留 root 写宿主机文件的能力，移除其他所有 capability |
| 容器 `--network controlled` | 创建 Docker network，只放行 `api.deepseek.com` 和 `registry.npmjs.org` |
| 资源限制可配置 | `OPENCODE_CPUS`, `OPENCODE_MEMORY` 环境变量 |
| 沙箱模式可视化 | 前端显示当前隔离等级（mock/Docker/gVisor） |

### Task 2: Agent/Workflow Runner 兼容 opencode 输出

**目标：** Agent 测试台和 Workflow 运行页能正常工作于 opencode 生成的代码。

| 子任务 | 说明 |
|---|---|
| Runner 自动发现 | 扫描项目文件自动定位 agent.py / workflow.py，不依赖固定路径 |
| 自适应 import | `pip install -e .` 已在 smoke test 阶段执行，Runner 需确保 PYTHONPATH 正确 |
| 降级策略 | import 失败时返回友好错误信息，而非 "Python Runner 输出无法解析" |
| E2E 验证 | 新增 Playwright 测试：生成 → 源码查看 → 测试台运行 → 导出 |

### Task 3: Spec 确认前端页面

**目标：** 用户生成前可预览、修改、确认 Spec。

| 子任务 | 说明 |
|---|---|
| Draft 页面 | `/drafts/:id` — 展示 Spec 摘要（name, description, tools/nodes） |
| JSON 编辑器 | 可编辑 Spec JSON，实时 validate |
| Confirm 按钮 | 确认后创建 generation → 跳转工作台 |
| 验证错误提示 | schema validation 失败时高亮问题字段 |

### Task 4: 生成质量闭环

**目标：** 提高 opencode 生成成功率，减少 smoke test 失败。

| 子任务 | 说明 |
|---|---|
| prompt 优化 | 限制生成步数（max steps），要求完整可用代码 |
| 结构化 Spec 注入 | 在 opencode prompt 中直接嵌入 Spec JSON（而非只引用文件） |
| 重试次数可配置 | 在 UI 显示当前重试状态 |
| 成功/失败率统计 | 跟踪每个 prompt 类型的成功率，优化 prompt 模板 |

### Task 5: 模型配置中心

**目标：** 不暴露 API key 的前提下让用户选择和管理模型。

| 子任务 | 说明 |
|---|---|
| 配置页 UI | `/settings/models` — provider 列表、model name、base URL |
| key 状态 | 只显示 "已配置 / 未配置"，不显示明文 |
| 切换生效 | 修改后下一次生成使用新配置 |
| 环境变量绑定 | 所有配置持久化到 `.env`（不经过数据库） |

### Task 6: 沙箱运行模式配置

**目标：** 支持 mock / Docker / gVisor 切换。

| 子任务 | 说明 |
|---|---|
| 环境变量 `SANDBOX_RUNTIME` | mock / docker / gvisor |
| 前端指示器 | 在生成页显示当前隔离等级 |
| gVisor 支持 | Dockerfile 增加 runsc runtime，`buildDockerArgs` 支持 |
| 降级策略 | Docker 不可用时自动降级 mock，gVisor 不可用时自动降级 Docker |

### Task 7: GitHub 导出

**目标：** 生成后直接创建 branch 或 PR。

| 子任务 | 说明 |
|---|---|
| OAuth 授权 | GitHub App 或 Personal Access Token |
| 创建 branch | `POST /api/generations/:id/github` → push branch |
| PR 创建 | 可选，带生成摘要作为 PR body |
| Feature flag | `FEATURE_GITHUB_EXPORT=true` 控制开关 |

### Task 8: 多项目空间

**目标：** 支持按 project 隔离任务。

| 子任务 | 说明 |
|---|---|
| Project 表 | id, name, created_at |
| generation 关联 project_id | 按 project 过滤 |
| 首页 project 选择器 | 新建/切换 project |

### Task 9: 生产部署支持

**目标：** 从本地 Demo 到可部署服务。

| 子任务 | 说明 |
|---|---|
| PostgreSQL 迁移 | 从 SQLite 迁移到 PostgreSQL |
| Redis 缓存 | 会话、事件缓存 |
| BullMQ 任务队列 | 异步生成任务队列，支持重试 |
| Docker 全栈部署 | API + Web + Worker + Redis + PostgreSQL + Sandbox Pool |
| 健康检查 + 监控 | /health, /metrics, 日志聚合 |

## 三、优先级矩阵

| 优先级 | 任务 | 理由 |
|---|---|---|
| P0 | Task 2: Runner 兼容 | P1 最大遗留问题，用户可见 |
| P0 | Task 4: 生成质量闭环 | 直接影响成功率，影响演示体验 |
| P0 | Task 1: 安全硬化 | 对外演示/部署的安全底线 |
| P1 | Task 3: Spec 确认 UI | 控制 LLM 不确定性，提升成功率 |
| P1 | Task 5: 模型配置中心 | 多模型切换是基本体验 |
| P1 | Task 6: 沙箱模式切换 | 方便开发者调试 |
| P2 | Task 7: GitHub 导出 | 加分项，代码交付增强 |
| P2 | Task 8: 多项目空间 | 为多用户铺路 |
| P2 | Task 9: 生产部署 | 真正的产品化 |

## 四、预估工作量

| 任务 | 预估 | 依赖 |
|---|---|---|
| Task 1: 安全硬化 | 2h | 无 |
| Task 2: Runner 兼容 | 3h | 无 |
| Task 3: Spec 确认 UI | 3h | 后端 draft API（已实现） |
| Task 4: 生成质量闭环 | 2h | 无 |
| Task 5: 模型配置中心 | 2h | 无 |
| Task 6: 沙箱模式切换 | 1h | Task 1 |
| Task 7: GitHub 导出 | 3h | 无 |
| Task 8: 多项目空间 | 2h | 无 |
| Task 9: 生产部署 | 5h | 整体稳定后 |
| **Total** | **~23h** | |
