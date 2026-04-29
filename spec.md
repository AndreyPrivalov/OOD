# OOD Specification

## 1. Purpose

This document is the master specification for the next cleanup phase of OOD. It defines the target product scope, architectural direction, and non-negotiable constraints for a gradual long-term cleanup of the existing legacy implementation.

This phase does not aim to add broad new functionality. Its goal is to reduce accidental complexity, remove legacy behavior, and preserve only the product core that is worth stabilizing and growing.

## 2. Product Positioning

OOD is a web application for managing hierarchical work trees. It is designed for a small team that needs to decompose work into nested items, compare items using a mix of fixed ratings and workspace-defined impact metrics, and reorganize the structure safely.

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
- one workspace view that can show the work tree as table-only or as table plus mindmap;
- creation of root and child work items;
- inline editing of core fields;
- fixed ratings on work items;
- workspace-defined impact metrics on work items;
- aggregate ratings for parent items in read mode;
- aggregate metric values for parent items in read mode;
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
- durable audit history;
- standalone archive/restore flows that are not part of session-scoped undo/redo;
- advanced drag-and-drop behaviors beyond the basic supported moves.

## 6. Core Domain Model

### Workspace

A workspace is a shared container for one work tree. All users in the first cleaned phase have equal access to all workspaces.

Required workspace fields:

- `id`
- `name`
- `createdAt`
- `updatedAt`

Each workspace also owns a metric configuration set that may be empty and is scoped only to that workspace.

Required workspace metric fields:

- `id`
- `workspaceId`
- `shortName`
- `description`
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
- `metricValues`
- `currentProblems`
- `solutionVariants`
- `createdAt`
- `updatedAt`

## 7. Business Rules

### Workspace Rules

- a workspace contains exactly one work tree;
- work items cannot belong to multiple workspaces;
- moving an item across workspaces is out of scope;
- all workspaces are visible to all users in this phase;
- each workspace owns its own metric catalog;
- different workspaces may have different metric sets, including zero metrics;
- workspace rename, workspace metric management, and workspace deletion live in one workspace settings popup;
- `GET /api/workspaces/[id]/settings` and all successful settings writes return one canonical `workspace settings` shape with `workspace` and `metrics`;
- workspace rename is part of the workspace settings contract and must not introduce a second lighter response shape for the same popup flow;
- clients that render or mutate workspace settings must treat the settings shape as the only canonical source for workspace name and metric catalog state;
- deleting a workspace from the settings popup deletes its full tree and metric catalog.

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
- `PATCH /api/work-items/[id]` remains the canonical row-scoped write contract for row business fields and `metricValues`;
- if one row patch includes both row fields and `metricValues`, the server must treat it as one transactional application use case and must not commit only a subset of that requested change;
- one logical row edit session must survive local draft creation, persisted id remap after `create`, and any immediate follow-up patching without splitting into competing save identities;
- later confirmations or refreshes must never revert a newer locally confirmed row state for the same logical row;
- switching focus from one row to another after `blur` must not cause the earlier row to reset, even if network responses resolve out of order;
- editing fields must not implicitly change tree structure.

### Rating Rules

- ratings use integers from `0` to `5`;
- `null` is allowed and means “not rated”;
- parent items do not expose editable own ratings in the primary tree view;
- parent items display aggregated descendant sums in read mode;
- leaf items display their own stored ratings.
- after a successful leaf rating edit, affected parent aggregate sums must update immediately in the current client session without waiting for a page reload;
- the canonical write contract for item edits remains row-scoped, so immediate parent aggregate updates are owned by client-side derived tree state rather than by PATCH responses;
- a full tree fetch is the reconciliation path for server truth, but routine leaf rating edits must not depend on that fetch to look correct.

### Metric Rules

- workspace metrics are defined per workspace and do not leak across workspace boundaries;
- each metric has a required trimmed `shortName` and an optional trimmed `description`;
- duplicate metric names inside one workspace are allowed;
- empty metric names are forbidden as saved values;
- adding a metric appends it to the end of that workspace metric order;
- metric ordering is stable and is not manually editable in the first version;
- deleting a metric removes the metric definition and all stored values for that metric in the workspace;
- metric deletion does not require a confirmation popup and must instead be recoverable through canonical session undo;
- work item metric values use one canonical enum with three states: `none`, `indirect`, `direct`;
- missing or empty metric value is treated as `none`;
- leaf items display and edit their own stored metric values;
- parent items do not expose editable own metric values in the primary tree view;
- parent items display only aggregated descendant metric values;
- parent aggregate priority is deterministic: `direct` outranks `indirect`, and `indirect` outranks `none`;
- if any descendant is `direct`, the aggregated parent value is `direct`;
- otherwise, if any descendant is `indirect`, the aggregated parent value is `indirect`;
- otherwise, the aggregated parent value is `none`;
- when a new metric is added, existing work items in that workspace implicitly start with value `none`;
- removing legacy `blocksMoney` is part of this feature and no compatibility alias should preserve it in the long-term contract.

