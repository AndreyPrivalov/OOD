# Work Tree

## Purpose

Этот документ описывает feature-specific правила дерева работ.

## Rules

- у workspace есть одно дерево work items;
- node может быть root или child;
- child имеет ровно одного valid parent;
- sibling order должен оставаться стабильным;
- перемещение узла перемещает всё его поддерево;
- invalid moves не должны применяться частично;
- удаление parent-узла каскадно удаляет всю ветку.
