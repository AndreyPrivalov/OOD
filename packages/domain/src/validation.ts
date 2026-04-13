import { z } from "zod"
import { DomainError, DomainErrorCode } from "./errors"
import { type RatingFieldKey, ratingFieldKeys, ratingValues } from "./ratings"
import type {
  CreateWorkItemInput,
  MoveWorkItemInput,
  UpdateWorkItemInput,
} from "./types"

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
  title: z.string().optional(),
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

export const MoveWorkItemInputSchema = z.object({
  targetParentId: z.string().nullable(),
  targetIndex: z.number().int().nonnegative(),
})

export function validateCreateWorkItemInput(input: CreateWorkItemInput) {
  for (const field of ratingFieldKeys) {
    assertRating(field, input[field])
  }
  return input
}

export function validateUpdateWorkItemInput(input: UpdateWorkItemInput) {
  if (typeof input.title === "string" && input.title.trim().length === 0) {
    throw new DomainError(DomainErrorCode.EMPTY_TITLE, "Title cannot be empty")
  }
  for (const field of ratingFieldKeys) {
    assertRating(field, input[field])
  }
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
