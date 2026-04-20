import { describe, expect, it } from "vitest"
import { buildPatchPayload } from "./save-payload"
import type { EditState, EditableWorkItemRow } from "./types"

function createRow(
  overrides: Partial<EditableWorkItemRow> = {},
): EditableWorkItemRow {
  return {
    id: "row-1",
    title: "Base title",
    object: "Object A",
    possiblyRemovable: false,
    overcomplication: 2,
    importance: 3,
    blocksMoney: 1,
    metricValues: {},
    metricAggregates: {},
    currentProblems: ["p1"],
    solutionVariants: ["s1"],
    children: [],
    ...overrides,
  }
}

function createEdit(overrides: Partial<EditState> = {}): EditState {
  return {
    title: "Base title",
    object: "Object A",
    possiblyRemovable: false,
    overcomplication: "2",
    importance: "3",
    blocksMoney: "1",
    metricValues: {},
    currentProblems: "p1",
    solutionVariants: "s1",
    ...overrides,
  }
}

describe("buildPatchPayload", () => {
  it("builds payload for scalar, list, and rating fields on leaf rows", () => {
    const payload = buildPatchPayload(
      createRow(),
      createEdit({
        title: "Next",
        object: " ",
        possiblyRemovable: true,
        overcomplication: "5",
        importance: "",
        currentProblems: "a\n\n b ",
        solutionVariants: "x\ny",
      }),
    )

    expect(payload).toEqual({
      title: "Next",
      object: null,
      possiblyRemovable: true,
      overcomplication: 5,
      importance: null,
      currentProblems: ["a", "b"],
      solutionVariants: ["x", "y"],
    })
  })

  it("skips rating updates for parent rows", () => {
    const payload = buildPatchPayload(
      createRow({
        children: [{ id: "child-1" }],
      }),
      createEdit({
        overcomplication: "5",
        importance: "4",
        blocksMoney: "",
        metricValues: { "m-1": "direct" },
      }),
    )

    expect(payload).toEqual({})
  })

  it("builds metricValues patch for changed dropdown values on leaf rows", () => {
    const payload = buildPatchPayload(
      createRow({
        metricValues: { "m-1": "indirect" },
      }),
      createEdit({
        metricValues: { "m-1": "direct", "m-2": "none" },
      }),
    )

    expect(payload).toEqual({
      metricValues: {
        "m-1": "direct",
      },
    })
  })
})
