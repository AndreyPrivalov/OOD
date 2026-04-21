# Workspaces

## Purpose

Этот документ фиксирует бизнес-логику shared workspaces.

## Rules

- workspace является общим контейнером для одного work tree;
- все пользователи cleaned-core фазы имеют равный доступ ко всем workspace;
- private/personal workspaces не входят в scope;
- work item принадлежит ровно одному workspace;
- перемещение work items между workspace не поддерживается;
- у каждого workspace есть popup настроек, открываемый через иконку шестерёнки рядом с названием workspace;
- переключатель workspace отображается как текстовый ряд названий без декоративных плашек;
- активный workspace отображается основным цветом текста, неактивные — muted цветом;
- для каждого workspace на hover доступно действие settings вместо прямого delete;
- rename workspace выполняется в popup настроек, а не через inline-редактирование в ряду переключателя;
- create нового workspace использует тот же inline-механизм, вызываемый кнопкой `+` в конце ряда;
- popup настроек содержит rename workspace, add/edit/delete метрик и delete workspace;
- `GET /api/workspaces/[id]/settings` возвращает канонический settings payload вида `{ workspace, metrics }`;
- успешные `PATCH /api/workspaces/[id]/settings` и metric settings endpoints возвращают тот же канонический settings payload, а не отдельные урезанные rename/update shapes;
- клиент workspace settings обязан работать только через settings shape с метриками и не должен поддерживать параллельный contract только для rename;
- delete workspace требует подтверждение пользователя в popup перед удалением;
- удаление default workspace запрещено на уровне API.
- в рамках одной browser tab session клиент помнит active workspace через `sessionStorage` и после refresh восстанавливает его, если workspace всё ещё существует.
