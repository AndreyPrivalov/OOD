export const DomainErrorCode = {
  INVALID_NUMERIC_RANGE: "INVALID_NUMERIC_RANGE",
  EMPTY_TITLE: "EMPTY_TITLE",
  EMPTY_WORKSPACE_METRIC_SHORT_NAME: "EMPTY_WORKSPACE_METRIC_SHORT_NAME",
  PARENT_NOT_FOUND: "PARENT_NOT_FOUND",
  CYCLE_DETECTED: "CYCLE_DETECTED",
  INVALID_MOVE_TARGET: "INVALID_MOVE_TARGET",
  PARENT_RATINGS_READ_ONLY: "PARENT_RATINGS_READ_ONLY",
} as const

export type DomainErrorCode =
  (typeof DomainErrorCode)[keyof typeof DomainErrorCode]

export class DomainError extends Error {
  public readonly code: DomainErrorCode

  constructor(code: DomainErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = "DomainError"
  }
}
