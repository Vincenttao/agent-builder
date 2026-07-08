# Agent Builder Runtime and Sandbox 设计

版本：v0.1  
依据：`docs/prd/PRD-v0.3-agent-builder.md`、`docs/technical/agent_builder_architecture.md`  
状态：P0 设计初稿  

## 1. 目标

P0 阶段直接引入沙箱容器，用于隔离以下执行对象：

1. `opencode run` / `opencode serve`。
2. `python src/main.py`。
3. `python -m pytest`。
4. 生成出的 OpenJiuwen Agent/Workflow 工程。
5. mock 或真实 OpenJiuwen runtime。

主服务只负责调度、状态、事件、文件索引和导出，不直接执行用户生成代码。

## 2. 推荐方案

### 2.1 P0 快速版

```text
Docker or rootless Podman
+ hardened runtime flags
+ per-task workspace mount
+ command allowlist
+ timeout
+ network none by default
```

适合内部 Demo 和本地开发。

### 2.2 P0+ 目标版

```text
Docker/containerd
+ gVisor runsc
+ per-task workspace mount
+ controlled network
+ resource limits
+ sandbox event stream
```

适合 OpenCode 成为核心代码生成执行层、对外演示或需要更强隔离的场景。

### 2.3 P1 平台版

```text
Sandbox pool
+ queue
+ resource scheduler
+ network allowlist gateway
+ audit logs
+ Firecracker/Kata or managed sandbox optional
```

适合多租户和生产级运行。

## 3. 方案对比

| 方案 | 推荐度 | 优点 | 缺点 | 使用阶段 |
| --- | --- | --- | --- | --- |
| Docker + hardened flags | 高 | 最快、文档多、集成简单 | 共享宿主机内核 | P0 fallback |
| Rootless Podman | 高 | daemonless/rootless，本地安全边界好 | 部分环境兼容性不如 Docker 普遍 | P0 fallback |
| Docker + gVisor `runsc` | 很高 | 隔离强于普通容器，仍保留容器体验 | 需要安装 runtime，可能有兼容问题 | P0+ target |
| Docker Sandboxes | 可选 | 面向 AI coding agent，有 OpenCode guide | 产品形态和可用性需确认 | P0+ 验证 |
| E2B | 可选 | 云端现成 sandbox，SDK 快 | 外部服务依赖、成本、数据合规 | P0+ 验证 |
| Firecracker/Kata | 中 | microVM 隔离强 | P0 集成成本偏高 | P1 |

## 4. 运行模型

```text
API/BFF Backend
  -> create Generation
  -> create Version workspace
  -> create SandboxJob
  -> start sandbox container
  -> run command
  -> stream logs/events
  -> collect result
  -> destroy sandbox container
```

每个 `SandboxJob` 只服务一个 generation/version/run，不复用用户态进程。

## 5. SandboxJob

```yaml
id: string
generation_id: string
version_id: string
job_type: opencode_generation | smoke_test | agent_run | workflow_run | export_check
runtime: docker | podman | gvisor | e2b
image: string
command: string[]
workspace_path: string
network_policy: none | openjiuwen_only | controlled
env_allowlist:
  - OPENJIUWEN_API_KEY
  - OPENJIUWEN_BASE_URL
  - OPENAI_API_KEY
  - ANTHROPIC_API_KEY
resource_limits:
  cpus: 1
  memory: 1g
  pids_limit: 256
timeout_seconds: 120
status: pending | running | success | failed | timeout | killed
```

## 6. 镜像设计

P0 基础镜像：

```text
agent-builder-sandbox:latest
├── Python 3.x
├── Node.js LTS
├── opencode
├── pytest
├── uv 或 pip
├── git
├── OpenJiuwen SDK
└── non-root user: sandbox
```

约束：

1. 镜像不包含任何密钥。
2. 默认用户非 root。
3. 默认工作目录为 `/workspace`。
4. OpenCode 项目级配置只能来自 `/workspace`。
5. 不读取宿主用户级 OpenCode 配置。

## 7. 命令白名单

P0 允许：

```text
opencode run ...
opencode serve ...
python -m pytest tests/test_agent_smoke.py
python -m pytest tests/test_workflow_smoke.py
python src/main.py
python -m src.main
```

P0 禁止：

