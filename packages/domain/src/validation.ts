import { z } from "zod";
import { DomainError, DomainErrorCode } from "./errors";
import type { CreateWorkItemInput, MoveWorkItemInput, UpdateWorkItemInput } from "./types";

const RatingSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5)
]);

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
  solutionVariants: z.array(z.string()).optional()
});

export const UpdateWorkItemInputSchema = z.object({
  title: z.string().optional(),
  object: z.string().nullable().optional(),
  possiblyRemovable: z.boolean().optional(),
  overcomplication: RatingSchema.nullable().optional(),
  importance: RatingSchema.nullable().optional(),
  blocksMoney: RatingSchema.nullable().optional(),
  currentProblems: z.array(z.string()).optional(),
  solutionVariants: z.array(z.string()).optional()
});

export const MoveWorkItemInputSchema = z.object({
  targetParentId: z.string().nullable(),
  targetIndex: z.number().int().nonnegative()
});

export function validateCreateWorkItemInput(input: CreateWorkItemInput) {
  assertRating("overcomplication", input.overcomplication);
  assertRating("importance", input.importance);
  assertRating("blocksMoney", input.blocksMoney);
  return input;
}

export function validateUpdateWorkItemInput(input: UpdateWorkItemInput) {
  if (typeof input.title === "string" && input.title.trim().length === 0) {
    throw new DomainError(DomainErrorCode.EMPTY_TITLE, "Title cannot be empty");
  }
  assertRating("overcomplication", input.overcomplication);
  assertRating("importance", input.importance);
  assertRating("blocksMoney", input.blocksMoney);
  return input;
}

export function validateMoveWorkItemInput(input: MoveWorkItemInput) {
  if (input.targetIndex < 0) {
    throw new DomainError(
      DomainErrorCode.INVALID_MOVE_TARGET,
      "Target index cannot be negative"
    );
  }
  return input;
}

function assertRating(
  field: "overcomplication" | "importance" | "blocksMoney",
  value: number | null | undefined
) {
  if (value === null || value === undefined) {
    return;
  }
  if (!Number.isInteger(value) || value < 0 || value > 5) {
    throw new DomainError(
      DomainErrorCode.INVALID_NUMERIC_RANGE,
      `${field} should be an integer between 0 and 5`
    );
  }
}
