"""Agent Builder Python Runner.

Executes generated OpenJiuwen Agent/Workflow projects under a mock OpenJiuwen
runtime, plus pytest smoke tests. Never runs generated code inside the main API
process — invoked through the Sandbox Service (architecture §5.6, §5.7).
"""
