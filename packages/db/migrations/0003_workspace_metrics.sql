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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'work_items'
      AND column_name = 'blocks_money'
  ) THEN
    INSERT INTO "workspace_metrics" (
      "id",
      "workspace_id",
      "short_name",
      "description",
      "sibling_order",
      "created_at",
      "updated_at"
    )
    SELECT
      wi.workspace_id || ':legacy-blocks-money',
      wi.workspace_id,
      'Деньги',
      'Migrated from legacy blocks_money rating',
      COALESCE(MAX(wm.sibling_order) + 1, 0),
      now(),
      now()
    FROM "work_items" wi
    LEFT JOIN "workspace_metrics" wm
      ON wm.workspace_id = wi.workspace_id
    GROUP BY wi.workspace_id
    HAVING COUNT(*) FILTER (WHERE wi.blocks_money IS NOT NULL) > 0
    ON CONFLICT ("id") DO NOTHING;

    INSERT INTO "work_item_metric_values" (
      "work_item_id",
      "metric_id",
      "value",
      "created_at",
      "updated_at"
    )
    SELECT
      wi.id,
      wi.workspace_id || ':legacy-blocks-money',
      CASE
        WHEN wi.blocks_money IS NULL OR wi.blocks_money = 0 THEN 'none'
        WHEN wi.blocks_money <= 2 THEN 'indirect'
        ELSE 'direct'
      END,
      now(),
      now()
    FROM "work_items" wi
    WHERE wi.blocks_money IS NOT NULL
    ON CONFLICT ("work_item_id", "metric_id")
    DO UPDATE SET
      "value" = EXCLUDED."value",
      "updated_at" = now();
  END IF;
END $$;

ALTER TABLE "work_items" DROP CONSTRAINT IF EXISTS "work_items_blocks_money_range";
ALTER TABLE "work_items" DROP COLUMN IF EXISTS "blocks_money";
