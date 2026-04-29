import { describe, expect, it } from "vitest"
import { LocalFirstRowQueue } from "./save-queue"
import type { EditState } from "./types"
import {
  applyServerAckPatch,
  buildNextRowSnapshot,
  cleanupDetachedRowState,
  resolveLogicalRowId,
} from "./use-work-item-editing"

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

describe("applyServerAckPatch", () => {
  it("applies server patch to persisted id after draft id remap", () => {
    const calls: Array<{ rowId: string; patch: Record<string, unknown> }> = []

    applyServerAckPatch({
      ackShouldApply: true,
      activeRowId: "local-draft:1",
      nextRowId: "server-1",
      patchRow: (rowId, patch) => {
        calls.push({ rowId, patch })
      },
      payload: { title: "Persisted" },
      updated: { id: "server-1", title: "Persisted" },
    })

    expect(calls).toEqual([
      { rowId: "local-draft:1", patch: { id: "server-1" } },
      { rowId: "server-1", patch: { id: "server-1", title: "Persisted" } },
    ])
  })
})

describe("resolveLogicalRowId", () => {
  it("keeps one logical lineage for draft and persisted row ids", () => {
    const map = new Map<string, string>([
      ["local-draft:1", "server-1"],
      ["server-1", "server-1"],
    ])

    expect(resolveLogicalRowId(map, "local-draft:1")).toBe("server-1")
    expect(resolveLogicalRowId(map, "server-1")).toBe("server-1")
  })
})

describe("cleanupDetachedRowState", () => {
  it("does not remove persisted lineage state when stale draft edit key is cleaned", () => {
    const rowMeta = new Map([
      [
        "server-1",
        { isDirty: true, isFocused: false, hasUnackedChanges: true },
      ],
    ])
    const rowQueues = new Map<string, LocalFirstRowQueue<EditState>>([
      ["server-1", new LocalFirstRowQueue<EditState>()],
    ])
    const logicalRowIds = new Map<string, string>([
      ["local-draft:1", "server-1"],
      ["server-1", "server-1"],
    ])

    cleanupDetachedRowState("local-draft:1", rowMeta, rowQueues, logicalRowIds)

    expect(rowMeta.has("server-1")).toBe(true)
    expect(rowQueues.has("server-1")).toBe(true)
    expect(logicalRowIds.has("local-draft:1")).toBe(false)
  })
})
