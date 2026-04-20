CREATE TABLE IF NOT EXISTS "workspace_metrics" (
  "id" text PRIMARY KEY,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "short_name" text NOT NULL,
  "description" text,
  "sibling_order" int NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_metrics_short_name_not_empty" CHECK (btrim("short_name") <> '')
);

CREATE INDEX IF NOT EXISTS "idx_workspace_metrics_workspace_sibling"
  ON "workspace_metrics" ("workspace_id", "sibling_order");

CREATE TABLE IF NOT EXISTS "work_item_metric_values" (
  "work_item_id" text NOT NULL REFERENCES "work_items"("id") ON DELETE CASCADE,
  "metric_id" text NOT NULL REFERENCES "workspace_metrics"("id") ON DELETE CASCADE,
  "value" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "work_item_metric_values_pk" PRIMARY KEY ("work_item_id", "metric_id"),
  CONSTRAINT "work_item_metric_values_value_check" CHECK ("value" in ('none', 'indirect', 'direct'))
);

CREATE INDEX IF NOT EXISTS "idx_work_item_metric_values_metric"
  ON "work_item_metric_values" ("metric_id");

ALTER TABLE "work_items" DROP CONSTRAINT IF EXISTS "work_items_blocks_money_range";
ALTER TABLE "work_items" DROP COLUMN IF EXISTS "blocks_money";
