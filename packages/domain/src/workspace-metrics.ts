import { z } from "zod"
import { DomainError, DomainErrorCode } from "./errors"
import type { WorkItemId, WorkspaceId } from "./identifiers"

export const workspaceMetricValueLiterals = [
  "none",
  "indirect",
  "direct",
] as const

export type WorkspaceMetricValue = (typeof workspaceMetricValueLiterals)[number]

export interface WorkspaceMetric {
  id: string
  workspaceId: WorkspaceId
  shortName: string
  description: string | null
  createdAt: Date
  updatedAt: Date
}

export type WorkItemMetricValues = Record<string, WorkspaceMetricValue>

export interface WorkItemMetricValueEntry {
  workItemId: WorkItemId
  metricId: string
  value: WorkspaceMetricValue
}

export const WorkspaceMetricValueSchema = z.union(
  workspaceMetricValueLiterals.map((value) => z.literal(value)) as [
    z.ZodLiteral<"none">,
    z.ZodLiteral<"indirect">,
    z.ZodLiteral<"direct">,
  ],
)

export const WorkItemMetricValuesSchema = z.record(
  z.string().min(1),
  WorkspaceMetricValueSchema,
)

export const WorkspaceMetricSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  shortName: z.string(),
  description: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const UpsertWorkspaceMetricInputSchema = z.object({
  shortName: z.string(),
  description: z.string().nullable().optional(),
})

export interface UpsertWorkspaceMetricInput {
  shortName: string
  description?: string | null
}

export function normalizeWorkspaceMetricInput(
  input: UpsertWorkspaceMetricInput,
) {
  const shortName = input.shortName.trim()
  if (shortName.length === 0) {
    throw new DomainError(
      DomainErrorCode.EMPTY_WORKSPACE_METRIC_SHORT_NAME,
      "Workspace metric shortName cannot be empty",
    )
  }

  const description =
    input.description === null || input.description === undefined
      ? null
      : input.description.trim()

  return {
    shortName,
    description,
  }
}
