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
- `Docs` - canonical product/design/technical knowledge base

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

## Import / Export

### Import from Google Sheets

`POST /api/work-items/import/google-sheet`

Example dry run:
```bash
curl -X POST "http://localhost:3000/api/work-items/import/google-sheet" \
  -H "content-type: application/json" \
  -d '{
    "sheetUrl": "https://docs.google.com/spreadsheets/d/1A2--ansmO0qlNZ5spLXugSgclBuG3ftoHqU3tHPaU6A/edit?usp=sharing",
    "workspaceId": "default-workspace",
    "mode": "replace",
    "dryRun": true
  }'
```

### Export work items

JSON:
```bash
curl "http://localhost:3000/api/work-items/export?workspaceId=default-workspace&format=json"
```

CSV:
```bash
curl -L "http://localhost:3000/api/work-items/export?workspaceId=default-workspace&format=csv"
```

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
- move within siblings or to another parent,
- delete item/branch,
- persisted tree from Postgres.

## Quick diagnostics

- `zsh: command not found: node` -> Node.js is not installed.
- `zsh: command not found: pnpm` -> run Corepack commands above.
- `zsh: command not found: docker` -> Docker Desktop is not installed or PATH is not updated.
- `DATABASE_URL is required` -> missing env in `apps/web/.env.local`.
- DB connection errors -> verify Postgres is running and credentials are correct.
