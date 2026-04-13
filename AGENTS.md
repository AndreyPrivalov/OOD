# AGENTS.md

## Purpose

This file is the implementation constitution for OOD. Follow it when designing, building, refactoring, or reviewing features.

## Source of Truth

- `spec.md` is the master specification.
- `docs/` is the canonical documentation root.
- `docs/product.md` defines shared product vocabulary and cross-feature business rules.
- `docs/design-system.md` defines shared UI behavior and visual principles.
- `docs/tech.md` defines technical invariants and architecture constraints.
- `docs/features/*.md` define feature-specific business logic.
- Legacy `Docs/` content is migration-era material only and must not remain the long-term source of truth.

## Product Scope

Build and maintain only the cleaned core unless the spec is explicitly expanded:

- multiple shared workspaces;
- one work tree per workspace;
- root and child work-item creation;
- inline work-item editing;
- ratings and parent aggregate read values;
- stable sibling ordering;
- move among siblings;
- move to another valid parent;
- cascade deletion of a branch.

Do not reintroduce import/export, auth, audit history, archive/restore, or advanced collaboration unless the spec is updated first.

## Tech Stack & DB

- Language: `TypeScript`
- App: `Next.js App Router`
- Validation: `zod`
- ORM/migrations: `Drizzle ORM` + `drizzle-kit`
- Primary database: `PostgreSQL`
- Tree model: adjacency list with `parent_id` and `sibling_order`
- Use SQLite MCP only for local analysis tasks when helpful; application persistence is not SQLite.
- Runtime database configuration must come from `.env` / `DATABASE_URL`.
- In normal app runtime, temporary in-memory persistence is forbidden outside tests.

## Repository Shape

- `apps/web`: app assembly, routes, screens, server endpoints
- `packages/domain`: domain types, validation, invariants
- `packages/db`: schema, repositories, persistence adapters
- `packages/ui`: shared UI primitives and tree-specific components

Keep boundaries real. If a module does not provide reusable value, simplify it instead of preserving decorative structure.

## Documentation Rules

- All new feature logic must be documented in `docs/features/<feature-name>.md`.
- Keep business logic out of random notes or ad hoc markdown files.
- Keep shared design rules in `docs/design-system.md`, not duplicated in feature files unless the feature truly needs an exception.
- Keep technical invariants in `docs/tech.md`.
- Do not create local `rules.md` files or alternate documentation roots.

## Design Identity

Enforced via the shared UI layer and project styles. The specific core design principles defined in the spec and `docs/design-system.md` MUST be baked directly into the UI components to maintain the unique project vibe. Do NOT invent arbitrary styles or create local rules.md files.

Preserve these high-level qualities:

- calm, conservative, structured interface;
- dense but readable layout;
- minimal visual noise;
- typography-led hierarchy;
- predictable inline editing;
- tree clarity over decorative interaction.

## Frontend Rules

- Refactor gradually; do not do a risky rewrite.
- Break oversized files into smaller modules with clear ownership.
- Separate rendering, tree interaction logic, edit-state handling, and API contract mapping.
- Prefer reliable end-of-edit persistence triggers like `blur` over aggressive continuous autosave systems.
- Keep supported tree interactions limited to stable sibling ordering and moving under another valid parent.
- Remove legacy response-shape compatibility once the canonical contract is in place.

## UI Library Rules

- `packages/ui` must remain a real shared library.
- It should contain both base UI primitives and tree-oriented components needed for interface consistency.
- Do not leave the real app UI trapped in app-local monoliths if it belongs in the shared library.
- Do not move app-specific orchestration into `packages/ui`.

## Data and Domain Rules

- `title` cannot be saved empty.
- Ratings must stay within `0..5` or `null`.
- Parent rows expose aggregate rating read values in the primary tree view.
- Editing business fields must not implicitly change tree structure.
- Structural operations must be atomic from the user’s perspective.
- Invalid moves must never partially apply.

## Legacy Removal Rules

- Converge to one canonical API response shape.
- Converge to one naming scheme for fields.
- Remove non-test fallback persistence paths.
- Remove duplicate documentation roots after migration is complete.
- Do not add new compatibility aliases without an explicit migration note in docs.

## Tooling Rules

- Use Playwright strictly for visual screenshots. DOM-based assertions are FORBIDDEN.
- Use Context7 MCP for external docs. Do NOT fetch raw HTML.
- Use Memory MCP to store/retrieve state.
- Use Github MCP for diffs and history.

## Quality Gates

- Project MUST use Biome.
- Run `npm run check`.
- 0 errors required.
- All changes must preserve or improve tests around touched behavior.
- High-risk tree operations and persistence changes must include targeted tests.

## Delivery Rules

- Prefer small, reviewable refactors.
- Do not add product scope that exceeds the cleaned-core spec.
- If implementation pressure reveals a spec gap, update docs first, then code.
- After major specification changes, open a new chat and invoke the appropriate Builder skill for implementation work.
