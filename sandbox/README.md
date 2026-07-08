# Sandbox

任务级一次性沙箱，用于隔离执行 `opencode run/serve`、`python`、`pytest` 与生成物（architecture §12, runtime_and_sandbox）。

## 设计

- **`SandboxService`**：编排入口。校验命令白名单 → 记录 `SandboxJob` → 选择 runner → 运行 → 采集日志 → 回写 `SandboxJob`。
- **`DockerCommandBuilder`**：纯函数，生成 hardened docker argv（无 shell 拼接）。
- **`DockerSandboxRunner`**：用 `DockerCommandBuilder` 的 argv spawn `docker`/`podman`，采集 stdout/stderr。`isAvailable()` 检测 docker 二进制。
- **`MockSandboxRunner`**：进程级 fallback。在 **无 Docker 环境** 下提供同样的边界：命令白名单、超时 kill、cwd 绑定到当前任务 workspace、env allowlist、stdout/stderr 写入 run log。**不提供容器隔离**，仅作 P0 开发/测试 fallback（plan §13 明确允许）。

## Docker 参数基线（runtime_and_sandbox §8）

```bash
docker run --rm \
  --network none \
  --cpus 1 --memory 1g --pids-limit 256 \
  --cap-drop ALL --security-opt no-new-privileges \
  --read-only --tmpfs /tmp:rw,nosuid,nodev,size=256m \
  -v "<workspace>:/workspace:rw" -w /workspace \
  agent-builder-sandbox:latest <command...>
```

gVisor：追加 `--runtime=runsc`（P0+ 目标，当前环境跳过集成测试）。

## 命令白名单（runtime_and_sandbox §7）

允许：`opencode run/serve`、`python --version`、`python -m pytest …`、`python src/main.py`、`python -m src.main`。
禁止：`sudo`、`rm`、`curl`、`wget`、`ssh`、`scp`、`docker`、`podman`、`chmod`、`bash`/`sh` 等 shell 解释器，以及绝对路径/`..` 越界参数。命令以 argv 传入，**绝不**用 `shell: true` 拼接用户输入。

## 网络策略

| 策略 | 说明 |
| --- | --- |
| `none`（默认） | 不联网 |
| `openjiuwen_only` | 仅放行 OpenJiuwen/model endpoint（P0+） |
| `controlled` | 代理 allowlist（P1） |

## 构建（连接环境）

```bash
docker build -t agent-builder-sandbox:latest sandbox/
```

当前开发环境无 Docker，`SandboxService` 自动降级到 `MockSandboxRunner`；Docker 集成测试标记 skipped 并写明原因（见 `p0_acceptance_report.md`）。
