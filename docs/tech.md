# Tech

## Purpose

Этот документ фиксирует технические инварианты, архитектурные ограничения и распределение ответственности между документационными слоями.

## Canonical Layer

Каноническая документация OOD состоит из:

- `spec.md`;
- `AGENTS.md`;
- `docs/product.md`;
- `docs/design-system.md`;
- `docs/tech.md`;
- `docs/features/*.md`.

`Docs/` и корневые markdown-черновики считаются устаревшими дубликатами и не должны использоваться как source of truth.

## Responsibilities

- `docs/product.md` отвечает за продуктовые правила и vocabulary;
- `docs/design-system.md` отвечает за UI behavior и visual principles;
- `docs/tech.md` отвечает за архитектурные ограничения и системные инварианты;
- `docs/features/*.md` отвечают за feature-specific business logic.

## Technical Invariants

- primary database: `PostgreSQL`;
- tree model: adjacency list с `parent_id` и `sibling_order`;
- runtime database configuration идёт из `.env` / `DATABASE_URL`;
- in-memory persistence запрещён в normal runtime вне тестов;
- структурные операции должны быть атомарными с точки зрения пользователя.
