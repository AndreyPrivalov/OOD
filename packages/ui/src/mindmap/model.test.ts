import { describe, expect, it } from "vitest"
import { buildMindmapNodeClassName } from "./model"

describe("buildMindmapNodeClassName", () => {
  it("adds both active and editing modifiers when both states are present", () => {
    const className = buildMindmapNodeClassName({
      nodeId: "row-1",
      activeNodeIds: new Set(["row-1"]),
      editingNodeIds: new Set(["row-1", "row-2"]),
    })

    expect(className).toBe("workspace-mindmap-node is-active is-editing")
  })

  it("returns base class without modifiers when node has no highlight state", () => {
    const className = buildMindmapNodeClassName({
      nodeId: "row-3",
      activeNodeIds: new Set(["row-1"]),
      editingNodeIds: new Set(["row-2"]),
    })

    expect(className).toBe("workspace-mindmap-node")
  })
})
