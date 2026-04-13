import { describe, expect, it } from "vitest";
import { DomainError, DomainErrorCode } from "./errors";
import { assertNoCycle, buildTree, withScoreSums } from "./tree";
import type { WorkItem } from "./types";

const baseItem = (partial: Partial<WorkItem>): WorkItem => ({
  id: partial.id ?? "id",
  workspaceId: "default-workspace",
  title: "title",
  object: null,
  possiblyRemovable: false,
  parentId: partial.parentId ?? null,
  siblingOrder: partial.siblingOrder ?? 0,
  overcomplication: null,
  importance: null,
  blocksMoney: null,
  currentProblems: [],
  solutionVariants: []
});

describe("tree", () => {
  it("builds ordered hierarchy", () => {
    const items: WorkItem[] = [
      baseItem({ id: "root", parentId: null, siblingOrder: 0 }),
      baseItem({ id: "child-2", parentId: "root", siblingOrder: 1 }),
      baseItem({ id: "child-1", parentId: "root", siblingOrder: 0 })
    ];

    const tree = buildTree(items);
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((child) => child.id)).toEqual([
      "child-1",
      "child-2"
    ]);
  });

  it("throws when parent is missing", () => {
    const items: WorkItem[] = [baseItem({ id: "orphan", parentId: "missing" })];
    try {
      buildTree(items);
      throw new Error("Expected tree build to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(DomainErrorCode.PARENT_NOT_FOUND);
    }
  });

  it("detects move into own subtree", () => {
    const descendants = new Map<string, Set<string>>([
      ["a", new Set(["b", "c"])]
    ]);
    try {
      assertNoCycle("a", "c", descendants);
      throw new Error("Expected cycle check to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(DomainErrorCode.CYCLE_DETECTED);
    }
  });

  it("returns leaf own scores and parent sums across leaf descendants", () => {
    const items: WorkItem[] = [
      baseItem({
        id: "root",
        overcomplication: 5,
        importance: 5,
        blocksMoney: 5
      }),
      baseItem({
        id: "parent",
        parentId: "root",
        overcomplication: 4,
        importance: 4,
        blocksMoney: 4
      }),
      baseItem({
        id: "leaf-a",
        parentId: "parent",
        overcomplication: 2,
        importance: 3,
        blocksMoney: 1
      }),
      baseItem({
        id: "leaf-b",
        parentId: "parent",
        overcomplication: null,
        importance: 4,
        blocksMoney: null
      })
    ];

    const tree = withScoreSums(buildTree(items));
    const root = tree[0];
    const parent = root.children[0];
    const leafA = parent.children.find((item) => item.id === "leaf-a");
    const leafB = parent.children.find((item) => item.id === "leaf-b");

    expect(leafA?.overcomplicationSum).toBe(2);
    expect(leafA?.importanceSum).toBe(3);
    expect(leafA?.blocksMoneySum).toBe(1);

    expect(leafB?.overcomplicationSum).toBe(0);
    expect(leafB?.importanceSum).toBe(4);
    expect(leafB?.blocksMoneySum).toBe(0);

    expect(parent.overcomplicationSum).toBe(2);
    expect(parent.importanceSum).toBe(7);
    expect(parent.blocksMoneySum).toBe(1);

    expect(root.overcomplicationSum).toBe(2);
    expect(root.importanceSum).toBe(7);
    expect(root.blocksMoneySum).toBe(1);
  });
});
