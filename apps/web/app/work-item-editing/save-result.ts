export const SAVE_ROW_DEFERRED_ERROR_KEY = "__saveRowDeferredError"
export const CREATE_LINEAGE_ORPHANED_KEY = "__createLineageOrphaned"

type ObjectWithUnknownProps = Record<string, unknown>

export function attachSaveRowDeferredError<T extends ObjectWithUnknownProps>(
  value: T,
  error: unknown,
): T & { [SAVE_ROW_DEFERRED_ERROR_KEY]: unknown } {
  return {
    ...value,
    [SAVE_ROW_DEFERRED_ERROR_KEY]: error,
  }
}

export function readSaveRowDeferredError(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return undefined
  }

  const record = value as ObjectWithUnknownProps
  return record[SAVE_ROW_DEFERRED_ERROR_KEY]
}

export function attachCreateLineageOrphaned<T extends ObjectWithUnknownProps>(
  value: T,
): T & { [CREATE_LINEAGE_ORPHANED_KEY]: true } {
  return {
    ...value,
    [CREATE_LINEAGE_ORPHANED_KEY]: true,
  }
}

export function isCreateLineageOrphaned(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false
  }

  const record = value as ObjectWithUnknownProps
  return record[CREATE_LINEAGE_ORPHANED_KEY] === true
}
