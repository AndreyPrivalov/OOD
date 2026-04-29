# Work Item Editing

## Purpose

Этот документ фиксирует бизнес-правила inline-редактирования work items.

## Rules

- редактирование происходит inline;
- основной trigger сохранения для текстовых полей: `blur`;
- новая строка сначала создаётся как локальный draft и не отправляется в API/БД, пока `title` не станет непустым;
- локальный draft id и последующий persisted id описывают одну и ту же logical row identity; после `create` клиент обязан продолжить ту же save lineage, а не начинать вторую конкурирующую сущность сохранения;
- `title` не может сохраняться пустым;
- `object` может быть временно пустым в процессе создания или редактирования;
- `currentProblems` и `solutionVariants` редактируются как списки строк;
- `PATCH /api/work-items/[id]` остаётся каноническим row-scoped write contract для полей строки и `metricValues`;
- если один row patch содержит и поля строки, и `metricValues`, сервер обязан применить их как один transactional use case и не фиксировать частичный результат;
- если `createWorkItem` для draft успешно завершился, но последующий `patchWorkItem` вернул ошибку, клиент обязан remap'нуть локальный draft id на server id и показать ошибку без повторного `create`;
- create draft, remap id и первый post-create `PATCH` образуют одну logical save lineage с единым порядком ревизий;
- если локальный draft был удалён до `create` ack, клиент не делает автоматический server-side delete созданной строки; вместо этого lineage помечается как orphaned и обрабатывается через безопасный reconcile без silent data loss;
- более поздний пользовательский commit той же строки всегда имеет приоритет над более ранним ack, даже если более ранний запрос завершился позже;
- сохранение строки A по `blur`, затем быстрый переход к строке B и её сохранение, не должно откатывать строку A или любую другую уже локально подтверждённую строку;
- несколько подряд сохранённых строк в одной сессии не должны терять данные из-за workspace-level refresh, если хотя бы одна из этих строк ещё имеет незавершённую save lineage;
- перед `openWorkspace`, `createWorkspace`, `renameWorkspace`, destructive actions (включая удаление workspace, метрики и branch) клиент обязан выполнить awaitable `flushPendingEdits()` как barrier: сначала стартовать недостающие row save, затем дождаться idle всех затронутых row queues;
- неудачное сохранение должно оставлять состояние recoverable и понятным пользователю.

## Reconcile Rules

- full tree refresh остаётся механизмом сверки с серверной истиной, но не каноническим способом завершать обычный inline save flow;
- пока у logical row есть pending create, pending patch, pending id remap или unacknowledged более новая ревизия, destructive replacement этой строки данными из background fetch запрещён;
- если refresh всё же нужен до settle всех pending rows, клиент обязан делать selective merge: применять server truth только к тем строкам, у которых нет локально более новой unresolved state;
- после settle save lineage клиент может принять server truth целиком или через merge, но без повторного появления старого значения строки;
- stale ack, относящийся к более ранней ревизии той же logical row, не должен менять visible row state, историю или производные агрегаты.

## Negative Scenarios

- если `blur` строки A инициировал save, а пользователь сразу сохранил строку B, поздний ответ по строке A не должен сбросить ни строку A, ни строку B;
- если draft уже remap'нут на persisted id, любые последующие операции reconcile и history должны работать по новой identity и не возвращать в projection старый local draft snapshot;
- если `createWorkItem` вернул успех, а follow-up `PATCH` завершился ошибкой, строка не должна исчезнуть и не должна пересоздаваться повторно при следующем `blur`;
- если background refresh вернул дерево со старым значением строки, а у клиента ещё есть более новая unresolved revision этой строки, refresh не должен визуально откатить ввод пользователя;
- если save lineage не может быть safely merged с server snapshot, клиент должен сохранить более новый локальный row state, показать recoverable ошибку и запросить явный reconcile позже, а не silently потерять ввод.
