# Workspaces

## Purpose

Этот документ фиксирует бизнес-логику shared workspaces.

## Rules

- workspace является общим контейнером для одного work tree;
- все пользователи cleaned-core фазы имеют равный доступ ко всем workspace;
- private/personal workspaces не входят в scope;
- work item принадлежит ровно одному workspace;
- перемещение work items между workspace не поддерживается.
