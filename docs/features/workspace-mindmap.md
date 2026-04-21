# Workspace Mindmap

## Purpose

Этот документ фиксирует feature-specific правила второй панели workspace-экрана, где дерево работ визуализируется как read-only mindmap рядом с таблицей.

## Success Criteria

- пользователь может рядом с заголовком workspace переключать режимы `split` и `table-only`;
- в режиме `split` таблица и mindmap отображают одно и то же текущее дерево работ одного workspace;
- mindmap не создаёт альтернативный канал редактирования и не дублирует table interactions;
- пользователь может перемещать viewport mindmap и менять масштаб;
- при начале inline-редактирования нужная работа и её ближний структурный контекст оказываются видимыми в mindmap без ручного поиска.

## Core Rules

- toggle режима отображения располагается рядом с заголовком workspace и управляет только layout workspace view;
- `table-only` скрывает панель mindmap и отдаёт всё рабочее пространство таблице;
- `split` показывает таблицу и mindmap одновременно;
- mindmap всегда read-only: в ней нельзя редактировать поля, создавать узлы, удалять узлы, менять parent, менять sibling order или запускать inline editing;
- если структурные изменения или inline edits уже произошли в таблице и локальное состояние принято клиентом, mindmap должна отразить ту же tree truth в той же сессии без отдельного ручного refresh;
- pan и zoom относятся только к viewport mindmap и не должны попадать в persistence, undo/redo или API payloads;
- collapse state дерева остаётся table/client concern и mindmap должна следовать только тем ограничениям видимости, которые явно задокументированы в workspace client behavior, а не вводить собственную независимую скрытую структуру.

## Editing Visibility Rules

- когда пользователь начинает inline-редактирование work item в таблице, mindmap должна автоматически перевести viewport к editing context;
- editing context минимум включает:
  - редактируемый узел;
  - его parent, если он есть;
  - sibling-узлы этого parent, которые сейчас присутствуют в клиентском tree projection;
- если редактируемый узел root-level, вместо parent-контекста mindmap должна показать этот root и соседние root-level узлы;
- если viewport уже показывает editing context целиком с разумным запасом, повторный aggressive recentering не нужен;
- автоматическое фокусирование при смене редактируемой строки не должно сбрасывать пользовательский `zoom`, если для показа editing context достаточно текущего масштаба;
- если текущего масштаба недостаточно, система может уменьшить масштаб ровно настолько, насколько нужно для показа editing context;
- завершение редактирования не обязано возвращать viewport в предыдущее положение.

## Negative Scenarios

- включение mindmap не должно ломать существующие keyboard flows inline editing и session undo/redo;
- mindmap не должна показывать stale tree, если таблица уже показывает локально подтверждённый результат create/move/delete/edit;
- toggle split-screen не должен менять canonical data contract, persistence flow или history semantics;
- невозможность уместить всё дерево целиком в панель не считается ошибкой: обязательным является только доступность pan/zoom и корректное автопозиционирование editing context.

## Implementation Notes

- таблица остаётся canonical interaction surface для всех data mutations;
- table view и mindmap view должны питаться от одного shared tree projection, включающего канонические work items, derived aggregates и актуальную локально подтверждённую структуру;
- layout, viewport math и focus framing mindmap должны быть отделены от edit/save orchestration, чтобы визуализация не управляла commit semantics;
- визуальный стиль mindmap должен следовать `docs/design-system.md`: спокойная, структурная, typography-led подача без декоративного noise.

## Shared UI Contract

- shared UI mindmap-компонент в `packages/ui` принимает только уже подготовленные `nodes`/`edges` и текущее `viewport` состояние;
- компонент публикует только callbacks для viewport-операций (`pan` и `zoom`) и не владеет edit handlers;
- визуальные состояния `active` и `editing context` передаются как входные данные для подсветки;
- компонент не знает ничего о persistence, API-патчах, undo/redo или бизнес-операциях create/move/delete/edit.
- client-side viewport controller (pan/zoom/bounds/auto-framing) живёт в `apps/web` рядом с workspace layout/composition и не смешивается с history engine, tree mutations или persistence state.
