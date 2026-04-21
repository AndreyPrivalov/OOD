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
- структурные операции должны быть атомарными с точки зрения пользователя;
- row-scoped `PATCH /api/work-items/[id]` является одним application use case даже когда меняет и поля строки, и `metricValues`.

## Client Orchestration Boundaries

- tree data/reconcile отвечает за fetch, refresh, canonical normalization, принятие server truth и invalidate/reconcile истории;
- optimistic structural actions отвечают за optimistic create/move/delete, rollback и применение подтверждённой структуры, но не владеют row draft state;
- history engine отвечает за recording, replay, remap по `idMap` и `sessionStorage`, но не подменяет собой tree data loader;
- metric catalog actions отвечают только за workspace settings CRUD/restore и canonical settings responses;
- edit/save orchestration отвечает за row drafts, commit boundaries, payload building, stale-response protection и recoverable save errors.
- shared tree projection отвечает за единый client-side view model, который одновременно обслуживает table rendering, derived aggregates и mindmap rendering;
- mindmap viewport controller отвечает только за `pan`, `zoom`, auto-framing editing context и локальные layout measurements; этот слой не владеет persistence-логикой, history data actions или tree mutations.

## Test Doubles Strategy

- pure transforms и selector/payload helpers нужно по возможности тестировать как pure units без тяжёлых persistence doubles;
- поведение, зависящее от транзакций PostgreSQL, sibling reordering, restore и cross-table consistency, должно покрываться integration-тестами на Postgres;
- большой in-memory adapter в `packages/db/src/testing.ts` считается временным migration aid, а не целевой долговременной моделью тестирования;
- новые тесты не должны расширять зависимость проекта от толстого in-memory adapter, если ту же проверку точнее покрывает thin double или Postgres integration test.
