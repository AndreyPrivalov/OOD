import { describe, expect, it } from "vitest"
import {
  applyBeforeUnloadProtection,
  readActiveFieldSnapshot,
} from "./page-exit-save"

describe("readActiveFieldSnapshot", () => {
  it("reads row id, field and value from active text input", () => {
    const snapshot = readActiveFieldSnapshot({
      value: "Новое название",
      dataset: { rowField: "title" },
      closest: (selector) =>
        selector === "tr[data-row-id]"
          ? {
              getAttribute: (name) => (name === "data-row-id" ? "row-1" : null),
            }
          : null,
    })

    expect(snapshot).toEqual({
      rowId: "row-1",
      field: "title",
      value: "Новое название",
    })
  })

  it("returns null when field marker is missing", () => {
    expect(
      readActiveFieldSnapshot({
        value: "Новое название",
        dataset: {},
        closest: () => ({ getAttribute: () => "row-1" }),
      }),
    ).toBeNull()
  })
})

describe("applyBeforeUnloadProtection", () => {
  it("blocks unload when there are unsaved changes", () => {
    let prevented = false
    const event = {
      returnValue: "keep",
      preventDefault: () => {
        prevented = true
      },
    }

    const blocked = applyBeforeUnloadProtection(event, true)

    expect(blocked).toBe(true)
    expect(prevented).toBe(true)
    expect(event.returnValue).toBe("")
  })

  it("does not block unload when there are no unsaved changes", () => {
    let prevented = false
    const event = {
      returnValue: "keep",
      preventDefault: () => {
        prevented = true
      },
    }

    const blocked = applyBeforeUnloadProtection(event, false)

    expect(blocked).toBe(false)
    expect(prevented).toBe(false)
    expect(event.returnValue).toBe("keep")
  })
})
