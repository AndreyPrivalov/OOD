import { describe, expect, it } from "vitest"
import {
  SAVE_ROW_DEFERRED_ERROR_KEY,
  attachSaveRowDeferredError,
  readSaveRowDeferredError,
} from "./save-result"

describe("save result deferred error marker", () => {
  it("attaches and reads deferred error", () => {
    const error = new Error("patch failed")
    const value = attachSaveRowDeferredError({ id: "row-1" }, error)

    expect(value[SAVE_ROW_DEFERRED_ERROR_KEY]).toBe(error)
    expect(readSaveRowDeferredError(value)).toBe(error)
  })

  it("returns undefined for values without marker", () => {
    expect(readSaveRowDeferredError({ id: "row-1" })).toBeUndefined()
    expect(readSaveRowDeferredError(null)).toBeUndefined()
  })
})
