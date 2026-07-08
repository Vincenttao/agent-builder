# Agent Builder · {{PROJECT_NAME}}

> 由 Agent Builder 生成的 OpenJiuwen {{KIND}} 工程。P0 默认运行在 **mock OpenJiuwen runtime** 下，无需真实模型密钥即可运行与测试。

## 目录结构

```
{{PROJECT_DIR}}/
├── pyproject.toml
├── README.md
├── .env.example
├── workflow.yaml        # 声明式 Workflow 定义（FR-004）
├── config/              # Workflow Spec + LLM 配置
├── src/
│   ├── workflows/       # Workflow 入口
│   ├── components/      # 节点实现
│   ├── openjiuwen_runtime/  # OpenJiuwen adapter（mock in P0）
│   └── main.py
├── examples/
└── tests/
```

## 环境变量

见 `.env.example`。P0 mock 模式无需填写 `OPENJIUWEN_API_KEY`。

## 安装

```bash
pip install -e ".[dev]"
```

## 运行

```bash
python src/main.py "客户希望建设一个智能客服 Demo，两周内上线，预算有限。"
```

输出为结构化 JSON：`{ "status": "success", "node_results": [...], "output": {...}, "mock": true }`。

## 测试

```bash
python -m pytest -q
```

## 切换 mock / 真实 OpenJiuwen

P0 默认 `MOCK_OPENJIUWEN=true`。接入真实 OpenJiuwen 时，在 `.env` 填入 `OPENJIUWEN_API_KEY` / `OPENJIUWEN_BASE_URL` 并将 `MOCK_OPENJIUWEN=false`，实现将落在 `src/openjiuwen_runtime/`（adapter 边界，PRD §8.3）。

## 生成来源

由 Agent Builder Demo（P0）依据用户自然语言需求生成。
