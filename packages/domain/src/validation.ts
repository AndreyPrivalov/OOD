import { z } from "zod"
import { DomainError, DomainErrorCode } from "./errors"
import { type RatingFieldKey, ratingFieldKeys, ratingValues } from "./ratings"
import type {
  CanonicalCreateWorkItemInput,
  CanonicalRestoreWorkItemSnapshot,
  CanonicalUpdateWorkItemInput,
  CreateWorkItemInput,
  MoveWorkItemInput,
  RestoreWorkItemBranchInput,
  RestoreWorkItemSnapshot,
  UpdateWorkItemInput,
  UpsertWorkspaceMetricInput,
} from "./types"
import {
  WorkItemMetricValuesSchema,
  WorkspaceMetricValueSchema,
  normalizeWorkspaceMetricInput,
} from "./workspace-metrics"

export const RatingSchema = z.union(
  ratingValues.map((value) => z.literal(value)) as [
    z.ZodLiteral<0>,
    z.ZodLiteral<1>,
    z.ZodLiteral<2>,
    z.ZodLiteral<3>,
    z.ZodLiteral<4>,
    z.ZodLiteral<5>,
  ],
)

export const CreateWorkItemInputSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string(),
  object: z.string().nullable().optional(),
  possiblyRemovable: z.boolean().optional(),
  parentId: z.string().nullable().optional(),
  siblingOrder: z.number().int().nonnegative().optional(),
  overcomplication: RatingSchema.nullable().optional(),
  importance: RatingSchema.nullable().optional(),
  blocksMoney: RatingSchema.nullable().optional(),
  currentProblems: z.array(z.string()).optional(),
  solutionVariants: z.array(z.string()).optional(),
})

export const CanonicalCreateWorkItemInputSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string(),
  object: z.string().nullable().optional(),
  possiblyRemovable: z.boolean().optional(),
  parentId: z.string().nullable().optional(),
  siblingOrder: z.number().int().nonnegative().optional(),
  overcomplication: RatingSchema.nullable().optional(),
  importance: RatingSchema.nullable().optional(),
  metricValues: WorkItemMetricValuesSchema.optional(),
  currentProblems: z.array(z.string()).optional(),
  solutionVariants: z.array(z.string()).optional(),
})

export const UpdateWorkItemInputSchema = z.object({
  title: z.string().optional(),
  object: z.string().nullable().optional(),
  possiblyRemovable: z.boolean().optional(),
  overcomplication: RatingSchema.nullable().optional(),
  importance: RatingSchema.nullable().optional(),
  blocksMoney: RatingSchema.nullable().optional(),
  currentProblems: z.array(z.string()).optional(),
  solutionVariants: z.array(z.string()).optional(),
})

export const CanonicalUpdateWorkItemInputSchema = z.object({
  title: z.string().optional(),
  object: z.string().nullable().optional(),
  possiblyRemovable: z.boolean().optional(),
  overcomplication: RatingSchema.nullable().optional(),
  importance: RatingSchema.nullable().optional(),
  metricValues: WorkItemMetricValuesSchema.optional(),
  currentProblems: z.array(z.string()).optional(),
  solutionVariants: z.array(z.string()).optional(),
})

export const MoveWorkItemInputSchema = z.object({
  targetParentId: z.string().nullable(),
  targetIndex: z.number().int().nonnegative(),
})

export const RestoreWorkItemSnapshotSchema: z.ZodType<RestoreWorkItemSnapshot> =
  z.lazy(() =>
    z.object({
      id: z.string().min(1),
      workspaceId: z.string().min(1),
      title: z.string(),
      object: z.string().nullable(),
      possiblyRemovable: z.boolean(),
      parentId: z.string().nullable(),
      siblingOrder: z.number().int().nonnegative(),
      overcomplication: RatingSchema.nullable().optional(),
      importance: RatingSchema.nullable().optional(),
      blocksMoney: RatingSchema.nullable().optional(),
      currentProblems: z.array(z.string()),
      solutionVariants: z.array(z.string()),
      children: z.array(RestoreWorkItemSnapshotSchema),
    }),
  )

export const CanonicalRestoreWorkItemSnapshotSchema: z.ZodType<CanonicalRestoreWorkItemSnapshot> =
  z.lazy(() =>
    z.object({
      id: z.string().min(1),
      workspaceId: z.string().min(1),
      title: z.string(),
      object: z.string().nullable(),
      possiblyRemovable: z.boolean(),
      parentId: z.string().nullable(),
      siblingOrder: z.number().int().nonnegative(),
      overcomplication: RatingSchema.nullable().optional(),
      importance: RatingSchema.nullable().optional(),
      metricValues: WorkItemMetricValuesSchema.optional(),
      currentProblems: z.array(z.string()),
      solutionVariants: z.array(z.string()),
      children: z.array(CanonicalRestoreWorkItemSnapshotSchema),
    }),
  )

export const RestoreWorkItemBranchInputSchema = z.object({
  workspaceId: z.string().min(1),
  targetParentId: z.string().nullable(),
  targetIndex: z.number().int().nonnegative(),
  root: RestoreWorkItemSnapshotSchema,
}) satisfies z.ZodType<RestoreWorkItemBranchInput>

