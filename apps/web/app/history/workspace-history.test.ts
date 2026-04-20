import { describe, expect, it } from "vitest"
import type { WorkTreeNode } from "../state/workspace-tree-state"
import {
  areTreesEquivalent,
  clearWorkspaceHistory,
  cloneTree,
  findBranch,
  getRowPlacement,
  isUndoRedoShortcut,
  loadWorkspaceHistory,
  makeEmptyHistory,
  recordHistoryEntry,
  remapHistoryIds,
  restoreBranchIntoTree,
  saveWorkspaceHistory,
} from "./workspace-history"

function makeNode(
  id: string,
  parentId: string | null,
  siblingOrder: number,
  children: WorkTreeNode[] = [],
): WorkTreeNode {
  return {
    id,
    workspaceId: "ws",
    title: id,
    object: null,
    possiblyRemovable: false,
    parentId,
    siblingOrder,
    overcomplication: null,
    importance: null,
    blocksMoney: null,
    currentProblems: [],
    solutionVariants: [],
    children,
  }
}

describe("workspace-history", () => {
  it("records one step and clears future from middle of history", () => {
    const initial = [makeNode("root", null, 0)]
    const empty = makeEmptyHistory(initial)
    const first = recordHistoryEntry(
      empty,
      {
        type: "patch",
        before: makeNode("root", null, 0),
        after: { ...makeNode("root", null, 0), title: "updated" },
      },
      [{ ...makeNode("root", null, 0), title: "updated" }],
    )

    const second = {
      ...first,
      future: [
        {
          type: "move" as const,
          rowId: "root",
          fromParentId: null,
          fromIndex: 0,
          toParentId: null,
          toIndex: 1,
        },
      ],
    }

    const third = recordHistoryEntry(
      second,
      {
        type: "move",
        rowId: "root",
        fromParentId: null,
        fromIndex: 0,
        toParentId: null,
        toIndex: 0,
      },
      cloneTree(initial),
    )

    expect(third.past).toHaveLength(2)
    expect(third.future).toEqual([])
  })

  it("serializes and deserializes history in sessionStorage", () => {
    const storage = new Map<string, string>()
    Object.assign(globalThis, {
      window: {
        sessionStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value)
          },
          removeItem: (key: string) => {
            storage.delete(key)
          },
        },
      },
    })

    const history = makeEmptyHistory([makeNode("root", null, 0)])

    saveWorkspaceHistory("ws", history)
    const loaded = loadWorkspaceHistory("ws")

    expect(loaded).toEqual(history)

    clearWorkspaceHistory("ws")
    expect(loadWorkspaceHistory("ws")).toBeNull()
  })

  it("remaps history ids after restore idMap", () => {
    const state = {
      version: 1,
      past: [
        {
          type: "deleteBranch" as const,
          targetParentId: null,
          targetIndex: 0,
          branch: makeNode("old-root", null, 0, [
            makeNode("old-leaf", "old-root", 0),
          ]),
        },
      ],
      present: [makeNode("old-root", null, 0)],
      future: [],
    }

    const remapped = remapHistoryIds(state, {
      "old-root": "new-root",
      "old-leaf": "new-leaf",
    })

    const entry = remapped.past[0]
    expect(entry.type).toBe("deleteBranch")
    if (entry.type === "deleteBranch") {
      expect(entry.branch.id).toBe("new-root")
      expect(entry.branch.children[0]?.id).toBe("new-leaf")
    }
  })

  it("restores branch into requested target slot", () => {
    const tree = [makeNode("a", null, 0), makeNode("b", null, 1)]
    const restored = restoreBranchIntoTree(
      tree,
      makeNode("x", null, 0),
      null,
      1,
    )

    expect(restored.map((node) => node.id)).toEqual(["a", "x", "b"])
    expect(getRowPlacement(restored, "x")).toEqual({ parentId: null, index: 1 })
  })

  it("compares persisted present with fetched tree", () => {
    const left = [makeNode("root", null, 0, [makeNode("leaf", "root", 0)])]
    const right = [makeNode("root", null, 0, [makeNode("leaf", "root", 0)])]

    expect(areTreesEquivalent(left, right)).toBe(true)
    right[0].children[0].title = "changed"
    expect(areTreesEquivalent(left, right)).toBe(false)
  })

  it("detects undo and redo shortcuts", () => {
    const undo = {
      key: "z",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    } as KeyboardEvent
    const redo = {
      key: "z",
      metaKey: false,
      ctrlKey: true,
      altKey: false,
      shiftKey: true,
    } as KeyboardEvent
    const nope = {
      key: "x",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    } as KeyboardEvent

    expect(isUndoRedoShortcut(undo)).toBe("undo")
    expect(isUndoRedoShortcut(redo)).toBe("redo")
    expect(isUndoRedoShortcut(nope)).toBeNull()
  })

  it("finds a branch snapshot by row id", () => {
    const tree = [makeNode("root", null, 0, [makeNode("leaf", "root", 0)])]
    const branch = findBranch(tree, "root")

    expect(branch?.children[0]?.id).toBe("leaf")
  })
})
