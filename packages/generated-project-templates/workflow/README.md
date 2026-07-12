# Agent Builder · {{PROJECT_NAME}}

> 由 Agent Builder 生成的 OpenJiuwen {{KIND}} 工程。

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
│   ├── openjiuwen_runtime/  # OpenJiuwen adapter
│   └── main.py
├── examples/
└── tests/
```

## 环境变量

见 `.env.example`。

## 安装

```bash
pip install -e ".[dev]"
```

## 运行

```bash
python src/main.py "客户希望建设一个智能客服 Demo，两周内上线，预算有限。"
```

输出为结构化 JSON：`{ "status": "success", "node_results": [...], "output": {...} }`。

## 测试

```bash
python -m pytest -q
```

## 生成来源

由 Agent Builder Demo（P0）依据用户自然语言需求生成。
