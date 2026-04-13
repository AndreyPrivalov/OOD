import { describe, expect, it } from "vitest";
import {
  buildInsertLanes,
  isSameDropIntent,
  withLaneAnchors,
  type FlatRowLike
} from "./workspace-interactions";

function createSiblingBuckets(rows: FlatRowLike[]): Map<string | null, FlatRowLike[]> {
  const buckets = new Map<string | null, FlatRowLike[]>();
  for (const row of rows) {
    const current = buckets.get(row.parentId) ?? [];
    current.push(row);
    buckets.set(row.parentId, current);
  }
  for (const list of buckets.values()) {
    list.sort((left, right) => left.siblingOrder - right.siblingOrder);
  }
  return buckets;
}

describe("buildInsertLanes", () => {
  it("returns one root lane for empty table", () => {
    const lanes = buildInsertLanes([], new Map());
    expect(lanes).toHaveLength(1);
    expect(lanes[0]).toMatchObject({
      id: "lane:empty-root",
      parentId: null,
      targetIndex: 0,
      anchorPlacement: "empty"
    });
  });

  it("computes parent and index for root and nested lanes", () => {
    const rows: FlatRowLike[] = [
      { id: "root-a", parentId: null, siblingOrder: 0 },
      { id: "child-a1", parentId: "root-a", siblingOrder: 0 },
      { id: "root-b", parentId: null, siblingOrder: 1 }
    ];
    const siblings = createSiblingBuckets(rows);

    const lanes = buildInsertLanes(rows, siblings);

    expect(lanes.map((lane) => lane.id)).toEqual([
      "lane:before:root-a",
      "lane:before:child-a1",
      "lane:before:root-b",
      "lane:after:root-b"
    ]);

    expect(lanes[0]).toMatchObject({ parentId: null, targetIndex: 0 });
    expect(lanes[1]).toMatchObject({ parentId: "root-a", targetIndex: 0 });
    expect(lanes[2]).toMatchObject({ parentId: null, targetIndex: 1 });
    expect(lanes[3]).toMatchObject({ parentId: null, targetIndex: 2 });
  });

  it("uses sibling ordering source of truth for target indexes", () => {
    const rows: FlatRowLike[] = [
      { id: "r1", parentId: null, siblingOrder: 1 },
      { id: "r2", parentId: null, siblingOrder: 0 }
    ];
    const siblings = createSiblingBuckets(rows);

    const lanes = buildInsertLanes(rows, siblings);

    expect(lanes[0]).toMatchObject({ id: "lane:before:r1", targetIndex: 1 });
    expect(lanes[1]).toMatchObject({ id: "lane:before:r2", targetIndex: 0 });
  });
});

describe("withLaneAnchors", () => {
  it("assigns anchorY for before/after/empty lanes", () => {
    const rows: FlatRowLike[] = [
      { id: "a", parentId: null, siblingOrder: 0 },
      { id: "b", parentId: null, siblingOrder: 1 }
    ];
    const lanes = buildInsertLanes(rows, createSiblingBuckets(rows));
    const anchored = withLaneAnchors(
      lanes,
      {
        a: { top: 10, bottom: 30 },
        b: { top: 30, bottom: 50 }
      },
      8
    );

    expect(anchored[0].anchorY).toBe(10);
    expect(anchored[1].anchorY).toBe(30);
    expect(anchored[2].anchorY).toBe(50);

    const emptyAnchored = withLaneAnchors(
      [{ id: "lane:empty-root", parentId: null, targetIndex: 0, anchorRowId: null, anchorPlacement: "empty", anchorY: null }],
      {},
      14
    );
    expect(emptyAnchored[0].anchorY).toBe(14);
  });
});

describe("isSameDropIntent", () => {
  it("compares between intents by all fields", () => {
    expect(
      isSameDropIntent(
        { type: "between", rowId: "a", position: "before", parentId: null, targetIndex: 0 },
        { type: "between", rowId: "a", position: "before", parentId: null, targetIndex: 0 }
      )
    ).toBe(true);

    expect(
      isSameDropIntent(
        { type: "between", rowId: "a", position: "before", parentId: null, targetIndex: 0 },
        { type: "between", rowId: "a", position: "after", parentId: null, targetIndex: 0 }
      )
    ).toBe(false);
  });
});
