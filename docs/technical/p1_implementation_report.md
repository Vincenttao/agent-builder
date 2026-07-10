# Agent Builder P1 实施报告

版本：v1.0 | 日期：2026-07-10

## 一、概述

P1 阶段将 Agent Builder 从"固定 Demo"推进到"真实 LLM + OpenCode 代码生成 + Docker 沙箱"的可演示 Beta。

| 维度 | P0 基线 | P1 交付 |
|---|---|---|
| Spec 解析 | deterministic parser（2 个内置示例） | hybrid parser（DeepSeek LLM + deterministic fallback） |
| 代码生成 | TemplateEngine（固定模板） | OpenCodeEngine（Docker sandbox 执行 opencode v1.17.18） |
| 沙箱 | MockSandboxRunner（进程级） | DockerSandboxRunner（容器隔离）+ Mock 降级 |
| 模拟运行 | 塔罗/售前专用 mock | 通用 spec-driven mock + Agent 测试台 |
| 可恢复性 | 无 | 自动修复重试 + 版本管理 + Diff + 日志查看 |
| 体验 | 裸机安装 | Docker Compose 一键启动 + Prompt 模板 + 任务历史 |
| 测试 | contracts + api + web + python | 190 tests (contracts 15 + api 142 + web 20 + python 10 + E2E 4) |

## 二、P1 交付清单

### Phase 9: 异步 LLM Spec Parser + Spec 持久化 ✅

| 交付项 | 文件 |
|---|---|
| LlmSpecParser 接口 | `apps/api/src/spec/llm-spec-parser.ts` |
| MockLlmSpecParser | `apps/api/src/spec/mock-llm-spec-parser.ts` |
| OpenAiCompatibleSpecParser (DeepSeek) | `apps/api/src/spec/openai-compatible-spec-parser.ts` |
| Hybrid SpecParserService | `apps/api/src/spec/spec-parser.service.ts` |
| Spec 持久化 (generation_specs 表) | `apps/api/src/generations/repositories/spec.repository.ts` |
| 异步 pipeline（POST 立即返回） | `apps/api/src/generations/generation.service.ts` |

### Phase 10: 真实 OpenCodeEngine ✅

| 交付项 | 文件 |
|---|---|
| OpenCodeEngine 真实执行（SandboxService 调度） | `apps/api/src/codegen/opencode-engine.ts` |
| Docker sandbox 镜像（opencode v1.17.18） | `sandbox/Dockerfile` |
| DockerCompose 一键启动 | `docker-compose.yml` |
| Provider/model/key 注入（env allowlist + -e flags） | `apps/api/src/sandbox/docker-command-builder.ts` |
| post-generation lint（contract + forbidden import + secret scan） | `apps/api/src/codegen/project-lint.ts` |

### Phase 11: LLM + OpenCode 端到端编排 ✅

| 交付项 | 文件 |
|---|---|
| 非示例 prompt 不再触发 deterministic 限制 | `apps/api/src/spec/spec-parser.service.ts` |
| 事件流区分 parser mode / engine / fallback | `apps/api/src/orchestration/orchestrator.service.ts` |
| 错误文案更新（LLM 不可用 / 解析失败 / 生成失败） | 同上 |

### Phase 12: 页面模拟能力增强 ✅

| 交付项 | 文件 |
|---|---|
| CompletionSummary（parser mode / engine / fallback） | `apps/web/src/components/workspace/CompletionSummary.tsx` |
| 通用 mock runtime（spec-driven） | `services/python-runner/src/python_runner/mock_openjiuwen.py` |
| 非示例 E2E（天气 Agent + 合同审核 Workflow） | `apps/web/e2e/p1-flows.spec.ts` |

### Phase 13: 本地开发体验 ✅

| 交付项 | 文件 |
|---|---|
| Docker Compose 一键启动 | `docker-compose.yml` |
| .env.example 完整配置 | `.env.example` |
| README（Docker + 裸机两种方式） | `README.md` |
| export filter（.agent_builder/ / .opencode/ / opencode.json） | `apps/api/src/files/file-service.ts` |

### Phase 14: 可恢复生成、版本管理与日志 ✅

| 交付项 | API |
|---|---|
| 版本列表 | `GET /api/generations/:id/versions` |
| 版本 Diff（unified diff） | `GET /api/generations/:id/versions/:vid/diff?base=` |
| 版本激活（回滚） | `POST /api/generations/:id/versions/:vid/activate` |
| 修复重试 | `POST /api/generations/:id/repair` |
| 自动修复循环（opencode 模式） | orchestrator runPipeline auto-retry |
| 运行日志（脱敏） | `GET /api/generations/:id/runs/:runId/logs?stream=&tail=` |
| 前端错误面板 + 修复按钮 | `apps/web/src/components/workspace/ErrorPanel.tsx` |

### Phase 15: Beta 体验增强 ✅

| 交付项 | 文件 / API |
|---|---|
| Spec 确认（draft/confirm） | `POST /drafts` → `PUT /drafts/:id/spec` → `POST /drafts/:id/confirm` |
| Prompt 模板（6 个） | `apps/web/src/components/prompt/PromptTemplates.tsx` |
| 任务历史 | `GET /api/generations?status=&limit=&offset=`, `apps/web/src/components/history/TaskHistory.tsx` |

## 三、Docker 沙箱

```
sandbox/Dockerfile
  ├── python:3.11-slim
  ├── Node.js 20 + opencode v1.17.18（官方 curl | bash 安装）
  ├── pytest + setuptools + wheel
  └── 二进制 cp 到 /usr/local/bin/opencode

docker-compose.yml
  └── sandbox 镜像构建 → agent-builder-sandbox:latest
```

API 通过 DockerSandboxRunner 自动使用容器沙箱；Docker 不可用时降级 MockSandboxRunner。

## 四、关键技术决策

| 决策 | 方案 |
|---|---|
| opencode 安装 | 官方 `curl -fsSL https://opencode.ai/install \| bash`（v1.17.18） |
| LLM 提供商 | DeepSeek（OpenAI-compatible API） |
| CLI 风格 | OPENCODE_CLI_STYLE=v1（host），v0（Docker）默认 v1 |
| 网络策略 | controlled（Docker 默认 bridge） |
| 安全硬化 | `--init` + `--security-opt no-new-privileges`（不 drop caps） |
| smoke test | opencode 模式非阻塞 + 自动修复重试 |
| Agent 测试台 | 已知限制：opencode 生成代码结构与 Runner 不完全兼容（P2 待解决） |

## 五、测试覆盖

| 层 | 测试数 | 说明 |
|---|---|---|
| contracts | 15 | Zod schema, events, enums |
| api | 142 | spec parser, opencode engine, sandbox, orchestrator, repositories |
| web | 20 | timeline, composer, workspace, panels |
| python | 10 | smoke tests, mock runtime |
| E2E | 4 | tarot agent, presales workflow, weather agent, contract review workflow |
| **Total** | **191** | lint ✅ | typecheck ✅ |
