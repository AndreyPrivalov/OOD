import { describe, expect, it } from "vitest"
import { LocalFirstRowQueue } from "../work-item-editing/save-queue"
import type { WorkTreeNode } from "./workspace-tree-state"
import { normalizeTreeData, patchTreeRow } from "./workspace-tree-state"

function createRatingTree(overcomplication: number): WorkTreeNode[] {
  return [
    {
      id: "root",
      workspaceId: "ws",
      title: "Root",
      object: null,
      possiblyRemovable: false,
      parentId: null,
      siblingOrder: 0,
      overcomplication: null,
      importance: null,
      metricValues: {},
      metricAggregates: { "metric-1": "indirect" },
      overcomplicationSum: overcomplication,
      importanceSum: 3,
      currentProblems: [],
      solutionVariants: [],
      children: [
        {
          id: "leaf",
          workspaceId: "ws",
          title: "Leaf",
          object: null,
          possiblyRemovable: true,
          parentId: "root",
          siblingOrder: 0,
          overcomplication,
          importance: 3,
          metricValues: { "metric-1": "direct" },
          metricAggregates: { "metric-1": "direct" },
          overcomplicationSum: overcomplication,
          importanceSum: 3,
          currentProblems: [],
          solutionVariants: [],
          children: [],
        },
      ],
    },
  ]
}

describe("normalizeTreeData", () => {
  it("accepts only canonical nested tree payload", () => {
    const payload = [
      {
        id: "root",
        workspaceId: "ws",
        title: "Root",
        object: null,
        possiblyRemovable: false,
        parentId: null,
        siblingOrder: 0,
        overcomplication: null,
        importance: null,
        metricValues: {},
        metricAggregates: { "metric-1": "direct" },
        overcomplicationSum: 0,
        importanceSum: 0,
        currentProblems: [],
        solutionVariants: [],
        children: [
          {
            id: "leaf",
            workspaceId: "ws",
            title: "Leaf",
            object: null,
            possiblyRemovable: true,
            parentId: "root",
            siblingOrder: 0,
            overcomplication: 2,
            importance: 3,
            metricValues: { "metric-1": "direct" },
            metricAggregates: { "metric-1": "direct" },
            overcomplicationSum: 2,
            importanceSum: 3,
            currentProblems: [],
            solutionVariants: [],
            children: [],
          },
        ],
      },
    ]

    expect(normalizeTreeData(payload)).toEqual(payload)
  })

  it("drops legacy flat payload", () => {
    const legacyPayload = [
      {
        id: "root",
        workspaceId: "ws",
        title: "Root",
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
      },
      {
        id: "leaf",
        workspaceId: "ws",
        title: "Leaf",
        object: null,
        possiblyRemovable: true,
        parentId: "root",
        siblingOrder: 0,
        overcomplication: 2,
        importance: 3,
        metricValues: { "metric-1": "direct" },
        metricAggregates: { "metric-1": "direct" },
        currentProblems: [],
        solutionVariants: [],
      },
    ]

    expect(normalizeTreeData(legacyPayload)).toEqual([])
  })
})