## 8. UX Direction for the Cleanup Phase

The product must prefer clarity and reliability over interaction cleverness.

### Tree Interaction

Supported structural interactions:

- reorder among siblings;
- move under another valid parent.

Supported workspace visualization interactions:

- a header-level toggle can switch the workspace view between `split` and `table-only`;
- in `split`, the table remains the canonical editing surface and the second pane renders a read-only mindmap of the same workspace tree;
- the mindmap supports pan and zoom;
- the mindmap never becomes a second editing surface for work-item fields or structure.

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

The system must not persist placeholder rows with an empty saved `title` just to support focus or creation flow. If the UI needs a temporary draft row, that draft must remain local until it can be saved with a valid non-empty `title`.

The create flow for a new draft row and the first persisted patches of that same row must behave as one logical save lineage. The client must not allow a later create acknowledgement, patch acknowledgement, or background reconcile to reintroduce an older snapshot of that row after the user has already continued editing elsewhere.

Routine inline text saves must be monotonic from the user perspective: once a newer row value has been confirmed locally for the current workspace session, older acknowledgements and older full-tree snapshots must not overwrite it. If a full refresh is needed for reconciliation, the client must either defer destructive replacement until all affected row save lineages are settled or merge server truth in a way that preserves unresolved newer local row state.

For leaf rating edits, the client must apply the confirmed row patch locally and immediately recompute aggregate sums for all affected ancestors in client state. One successful interaction must therefore update both the edited leaf value and the visible parent sums.

Workspace metric configuration must not be edited inline in the tree header. Metric creation, rename, and deletion belong to the workspace settings popup rather than to table-column affordances.

In the first version, leaf metric editing in the tree uses a dropdown control with the three canonical states. Parent rows remain read-only for metric columns.

When a work item enters inline edit mode, the client must keep the edited item and its nearby structural context visible in the mindmap pane. At minimum, the visible mindmap frame must include the edited node, its parent if present, and that parent's currently visible children. For a root item without parent, the visible frame must include the root and its currently visible root-level siblings.

### Session History

The cleaned core must support session-scoped undo and redo for canonical tree data actions.

- `cmd/ctrl + z` triggers undo for the active workspace;
- `cmd/ctrl + shift + z` triggers redo for the active workspace;
- history is stored separately per workspace;
- history includes only core data actions: `create`, inline field edits, rating edits, metric value edits, metric catalog edits, `move`, `delete`;
- internal restore operations for deleted branches and deleted metrics are in scope only as supporting mechanics of canonical undo/redo;
- these restore operations do not expand cleaned-core scope to durable audit history, trash bins, or standalone archive/restore product flows;
- history does not include purely visual client state such as collapse state, scroll position, selection, or measured layout values;
- refresh must preserve `past`, `present`, and `future` for the active browser tab via `sessionStorage`;
- closing the tab or window ends the session and naturally drops the history;
- one completed edit commit produces one history step; text fields continue to use `blur` as the default commit boundary;
- metric deletion from workspace settings must produce one undoable data action that can restore both the metric definition and all removed item values.

## 9. Architectural Direction

### Frontend

The frontend must be refactored gradually into smaller modules with clear ownership.

The target shape is:

- tree data/reconcile owns fetch, normalization, and server-truth adoption, but it must not blindly replace rows that still belong to unresolved local save lineages;
- edit/save orchestration owns logical row identity across local draft ids and persisted ids, per-row revision ordering, and the rule that create-plus-first-patch for a draft is one save lineage;
- shared tree projection owns field-level application of confirmed row patches and derived aggregates without requiring routine whole-tree replacement;
- background reconciliation may refresh settled rows, but focused rows, dirty rows, rows with unacknowledged changes, and rows participating in unresolved draft remap must remain protected from destructive overwrite.

