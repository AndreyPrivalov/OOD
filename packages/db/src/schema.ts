import { sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const workItems = pgTable(
  "work_items",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    object: text("object"),
    possiblyRemovable: boolean("possibly_removable").notNull().default(false),
    parentId: text("parent_id").references((): AnyPgColumn => workItems.id, {
      onDelete: "cascade",
    }),
    siblingOrder: integer("sibling_order").notNull().default(0),
    overcomplication: integer("overcomplication"),
    importance: integer("importance"),
    currentProblems: jsonb("current_problems").notNull().default([]),
    solutionVariants: jsonb("solution_variants").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    workItemsTitleNotEmpty: check(
      "work_items_title_not_empty",
      sql`btrim(${table.title}) <> ''`,
    ),
  }),
)

export const workspaceMetrics = pgTable(
  "workspace_metrics",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    shortName: text("short_name").notNull(),
    description: text("description"),
    siblingOrder: integer("sibling_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    workspaceMetricsShortNameNotEmpty: check(
      "workspace_metrics_short_name_not_empty",
      sql`btrim(${table.shortName}) <> ''`,
    ),
    workspaceMetricsWorkspaceSiblingIdx: index(
      "idx_workspace_metrics_workspace_sibling",
    ).on(table.workspaceId, table.siblingOrder),
  }),
)

export const workItemMetricValues = pgTable(
  "work_item_metric_values",
  {
    workItemId: text("work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    metricId: text("metric_id")
      .notNull()
      .references(() => workspaceMetrics.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    workItemMetricValuesPk: primaryKey({
      columns: [table.workItemId, table.metricId],
      name: "work_item_metric_values_pk",
    }),
    workItemMetricValuesEnumCheck: check(
      "work_item_metric_values_value_check",
      sql`${table.value} in ('none', 'indirect', 'direct')`,
    ),
    workItemMetricValuesMetricIdx: index(
      "idx_work_item_metric_values_metric",
    ).on(table.metricId),
  }),
)