```text
rm -rf /
sudo ...
docker ...
podman ...
curl arbitrary-url
wget arbitrary-url
ssh ...
scp ...
chmod 777 ...
```

网络访问需要由 `network_policy` 控制，而不是由命令自由访问。

## 8. Docker 参数基线

```bash
docker run --rm \
  --network none \
  --cpus 1 \
  --memory 1g \
  --pids-limit 256 \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,size=256m \
  -v "$WORKSPACE:/workspace:rw" \
  -w /workspace \
  agent-builder-sandbox:latest \
  <command>
```

如果使用 gVisor：

```bash
docker run --rm \
  --runtime=runsc \
  --network none \
  --cpus 1 \
  --memory 1g \
  --pids-limit 256 \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,size=256m \
  -v "$WORKSPACE:/workspace:rw" \
  -w /workspace \
  agent-builder-sandbox:latest \
  <command>
```

## 9. 网络策略

| 策略 | 说明 |
| --- | --- |
| `none` | 默认策略，不允许联网 |
| `openjiuwen_only` | 只允许访问 OpenJiuwen/model endpoint |
| `controlled` | 通过代理或网关 allowlist 放行指定域名 |

P0 建议：

1. mock 模式使用 `none`。
2. 真实模型模式使用 `openjiuwen_only`。
3. 禁止任意公网访问。

## 10. OpenCode 运行

### 10.1 `opencode run`

适合一次性代码生成。

```text
SandboxJob(job_type=opencode_generation)
  -> command: ["opencode", "run", "--format", "json", "<prompt-file>"]
```

约束：

1. prompt 写入 `/workspace/.agent_builder/prompt.md`。
2. OpenCode 只能修改 `/workspace`。
3. 输出事件转换为 `opencode_started`、`opencode_file_changed`、`opencode_finished`。
4. 执行后必须运行 smoke test。

### 10.2 `opencode serve`

适合多轮代码修改和 session 管理。

约束：

1. 每个任务临时启动一个 serve 实例。
2. 只监听 `127.0.0.1` 或沙箱内部端口。
3. 必须设置访问 token。
4. 任务结束立即销毁容器。
5. 不建议 P0 使用全局长期 `opencode serve`。

## 11. Python Runner

Python Runner 负责：

1. 运行 Agent 示例输入。
2. 运行 Workflow 示例输入。
3. 执行 pytest smoke test。
4. 接入 OpenJiuwen SDK 或 mock runtime。
5. 输出结构化运行记录。

Python Runner 可以是：

1. 沙箱镜像中的命令入口。
2. 独立 Python service，由 Node/NestJS 后端调用。

无论哪种方式，都不得在主 API 进程直接执行生成代码。

## 12. 日志与事件

Sandbox 事件：

```yaml
event_id: string
generation_id: string
job_id: string
type: sandbox_started | command_started | stdout | stderr | command_finished | sandbox_finished | error
message: string
payload: object
created_at: datetime
```

日志处理：

1. stdout/stderr 写入 `workspace/runs/{run_id}`。
2. 前端默认展示摘要。
3. 长日志截断。
4. 展示前做密钥脱敏。
5. 原始日志不进入导出包。

## 13. 导出过滤

导出包必须排除：

```text
.env
.env.*
.venv/
venv/
__pycache__/
.pytest_cache/
*.pyc
*.log
.agent_builder/secrets/
.opencode/cache/
```

`.env.example` 允许导出。

## 14. P0 验收

1. `opencode run` 在沙箱内生成代码。
2. `python -m pytest` 在沙箱内执行。
3. 默认网络关闭。
4. mock 模式无外部密钥也能跑通。
5. 真实 OpenJiuwen 模式只注入必要环境变量。
6. 超时任务会被终止。
7. 导出包不包含密钥、日志、缓存。
8. 前端能看到 sandbox/job 事件。

## 15. 参考资料

1. Docker resource constraints：https://docs.docker.com/engine/containers/resource_constraints/
2. Podman run options：https://docs.podman.io/en/latest/markdown/podman-run.1.html
3. gVisor 文档：https://gvisor.dev/docs/
4. Docker Sandboxes OpenCode guide：https://docs.docker.com/ai/sandboxes/agents/opencode/
5. E2B 文档：https://e2b.dev/docs
