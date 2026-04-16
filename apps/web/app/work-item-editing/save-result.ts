export const SAVE_ROW_DEFERRED_ERROR_KEY = "__saveRowDeferredError"

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
