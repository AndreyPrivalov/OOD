create table if not exists workspaces (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists work_items (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  title text not null,
  object text,
  parent_id text,
  sibling_order int not null default 0,
  overcomplication int,
  importance int,
  blocks_money int,
  current_problems jsonb not null default '[]'::jsonb,
  solution_variants jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_items_parent_fk foreign key (parent_id) references work_items(id) on delete cascade,
  constraint work_items_overcomplication_range check (overcomplication is null or overcomplication between 0 and 5),
  constraint work_items_importance_range check (importance is null or importance between 0 and 5),
  constraint work_items_blocks_money_range check (blocks_money is null or blocks_money between 0 and 5)
);

create index if not exists idx_work_items_workspace on work_items (workspace_id);
create index if not exists idx_work_items_parent on work_items (parent_id);
create index if not exists idx_work_items_sibling_order on work_items (workspace_id, parent_id, sibling_order);