export function validateCreateWorkItemInput(input: CreateWorkItemInput) {
  assertNonEmptyTitle(input.title)
  for (const field of ratingFieldKeys) {
    assertRating(field, input[field])
  }
  return input
}

const canonicalRatingFieldKeys = ["overcomplication", "importance"] as const

export function validateCanonicalCreateWorkItemInput(
  input: CanonicalCreateWorkItemInput,
) {
  assertNonEmptyTitle(input.title)
  for (const field of canonicalRatingFieldKeys) {
    assertRating(field, input[field])
  }
  assertMetricValues(input.metricValues)
  return input
}

export function validateUpdateWorkItemInput(input: UpdateWorkItemInput) {
  if (typeof input.title === "string") {
    assertNonEmptyTitle(input.title)
  }
  for (const field of ratingFieldKeys) {
    assertRating(field, input[field])
  }
  return input
}

export function validateCanonicalUpdateWorkItemInput(
  input: CanonicalUpdateWorkItemInput,
) {
  if (typeof input.title === "string") {
    assertNonEmptyTitle(input.title)
  }
  for (const field of canonicalRatingFieldKeys) {
    assertRating(field, input[field])
  }
  assertMetricValues(input.metricValues)
  return input
}

export function validateMoveWorkItemInput(input: MoveWorkItemInput) {
  if (input.targetIndex < 0) {
    throw new DomainError(
      DomainErrorCode.INVALID_MOVE_TARGET,
      "Target index cannot be negative",
    )
  }
  return input
}

export function validateRestoreWorkItemBranchInput(
  input: RestoreWorkItemBranchInput,
) {
  if (input.targetIndex < 0) {
    throw new DomainError(
      DomainErrorCode.INVALID_MOVE_TARGET,
      "Target index cannot be negative",
    )
  }

  const queue: RestoreWorkItemSnapshot[] = [input.root]
  const ids = new Set<string>()

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) {
      continue
    }

    if (current.workspaceId !== input.workspaceId) {
      throw new DomainError(
        DomainErrorCode.INVALID_MOVE_TARGET,
        "Restore snapshot must belong to one workspace",
      )
    }
    if (ids.has(current.id)) {
      throw new DomainError(
        DomainErrorCode.INVALID_MOVE_TARGET,
        "Restore snapshot contains duplicate ids",
      )
    }
    ids.add(current.id)
    assertNonEmptyTitle(current.title)
    for (const field of ratingFieldKeys) {
      assertRating(field, current[field])
    }
    queue.push(...current.children)
  }

  return input
}

export function validateCanonicalRestoreWorkItemBranchInput(
  input: RestoreWorkItemBranchInput & {
    root: CanonicalRestoreWorkItemSnapshot
  },
) {
  if (input.targetIndex < 0) {
    throw new DomainError(
      DomainErrorCode.INVALID_MOVE_TARGET,
      "Target index cannot be negative",
    )
  }

  const queue: CanonicalRestoreWorkItemSnapshot[] = [input.root]
  const ids = new Set<string>()

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) {
      continue
    }

    if (current.workspaceId !== input.workspaceId) {
      throw new DomainError(
        DomainErrorCode.INVALID_MOVE_TARGET,
        "Restore snapshot must belong to one workspace",
      )
    }
    if (ids.has(current.id)) {
      throw new DomainError(
        DomainErrorCode.INVALID_MOVE_TARGET,
        "Restore snapshot contains duplicate ids",
      )
    }

    ids.add(current.id)
    assertNonEmptyTitle(current.title)
    for (const field of canonicalRatingFieldKeys) {
      assertRating(field, current[field])
    }
    assertMetricValues(current.metricValues)
    queue.push(...current.children)
  }

  return input
}

export function validateUpsertWorkspaceMetricInput(
  input: UpsertWorkspaceMetricInput,
) {
  return normalizeWorkspaceMetricInput(input)
}

function assertRating(field: RatingFieldKey, value: number | null | undefined) {
  if (value === null || value === undefined) {
    return
  }
  if (!Number.isInteger(value) || value < 0 || value > 5) {
    throw new DomainError(
      DomainErrorCode.INVALID_NUMERIC_RANGE,
      `${field} should be an integer between 0 and 5`,
    )
  }
}

function assertNonEmptyTitle(title: string) {
  if (title.trim().length === 0) {
    throw new DomainError(DomainErrorCode.EMPTY_TITLE, "Title cannot be empty")
  }
}

function assertMetricValues(metricValues: unknown) {
  if (metricValues === undefined) {
    return
  }
  const parsed = WorkItemMetricValuesSchema.safeParse(metricValues)
  if (!parsed.success) {
    throw new DomainError(
      DomainErrorCode.INVALID_NUMERIC_RANGE,
      "metricValues should contain only canonical enum values",
    )
  }
  for (const value of Object.values(parsed.data)) {
    WorkspaceMetricValueSchema.parse(value)
  }
}
