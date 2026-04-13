# Work Tree

## Purpose

This document defines the business logic for tree structure, ordering, moves, and deletion.

## Tree Model

Each workspace contains one hierarchical tree of work items.

A node may be:

- a root item with no parent;
- a child item with one parent.

## Supported Structural Operations

- create a root item;
- create a child item;
- reorder an item among siblings;
- move an item under another valid parent;
- delete an item with cascade deletion of its branch.

## Rules

- a child must always have one valid parent in the same workspace;
- a root must have no parent;
- a node cannot become its own parent;
- a node cannot be moved into its descendant chain;
- sibling order must remain deterministic after create, move, and delete;
- moving a node moves the whole subtree;
- deleting a node deletes the full subtree.

## Out of Scope for This Phase

- cross-workspace moves;
- advanced drag heuristics;
- arbitrary root-drop modes beyond the supported base interaction set;
- partial branch deletion;
- archive/restore.

## User-Facing Expectations

- after a valid move, the user understands where the item now lives;
- after an invalid move, nothing changes;
- after delete, the whole branch disappears consistently.

## Negative Scenarios

- cycle creation;
- missing parent target;
- broken sibling order after move;
- orphaned descendants after delete;
- moving only the parent node and losing the subtree.

## Rollback Rules

- invalid moves must not partially apply;
- failed deletes must leave the tree unchanged;
- failed moves must restore the last confirmed valid structure.
