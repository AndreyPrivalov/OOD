# OOD Work Hierarchy

Monorepo for MVP web app that manages a hierarchical list of work items.

## Stack

- TypeScript fullstack
- Next.js App Router
- PostgreSQL (adjacency list + sibling ordering)
- Drizzle ORM
- Zod validation
- TanStack Query (planned for client data fetching/mutations)

## Workspace

- `apps/web` - web app (UI + route handlers)
- `packages/domain` - domain types, errors, validation, tree invariants
- `packages/db` - schema, client wiring, repository interfaces
- `packages/ui` - reusable UI components for tree/table view
- `docs` - canonical documentation root for shared product, design, technical, and feature rules

## Source of truth

- `spec.md` - master specification for the cleaned core
- `AGENTS.md` - implementation constitution for changes and reviews
- `docs/product.md` - shared product vocabulary and cross-feature rules
- `docs/design-system.md` - shared UI behavior and visual principles
- `docs/tech.md` - technical invariants and architecture constraints
- `docs/features/*.md` - feature-specific business logic

## Prerequisites

1. Install `Node.js 22 LTS`.
2. Enable Corepack and activate pnpm:
```bash
corepack enable
corepack prepare pnpm@9.12.2 --activate
```
3. Install and start `Docker Desktop` for macOS (Apple Silicon).

## Local setup

1. Install dependencies:
```bash
pnpm install
```
2. Create environment file for web app:
```bash
cp apps/web/.env.example apps/web/.env.local
```
3. Set `DATABASE_URL` in `apps/web/.env.local`.

Example:
```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ood
NEXT_PUBLIC_APP_NAME=OOD Work Hierarchy
```

## Database

1. Start PostgreSQL via Docker Compose:
```bash
docker compose up -d
# or
pnpm db:up
```
2. Run migrations:
```bash
pnpm db:migrate
```

3. Run app with DB bootstrap in one command:
```bash
pnpm dev:with-db
```

If `docker` command is not found, install Docker Desktop and ensure engine status is `Running`.

## Run and view result

1. Start dev server:
```bash
pnpm dev
```
2. Open:
`http://localhost:3000`

You should see:
- root/child creation,
- inline field editing,
- ratings with aggregate read values on parent rows,
- move within siblings or to another parent,
- delete item/branch,
- persisted tree from Postgres.

## Quick diagnostics

- `zsh: command not found: node` -> Node.js is not installed.
- `zsh: command not found: pnpm` -> run Corepack commands above.
- `zsh: command not found: docker` -> Docker Desktop is not installed or PATH is not updated.
- `DATABASE_URL is required` -> missing env in `apps/web/.env.local`.
- DB connection errors -> verify Postgres is running and credentials are correct.
