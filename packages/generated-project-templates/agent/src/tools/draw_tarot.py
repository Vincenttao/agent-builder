"""Tarot draw tool — random card draw with name / reversed / meaning.

This is the one business-specific tool implementation in the P0 tarot demo.
The generated agent.py loads tools by name from src/tools/<name>.py; this
module exposes `handle(inputs) -> output` which the mock runtime calls.
"""
from __future__ import annotations

import random
from typing import Any, Dict

TAROT_DECK = [
    ("愚者", "新的开始、冒险与自由"),
    ("魔术师", "创造、行动与能力"),
    ("女祭司", "直觉、神秘与潜意识"),
    ("皇后", "丰饶、滋养与自然"),
    ("皇帝", "权威、结构与控制"),
    ("恋人", "选择、和谐与关系"),
    ("战车", "意志、胜利与前进"),
    ("力量", "勇气、耐心与内在力量"),
    ("隐士", "独处、内省与指引"),
    ("命运之轮", "转折、机遇与循环"),
]


def handle(inputs: Dict[str, Any] | None) -> Dict[str, Any]:
    inputs = inputs or {}
    count = inputs.get("count", 3)
    try:
        count = int(count)
    except (TypeError, ValueError):
        count = 3
    count = max(1, min(count, 10))
    drawn = random.sample(TAROT_DECK, count)
    cards = [
        {"name": name, "reversed": random.choice([True, False]), "meaning": meaning}
        for name, meaning in drawn
    ]
    return {"cards": cards}
