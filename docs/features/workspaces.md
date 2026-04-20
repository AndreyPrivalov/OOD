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
- delete workspace требует подтверждение пользователя в popup перед удалением;
- удаление default workspace запрещено на уровне API.