describe("patchTreeRow", () => {
  it("recomputes aggregate rating sums for ancestors after a leaf rating patch", () => {
    const tree: WorkTreeNode[] = [
      {
        id: "root",
        workspaceId: "ws",
        title: "Root",
        object: null,
        possiblyRemovable: false,
        parentId: null,
        siblingOrder: 0,
        overcomplication: null,
        importance: null,
        metricValues: {},
        metricAggregates: { "metric-1": "indirect" },
        overcomplicationSum: 2,
        importanceSum: 3,
        currentProblems: [],
        solutionVariants: [],
        children: [
          {
            id: "leaf",
            workspaceId: "ws",
            title: "Leaf",
            object: null,
            possiblyRemovable: true,
            parentId: "root",
            siblingOrder: 0,
            overcomplication: 2,
            importance: 3,
            metricValues: { "metric-1": "direct" },
            metricAggregates: { "metric-1": "direct" },
            overcomplicationSum: 2,
            importanceSum: 3,
            currentProblems: [],
            solutionVariants: [],
            children: [],
          },
        ],
      },
    ]

    const patchedTree = patchTreeRow(tree, "leaf", {
      overcomplication: 5,
    })

    expect(patchedTree[0]?.children[0]?.overcomplication).toBe(5)
    expect(patchedTree[0]?.children[0]?.overcomplicationSum).toBe(5)
    expect(patchedTree[0]?.overcomplicationSum).toBe(5)
    expect(patchedTree[0]?.importanceSum).toBe(3)
  })

  it("recomputes metric aggregates along the ancestor chain after a leaf metric patch", () => {
    const tree: WorkTreeNode[] = [
      {
        id: "root",
        workspaceId: "ws",
        title: "Root",
        object: null,
        possiblyRemovable: false,
        parentId: null,
        siblingOrder: 0,
        overcomplication: null,
        importance: null,
        metricValues: {},
        metricAggregates: { "metric-1": "none", "metric-2": "none" },
        overcomplicationSum: 0,
        importanceSum: 0,
        currentProblems: [],
        solutionVariants: [],
        children: [
          {
            id: "mid",
            workspaceId: "ws",
            title: "Mid",
            object: null,
            possiblyRemovable: true,
            parentId: "root",
            siblingOrder: 0,
            overcomplication: null,
            importance: null,
            metricValues: {},
            metricAggregates: {
              "metric-1": "indirect",
              "metric-2": "none",
            },
            overcomplicationSum: 0,
            importanceSum: 0,
            currentProblems: [],
            solutionVariants: [],
            children: [
              {
                id: "leaf",
                workspaceId: "ws",
                title: "Leaf",
                object: null,
                possiblyRemovable: true,
                parentId: "mid",
                siblingOrder: 0,
                overcomplication: null,
                importance: null,
                metricValues: { "metric-1": "none", "metric-2": "indirect" },
                metricAggregates: {
                  "metric-1": "none",
                  "metric-2": "indirect",
                },
                overcomplicationSum: 0,
                importanceSum: 0,
                currentProblems: [],
                solutionVariants: [],
                children: [],
              },
            ],
          },
        ],
      },
    ]

    const patchedTree = patchTreeRow(tree, "leaf", {
      metricValues: { "metric-1": "direct", "metric-2": "none" },
    })

    expect(
      patchedTree[0]?.children[0]?.children[0]?.metricValues?.["metric-1"],
    ).toBe("direct")
    expect(patchedTree[0]?.children[0]?.metricAggregates?.["metric-1"]).toBe(
      "direct",
    )
    expect(patchedTree[0]?.metricAggregates?.["metric-1"]).toBe("direct")
    expect(patchedTree[0]?.metricAggregates?.["metric-2"]).toBe("none")
  })

  it("keeps parent sums stable after confirmed save when optimistic patch already applied", () => {
    const optimisticTree = patchTreeRow(createRatingTree(2), "leaf", {
      overcomplication: 5,
    })
    const confirmedTree = patchTreeRow(optimisticTree, "leaf", {
      overcomplication: 5,
    })

    expect(optimisticTree[0]?.overcomplicationSum).toBe(5)
    expect(confirmedTree[0]?.overcomplicationSum).toBe(5)
  })

  it("does not partially rollback parent sums on stale queued response", () => {
    const queue = new LocalFirstRowQueue<string>()
    queue.enqueue("first")
    queue.startNext()
    queue.enqueue("second")

    const afterFirstOptimistic = patchTreeRow(createRatingTree(2), "leaf", {
      overcomplication: 3,
    })
    let tree = patchTreeRow(afterFirstOptimistic, "leaf", {
      overcomplication: 5,
    })

    const staleAck = queue.acknowledge(1)
    if (staleAck.shouldApply) {
      tree = patchTreeRow(tree, "leaf", { overcomplication: 3 })
    }

    expect(staleAck.shouldApply).toBe(false)
    expect(tree[0]?.overcomplicationSum).toBe(5)
  })

  it("rolls back parent sums after failed save when there is no newer queued request", () => {
    const optimisticTree = patchTreeRow(createRatingTree(2), "leaf", {
      overcomplication: 5,
    })
    const rolledBackTree = patchTreeRow(optimisticTree, "leaf", {
      overcomplication: 2,
    })

    expect(optimisticTree[0]?.overcomplicationSum).toBe(5)
    expect(rolledBackTree[0]?.overcomplicationSum).toBe(2)
  })
})
