# Agent Builder · {{PROJECT_NAME}}

> 由 Agent Builder 生成的 OpenJiuwen {{KIND}} 工程。

## 目录结构

```
{{PROJECT_DIR}}/
├── pyproject.toml
├── README.md
├── .env.example
├── config/            # Agent Spec + LLM 配置
├── src/
│   ├── agents/        # Agent 入口
│   ├── tools/         # 工具实现
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
python src/main.py "我想看看最近职业发展的趋势"
```

输出为结构化 JSON：`{ "reply": ..., "tool_calls": [...] }`。

## 测试

```bash
python -m pytest -q
```

## 生成来源

由 Agent Builder Demo（P0）依据用户自然语言需求生成。生成过程可观测、可测试、可导出。
