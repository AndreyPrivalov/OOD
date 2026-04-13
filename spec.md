# OOD Specification

## 1. Purpose

This document is the master specification for the next cleanup phase of OOD. It defines the target product scope, architectural direction, and non-negotiable constraints for a gradual long-term cleanup of the existing legacy implementation.

This phase does not aim to add broad new functionality. Its goal is to reduce accidental complexity, remove legacy behavior, and preserve only the product core that is worth stabilizing and growing.

## 2. Product Positioning

OOD is a web application for managing hierarchical work trees. It is designed for a small team that needs to decompose work into nested items, compare items using a fixed set of ratings, and reorganize the structure safely.

The system should support a shared environment for up to roughly ten users, but the first cleaned-up architecture does not need user-specific accounts, role-based permissions, or real-time conflict handling.

## 3. Strategic Direction

The project must evolve through gradual cleanup, not a risky rewrite.

The architecture must move toward:

- fewer oversized files;
- fewer fake boundaries that do not carry real value;
- one canonical data contract;
- one canonical persistence mode;
- a smaller and more reliable product core;
- a real shared UI library instead of a nominal package.

The architecture must move away from:

- legacy compatibility paths in active code;
- optional in-memory runtime behavior in non-test scenarios;
- product scope that exceeds the stability of the implementation;
- hidden coupling between UI state, drag-and-drop logic, and persistence mechanics.

## 4. Canonical Documentation Structure

The canonical documentation root is `docs/`.

Responsibilities:

- `spec.md` — master product and architecture specification;
- `docs/product.md` — cross-feature product logic and vocabulary;
- `docs/design-system.md` — shared design principles and UI behavior rules;
- `docs/tech.md` — technical invariants and implementation constraints;
- `docs/features/*.md` — business logic and feature-specific rules.

`docs/` is the only canonical documentation root. `Docs/` and ad hoc root markdown drafts are obsolete and must not remain in active use.

## 5. Target Scope of the Cleaned Core

The cleaned core must include:

- multiple shared workspaces;
- one work tree per workspace;
- creation of root and child work items;
- inline editing of core fields;
- ratings on work items;
- aggregate ratings for parent items in read mode;
- deterministic ordering among siblings;
- moving an item within sibling order;
- moving an item to a different parent;
- cascade deletion of a branch.

This phase must explicitly exclude:

- authentication and authorization;
- personal/private workspaces;
- concurrent editing conflict resolution;
- real-time collaborative presence;
- Google Sheets import;
- JSON export;
- CSV export;
- audit history;
- archive and restore;
- advanced drag-and-drop behaviors beyond the basic supported moves.

## 6. Core Domain Model

### Workspace

A workspace is a shared container for one work tree. All users in the first cleaned phase have equal access to all workspaces.

Required workspace fields:

- `id`
- `name`
- `createdAt`
- `updatedAt`

### Work Item

A work item is a single node in a workspace tree.

Required or supported fields:

- `id`
- `workspaceId`
- `title`
- `object`
- `possiblyRemovable`
- `parentId`
- `siblingOrder`
- `overcomplication`
- `importance`
- `blocksMoney`
- `currentProblems`
- `solutionVariants`
- `createdAt`
- `updatedAt`

## 7. Business Rules

### Workspace Rules

- a workspace contains exactly one work tree;
- work items cannot belong to multiple workspaces;
- moving an item across workspaces is out of scope;
- all workspaces are visible to all users in this phase.

### Tree Rules

- a work item may be root or child;
- a child has exactly one parent;
- cycles are forbidden;
- sibling order is meaningful and must be stable;
- moving an item changes only structure, not business content;
- deleting a parent deletes the full branch;
- the system must preserve subtree integrity after any supported move.

### Editing Rules

- `title` cannot be empty as a saved value;
- `object` may be temporarily empty during creation/editing flow;
- `currentProblems` and `solutionVariants` are ordered text lists;
- editing fields must not implicitly change tree structure.

### Rating Rules

