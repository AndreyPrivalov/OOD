# Workspaces

## Purpose

Этот документ фиксирует бизнес-логику shared workspaces.

## Rules

- workspace является общим контейнером для одного work tree;
- все пользователи cleaned-core фазы имеют равный доступ ко всем workspace;
- private/personal workspaces не входят в scope;
- work item принадлежит ровно одному workspace;
- перемещение work items между workspace не поддерживается.
- переключатель workspace отображается как текстовый ряд названий без декоративных плашек;
- активный workspace отображается основным цветом текста, неактивные — muted цветом;
- для каждого workspace на hover доступно действие delete;
- rename выполняется через double click по названию и inline-редактирование с фокусом в поле;
- create нового workspace использует тот же inline-механизм, вызываемый кнопкой `+` в конце ряда;
- delete требует подтверждение пользователя в popup перед удалением;
- удаление default workspace запрещено на уровне API.
