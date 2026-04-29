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
- logical row identity должна переживать переход `local draft id -> persisted id`;
- visible row state в клиенте должен быть monotonic относительно локально подтверждённых ревизий: более старый ack или более старый fetch snapshot не может перезаписать более новую unresolved или уже подтверждённую локальную ревизию той же logical row.

## Client Orchestration Boundaries

- tree data/reconcile отвечает за fetch, refresh, canonical normalization, принятие server truth и invalidate/reconcile истории;
- tree data/reconcile не имеет права делать blind whole-row replacement для logical rows, у которых есть pending save lineage, dirty edit state, active focus или незавершённый remap после create;
- optimistic structural actions отвечают за optimistic create/move/delete, rollback и применение подтверждённой структуры, но не владеют row draft state;
- history engine отвечает за recording, replay, remap по `idMap` и `sessionStorage`, но не подменяет собой tree data loader;
- metric catalog actions отвечают только за workspace settings CRUD/restore и canonical settings responses;
- edit/save orchestration отвечает за row drafts, commit boundaries, payload building, stale-response protection и recoverable save errors.
- edit/save orchestration также владеет logical row lineage: связывает `local draft id`, persisted `id`, create ack, subsequent patch ack и per-row revision ordering в одну последовательность;
- per-row stale-response protection сама по себе недостаточна; нужен отдельный workspace-level reconcile guard, который не позволяет позднему fetch перетереть строки с более новой локальной state;
- shared tree projection отвечает за единый client-side view model, который одновременно обслуживает table rendering, derived aggregates и mindmap rendering;
- shared tree projection должен уметь принимать confirmed row patch и selective server merge без потери identity неизменённых строк и без отката защищённых logical rows;
- mindmap viewport controller отвечает только за `pan`, `zoom`, auto-framing editing context и локальные layout measurements; этот слой не владеет persistence-логикой, history data actions или tree mutations.

## Save Consistency Requirements

- для каждой logical row должен существовать единый источник порядка ревизий, независимый от того, какой физический `id` использовался до и после persisted create;
- `createWorkItem` и обязательный post-create `PATCH`, если он нужен, должны быть представлены как одна save lineage с общим жизненным циклом settle/fail;
- background refresh может полностью заменять workspace tree только когда нет защищённых logical rows; иначе он обязан либо отложиться, либо перейти в selective merge mode;
- selective merge должен приниматься на уровне logical row, а не на уровне всего дерева целиком;
- history recording не должна фиксировать reverted snapshot, пришедший из stale ack или преждевременного reconcile;
- targeted integration tests на Postgres и client-side orchestration tests обязаны покрывать сценарий: create row A -> blur/save A -> focus row B -> blur/save B -> поздний ack/reconcile по A не сбрасывает A и B.

## Test Doubles Strategy

- pure transforms и selector/payload helpers нужно по возможности тестировать как pure units без тяжёлых persistence doubles;
- поведение, зависящее от транзакций PostgreSQL, sibling reordering, restore и cross-table consistency, должно покрываться integration-тестами на Postgres;
- большой in-memory adapter в `packages/db/src/testing.ts` считается временным migration aid, а не целевой долговременной моделью тестирования;
- новые тесты не должны расширять зависимость проекта от толстого in-memory adapter, если ту же проверку точнее покрывает thin double или Postgres integration test.
