import { describe, expect, it } from "vitest"
import { buildNextRowSnapshot } from "./use-work-item-editing"

describe("buildNextRowSnapshot", () => {
  it("uses persisted id when draft is created on server", () => {
    const currentRow = {
      id: "local-draft:1",
      workspaceId: "ws-1",
      title: "Draft",
      object: null,
      possiblyRemovable: false,
      parentId: null,
      siblingOrder: 0,
      overcomplication: null,
      importance: null,
      metricValues: {},
      metricAggregates: {},
      currentProblems: [],
      solutionVariants: [],
      children: [],
    }

    const result = buildNextRowSnapshot(
      currentRow,
      { id: "server-1", title: "Persisted" },
      "server-1",
    )

    expect(result.id).toBe("server-1")
    expect(result.title).toBe("Persisted")
  })

  it("keeps base row values when server result is null", () => {
    const currentRow = {
      id: "row-1",
      workspaceId: "ws-1",
      title: "Row",
      object: null,
      possiblyRemovable: false,
      parentId: null,
      siblingOrder: 0,
      overcomplication: null,
      importance: null,
      metricValues: {},
      metricAggregates: {},
      currentProblems: [],
      solutionVariants: [],
      children: [],
    }

    const result = buildNextRowSnapshot(currentRow, null, "row-1")

    expect(result).toEqual(currentRow)
  })
})
