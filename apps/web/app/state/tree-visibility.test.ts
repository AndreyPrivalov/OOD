import { describe, expect, it } from "vitest"
import {
  areSetsEqual,
  filterVisibleRows,
  pruneCollapsedRowIds,
} from "./tree-visibility"

type Row = {
  id: string
  depth: number
  children: Row[]
}

const row = (id: string, depth: number, children: Row[] = []): Row => ({
  id,
  depth,
  children,
})

describe("tree-visibility", () => {
  it("hides descendants for collapsed rows", () => {
    const rows = [
      row("a", 0, [row("a1", 1)]),
      row("a1", 1),
      row("a2", 1),
      row("b", 0),
    ]

    const visible = filterVisibleRows(rows, new Set(["a"]))

    expect(visible.map((entry) => entry.id)).toEqual(["a", "b"])
  })

  it("preserves deeper collapsed state when ancestor is expanded again", () => {
    const rows = [
      row("a", 0, [row("a1", 1)]),
      row("a1", 1, [row("a1-1", 2)]),
      row("a1-1", 2),
      row("b", 0),
    ]

    const visible = filterVisibleRows(rows, new Set(["a1"]))

    expect(visible.map((entry) => entry.id)).toEqual(["a", "a1", "b"])
  })

  it("prunes collapsed ids that are no longer collapsible", () => {
    const rows = [row("a", 0), row("b", 0, [row("b1", 1)])]

    const next = pruneCollapsedRowIds(rows, new Set(["a", "b", "ghost"]))

    expect([...next]).toEqual(["b"])
  })

  it("compares sets by value", () => {
    expect(areSetsEqual(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true)
    expect(areSetsEqual(new Set(["a"]), new Set(["a", "b"]))).toBe(false)
  })
})
