import {
  type AnyPgColumn,
  boolean,
  integer,
  jsonb,
  pgTable,
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

export const workItems = pgTable("work_items", {
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
  blocksMoney: integer("blocks_money"),
  currentProblems: jsonb("current_problems").notNull().default([]),
  solutionVariants: jsonb("solution_variants").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