- ratings use integers from `0` to `5`;
- `null` is allowed and means “not rated”;
- parent items do not expose editable own ratings in the primary tree view;
- parent items display aggregated descendant sums in read mode;
- leaf items display their own stored ratings.

## 8. UX Direction for the Cleanup Phase

The product must prefer clarity and reliability over interaction cleverness.

### Tree Interaction

Supported structural interactions:

- reorder among siblings;
- move under another valid parent.

Not supported in the cleaned core:

- broad free-form drag heuristics;
- complex multi-target lane systems;
- advanced root-drop behaviors unless later reintroduced intentionally.

### Saving Behavior

The UI must not require an explicit save button for routine inline edits.

The default save behavior should be based on stable end-of-edit triggers such as:

- `blur`;
- equivalent completion triggers for toggles and discrete controls.

The system should avoid aggressive continuous autosave queues when a simpler end-of-edit save can deliver a more predictable result.

## 9. Architectural Direction

### Frontend

The frontend must be refactored gradually into smaller modules with clear ownership.

The target shape is:

- page-level composition kept small;
- tree interaction logic extracted from rendering;
- edit state and persistence triggers separated from visual components;
- API contract mapping separated from UI domain behavior.

### Package Structure

The repository structure must be simplified so that boundaries are real, not decorative.

Desired package intent:

- `apps/web` — application assembly, routes, screens, server endpoints;
- `packages/domain` — core domain types, validation, invariants;
- `packages/db` — schema, persistence adapters, repositories;
- `packages/ui` — actual shared design-system primitives and tree-oriented components.

If a boundary is not actively useful, it should be simplified rather than preserved cosmetically.

### Legacy Removal

The system must converge toward:

- one canonical API response shape;
- one canonical naming scheme for fields;
- one official runtime persistence mode outside tests.

The cleanup phase must remove or phase out:

- legacy compatibility aliases in active API responses;
- non-test in-memory repository fallbacks;
- redundant duplicate documentation roots.

## 10. Technology Decisions

- language: `TypeScript`;
- web platform: `Next.js App Router`;
- primary database: `PostgreSQL`;
- ORM and migrations: `Drizzle ORM` + `drizzle-kit`;
- validation: `zod`;
- database model for tree: adjacency list with `parent_id` and `sibling_order`.

Rationale:

- team access matters more than local-only simplicity;
- expected load is small, so PostgreSQL is operationally acceptable;
- the existing stack is already close enough to the target direction to clean rather than replace.

## 11. Quality and Stability Priorities

The cleanup phase must prioritize:

- correctness of tree operations;
- consistency of persistence behavior;
- predictable inline editing;
- reduction of oversized modules;
- shared UI consistency through `packages/ui`;
- removal of product features that create complexity without being core.

## 12. Negative Scenarios

The specification must explicitly reject or handle these cases:

- saving a work item with an empty `title`;
- assigning a non-existent parent;
- moving an item into itself;
- moving an item into its own descendant;
- corrupting sibling order after move or delete;
- partial subtree loss after move;
- partial subtree loss after delete;
- editing fields and accidentally changing structure;
- writing invalid rating values outside `0..5`;
- allowing parent ratings to behave like editable leaf ratings in the primary tree view;
- serving multiple conflicting API field formats as a long-term contract;
- silently falling back to temporary in-memory persistence in a normal development or shared environment.

## 13. State Rollback and Failure Behavior

- if a structural operation is invalid, the operation must not partially apply;
- if a save fails, the UI must keep the last user-visible value understandable and recoverable;
- if an end-of-edit save fails, the row must clearly remain in a recoverable local editing state;
- if a move fails server-side, the tree must return to its last confirmed valid structure;
- if a delete fails, the branch must remain visible and unchanged;
- if loading a workspace fails, the error must be explicit and must not masquerade as an empty tree.

## 14. Deliverables of This Cleanup Phase

This phase should result in:

- a smaller and clearer product core;
- a canonical `docs/`-based documentation system;
- a simplified but trustworthy tree interaction model;
- a retained but cleaned shared UI package;
- a stable Postgres-backed product baseline suitable for future team growth.
