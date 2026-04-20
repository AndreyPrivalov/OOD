import { describe, expect, it } from "vitest"
import { buildEditState, isSameEditState } from "./edit-state"
import type { EditableWorkItemRow } from "./types"
import { buildOptimisticRatingPatch } from "./use-work-item-editing"

function createRow(
  overrides: Partial<EditableWorkItemRow> = {},
): EditableWorkItemRow {
  return {
    id: "row-1",
    title: "Title",
    object: null,
    possiblyRemovable: false,
    overcomplication: 2,
    importance: 3,
    blocksMoney: null,
    currentProblems: ["alpha", "beta"],
    solutionVariants: ["one"],
    children: [],
    ...overrides,
  }
}

describe("buildEditState", () => {
  it("maps row values into editable state", () => {
    const row = createRow()
    const edit = buildEditState(row)

    expect(edit).toMatchObject({
      title: "Title",
      object: "",
      possiblyRemovable: false,
      overcomplication: "2",
      importance: "3",
      blocksMoney: "",
      currentProblems: "alpha\nbeta",
      solutionVariants: "one",
    })
  })
})

describe("isSameEditState", () => {
  it("returns true for equal edit values", () => {
    const left = buildEditState(createRow())
    const right = buildEditState(createRow())
    expect(isSameEditState(left, right)).toBe(true)
  })

  it("returns false when any field changes", () => {
    const left = buildEditState(createRow())
    const right = { ...left, importance: "5" }
    expect(isSameEditState(left, right)).toBe(false)
  })
})

describe("buildOptimisticRatingPatch", () => {
  it("builds immediate leaf rating patch for changed scores", () => {
    const patch = buildOptimisticRatingPatch(
      {
        id: "leaf",
        title: "Leaf",
        object: null,
        possiblyRemovable: false,
        overcomplication: 2,
        importance: 3,
        blocksMoney: null,
        currentProblems: [],
        solutionVariants: [],
        children: [],
      },
      { overcomplication: "5" },
    )

    expect(patch).toEqual({ overcomplication: 5 })
  })

  it("skips optimistic patching for parent rows", () => {
    const patch = buildOptimisticRatingPatch(
      {
        id: "parent",
        title: "Parent",
        object: null,
        possiblyRemovable: false,
        overcomplication: null,
        importance: null,
        blocksMoney: null,
        currentProblems: [],
        solutionVariants: [],
        children: [{ id: "child" }],
      },
      { overcomplication: "5" },
    )

    expect(patch).toBeNull()
  })
})