- page-level composition kept small;
- tree interaction logic extracted from rendering;
- edit state and persistence triggers separated from visual components;
- API contract mapping separated from UI domain behavior.
- session history management kept in client state, with keyboard routing owned by workspace client composition instead of individual cells.
- tree-derived rating aggregates treated as a first-class client projection, recomputed locally after accepted leaf rating patches instead of relying on ad hoc refreshes.
- workspace settings composition separated from workspace switcher rendering.
- workspace metric catalog and metric value storage modeled as reusable domain concepts rather than as ad hoc dynamic table props.
- tree-derived metric aggregates treated as a first-class client projection, recomputed locally after accepted metric value edits instead of relying on full refresh.
- workspace tree data must feed both table rendering and mindmap rendering from one canonical client projection rather than from parallel feature-specific tree models.
- mindmap viewport state (`pan`, `zoom`, focus framing) is visual client state and must stay separate from canonical tree data, edit drafts, and session history data actions.
- tree data loading and reconcile logic must own fetch, refresh, canonical normalization, and server-truth reconciliation, but must not own inline edit drafts;
- optimistic structural actions must be isolated from row edit/save flows and own optimistic create/move/delete application plus rollback to the last confirmed tree;
- the history engine must own only history recording, `sessionStorage` persistence, shortcut routing inputs, and replay/remap rules; it must not become a general tree-fetch layer;
- metric catalog actions must stay scoped to workspace settings CRUD/restore and canonical settings responses rather than leaking into row-edit orchestration;
- edit/save orchestration must own row drafts, commit boundaries, payload building, stale-response protection, and recoverable error handling for row-scoped saves.

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
- one canonical aggregate-sync strategy for rating edits.
- one canonical workspace-metric model instead of hard-coded `blocksMoney` semantics.

The cleanup phase must remove or phase out:

- legacy compatibility aliases in active API responses;
- non-test in-memory repository fallbacks;
- redundant duplicate documentation roots.
- mixed behavior where some leaf rating edits use local aggregate recompute and others require forced refetch to show correct parent sums;
- legacy `blocksMoney` field usage in active domain, API, or UI contracts.

### Restore Contract

Undo and redo for branch deletion and branch recreation require one canonical restore contract.

- the server must expose a restore endpoint for a full branch snapshot;
- restore requests must be atomic;
- restore responses must return an `idMap`, even if ids are preserved as-is;
- clients must remap queued history references using the returned `idMap`;
- if session history restored from storage conflicts with the fetched server tree, the client must invalidate that workspace history, refresh from the server, and avoid partial replay.

### Testing Strategy

- pure tree transforms, history transforms, selector derivations, and payload builders should be tested through shared pure helpers with thin doubles where possible;
- persistence semantics that depend on transactions, sibling compaction, metric deletion, restore, or cross-table consistency must be tested primarily as Postgres integration tests;
- large product-parity in-memory repository adapters are a temporary migration aid only and must not remain the default way to validate persistence behavior;
- new tests must not deepen coupling to a monolithic in-memory adapter when a thinner double or a repository/application integration test can cover the behavior more faithfully.

### Approved Refactoring Goals

The current cleanup phase explicitly authorizes the following refactoring goals:

- remove active `import/export` product surfaces that are outside the cleaned core, including Google Sheets import and JSON/CSV export routes, tests, and supporting orchestration;
- enforce the `title` invariant across UI draft handling, domain validation, repository logic, and database constraints so that an empty `title` can never be persisted as a saved row;
- collapse the client/server tree contract to one canonical nested response shape and remove fallback normalization paths that silently accept alternative or legacy payload formats;
- reduce oversized orchestration modules by separating tree data loading, inline editing state, and drag/drop overlay mechanics into smaller modules with clear ownership;
- keep shared tree presentation in `packages/ui`, but move app-specific orchestration and contract-recovery logic out of the shared UI layer;
- replace hard-coded `blocksMoney` storage and rendering with workspace-scoped metric configuration and values.

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
- predictable workspace settings editing;
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
- saving a metric with an empty `shortName`;
- partially deleting a metric definition while leaving orphaned metric values behind;
- restoring metric deletion via undo without restoring the removed item values;
- partially applying a row-scoped patch that saves row fields but loses `metricValues`, or vice versa;
- allowing parent metric cells to behave like editable leaf metric cells in the primary tree view;
- allowing parent ratings to behave like editable leaf ratings in the primary tree view;
- serving multiple conflicting API field formats as a long-term contract;
- silently falling back to temporary in-memory persistence in a normal development or shared environment.

## 13. State Rollback and Failure Behavior

- if a structural operation is invalid, the operation must not partially apply;
- if a save fails, the UI must keep the last user-visible value understandable and recoverable;
- if an end-of-edit save fails, the row must clearly remain in a recoverable local editing state;
- if a move fails server-side, the tree must return to its last confirmed valid structure;
- if a delete fails, the branch must remain visible and unchanged;
- if loading a workspace fails, the error must be explicit and must not masquerade as an empty tree;
- if saving workspace settings fails, the popup must keep the user input recoverable and show a local error;
- if metric deletion fails, the metric and its values must remain unchanged;
- if undo of metric deletion fails, the current client state must roll back to the last confirmed server-aligned version rather than leaving a half-restored metric column.

## 14. Deliverables of This Cleanup Phase

This phase should result in:

- a smaller and clearer product core;
- a canonical `docs/`-based documentation system;
- a simplified but trustworthy tree interaction model;
- a retained but cleaned shared UI package;
- a stable Postgres-backed product baseline suitable for future team growth.
