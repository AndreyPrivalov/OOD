import { describe, expect, it, vi } from "vitest"
import type { FlatRow } from "../state/workspace-tree-state"
import { commitWorkspaceDrop } from "./use-workspace-drag-drop"

describe("commitWorkspaceDrop", () => {
  it("prepends a nested move under the target parent", async () => {
    const moveRow = vi.fn().mockResolvedValue(undefined)
    const rowsById = new Map<string, FlatRow>([
      [
        "parent",
        {
          id: "parent",
          workspaceId: "ws",
          title: "parent",
          object: null,
          possiblyRemovable: false,
          parentId: null,
          siblingOrder: 0,
          overcomplication: null,
          importance: null,
          currentProblems: [],
          solutionVariants: [],
          children: [{ id: "existing-child" } as FlatRow],
          depth: 0,
        } as FlatRow,
      ],
    ])

    await commitWorkspaceDrop({
      activeId: "moving",
      intent: { type: "nest", targetId: "parent" },
      moveRow,
      rowsById,
    })

    expect(moveRow).toHaveBeenCalledWith("moving", "parent", 0)
  })
})
