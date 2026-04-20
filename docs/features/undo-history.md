# Undo History

## Purpose

Этот документ задаёт канонические правила session-scoped undo/redo для дерева work items.

## Rules

- undo вызывается через `cmd/ctrl + z`;
- redo вызывается через `cmd/ctrl + shift + z`;
- история ведётся отдельно для каждого `workspace`;
- история живёт в рамках одной вкладки/окна и переживает `refresh` через `sessionStorage`;
- закрытие вкладки или окна завершает сессию и очищает историю естественным образом;
- в историю входят только core data actions: `create`, inline field edits, rating edits, metric value edits, metric catalog edits, `move`, `delete`;
- purely visual client state вроде `collapsedRowIds`, scroll position, selection, column widths и измерений layout не входит в историю;
- один завершённый commit образует один history step; для текстовых полей стандартной границей commit остаётся `blur`;
- локальный draft без валидного `title` не попадает в историю;
- undo/redo должны быть атомарными с точки зрения пользователя и не должны оставлять partially applied state;
- при ошибке применения undo/redo указатель истории не двигается, локальное дерево возвращается к последнему подтверждённому состоянию, а ошибка показывается локально;
- для `delete` и `create` история хранит полный snapshot затронутой ветки, достаточный для точного восстановления sibling order и parent linkage;
- для delete метрики история хранит snapshot определения метрики и всех удалённых значений этой метрики внутри workspace;
- канонический restore endpoint принимает полный branch snapshot и placement (`targetParentId`, `targetIndex`) и возвращает `idMap`;
- клиент обязан remap'нуть history references по `idMap`, если сервер вернул новые ids;
- persisted `present` хранится вместе со стеками `past` и `future`, чтобы `refresh` не откатывал дерево до отдельного fetch до reconcile;
- если session history, восстановленная из `sessionStorage`, конфликтует с актуальным серверным деревом, клиент обязан инвалидировать историю для этого `workspace`, выполнить тихий refresh и не применять частично совместимые шаги.
