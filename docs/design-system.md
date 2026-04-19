# Design System

## Purpose

Этот документ фиксирует канонические правила интерфейса и поведения UI для OOD.

## Design Direction

- calm, conservative, structured interface;
- dense but readable layout;
- minimal visual noise;
- typography-led hierarchy;
- predictable inline editing;
- tree clarity over decorative interaction.

## Color Tokens

The shared palette is limited to five canonical colors:

- `#FAF6F4` for background surfaces;
- `#131920` for primary text and strong structural marks;
- `#5E646B` for secondary text and quieter affordances;
- `#E1DDDB` for technical borders, separators, and surface edges;
- `#FF6325` for accent and attention states.

All UI color decisions should derive from these tokens or from opacity applied to them. Do not introduce new standalone hues unless a documented exception exists.

## Shared UI Rules

- иерархия читается через отступы, композицию и типографику, а не декоративные плашки;
- inline-редактирование должно быть прямым и предсказуемым;
- parent-строки и leaf-строки остаются частью одной визуальной системы;
- ошибки локальны, понятны и привязаны к конкретному полю или строке;
- если правило относится к смыслу данных, нужно ссылаться на `docs/product.md`;
- если правило относится к реализации механики, нужно ссылаться на `docs/tech.md`.
