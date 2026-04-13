export type FlatRowLike = {
  id: string;
  parentId: string | null;
  siblingOrder: number;
};

export type DropIntent =
  | {
      type: "nest";
      targetId: string;
    }
  | {
      type: "between";
      rowId: string;
      position: "before" | "after";
      parentId: string | null;
      targetIndex: number;
    }
  | {
      type: "root-start";
      targetIndex: number;
    };

export type InteractionMode = "idle" | "dragging";

export type InsertLane = {
  id: string;
  parentId: string | null;
  targetIndex: number;
  anchorRowId: string | null;
  anchorPlacement: "before" | "after-last" | "empty";
  anchorY: number | null;
};

export type OverlayIndicator = {
  kind: "add" | "drop";
  laneId: string;
  y: number;
  parentId: string | null;
  targetIndex: number;
  showPlus: boolean;
};

export type RowAnchor = {
  top: number;
  bottom: number;
};

export function buildInsertLanes(
  rows: FlatRowLike[],
  siblingsByParent: Map<string | null, FlatRowLike[]>
): InsertLane[] {
  if (rows.length === 0) {
    return [
      {
        id: "lane:empty-root",
        parentId: null,
        targetIndex: 0,
        anchorRowId: null,
        anchorPlacement: "empty",
        anchorY: null
      }
    ];
  }

  const lanes: InsertLane[] = [];
  for (const row of rows) {
    const siblings = siblingsByParent.get(row.parentId) ?? [];
    const siblingIndex = siblings.findIndex((candidate) => candidate.id === row.id);
    lanes.push({
      id: `lane:before:${row.id}`,
      parentId: row.parentId,
      targetIndex: siblingIndex < 0 ? 0 : siblingIndex,
      anchorRowId: row.id,
      anchorPlacement: "before",
      anchorY: null
    });
  }

  const lastRow = rows[rows.length - 1];
  const lastSiblings = siblingsByParent.get(lastRow.parentId) ?? [];
  lanes.push({
    id: `lane:after:${lastRow.id}`,
    parentId: lastRow.parentId,
    targetIndex: lastSiblings.length,
    anchorRowId: lastRow.id,
    anchorPlacement: "after-last",
    anchorY: null
  });
  return lanes;
}

export function withLaneAnchors(
  lanes: InsertLane[],
  rowAnchors: Record<string, RowAnchor>,
  headerBottom: number
): InsertLane[] {
  return lanes.map((lane) => {
    if (lane.anchorPlacement === "empty") {
      return { ...lane, anchorY: headerBottom };
    }

    if (!lane.anchorRowId) {
      return lane;
    }

    const anchor = rowAnchors[lane.anchorRowId];
    if (!anchor) {
      return lane;
    }

    return {
      ...lane,
      anchorY: lane.anchorPlacement === "before" ? anchor.top : anchor.bottom
    };
  });
}

export function isSameDropIntent(left: DropIntent | null, right: DropIntent | null): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  if (left.type !== right.type) return false;
  if (left.type === "nest" && right.type === "nest") {
    return left.targetId === right.targetId;
  }
  if (left.type === "between" && right.type === "between") {
    return (
      left.rowId === right.rowId &&
      left.position === right.position &&
      left.parentId === right.parentId &&
      left.targetIndex === right.targetIndex
    );
  }
  if (left.type === "root-start" && right.type === "root-start") {
    return left.targetIndex === right.targetIndex;
  }
  return false;
}

export function buildBetweenIntent(
  row: FlatRowLike,
  position: "before" | "after",
  movingId: string,
  siblingsByParent: Map<string | null, FlatRowLike[]>
): DropIntent | null {
  const siblings = (siblingsByParent.get(row.parentId) ?? []).filter(
    (candidate) => candidate.id !== movingId
  );
  const currentIndex = siblings.findIndex((candidate) => candidate.id === row.id);
  if (currentIndex < 0) {
    return null;
  }
  const targetIndex = position === "before" ? currentIndex : currentIndex + 1;
  return {
    type: "between",
    rowId: row.id,
    position,
    parentId: row.parentId,
    targetIndex: Math.max(0, targetIndex)
  };
}

type ResolveDropIntentArgs = {
  clientX: number;
  clientY: number;
  movingId: string;
  rowsById: Map<string, FlatRowLike>;
  siblingsByParent: Map<string | null, FlatRowLike[]>;
  gutterWidth?: number;
};

export function resolveDropIntentAtPoint({
  clientX,
  clientY,
  movingId,
  rowsById,
  siblingsByParent,
  gutterWidth = 96
}: ResolveDropIntentArgs): DropIntent | null {
  if (typeof document === "undefined") {
    return null;
  }

  const target = document.elementFromPoint(clientX, clientY);
  if (!(target instanceof HTMLElement)) {
    return null;
  }

  const tableElement =
    target.closest("table[data-tree-table]") ??
    document.querySelector("table[data-tree-table]");
  if (tableElement instanceof HTMLTableElement) {
    const firstRootRow = (siblingsByParent.get(null) ?? [])[0] ?? null;
    if (firstRootRow) {
      const firstRootTr = tableElement.querySelector(`tr[data-row-id='${firstRootRow.id}']`);
      if (firstRootTr instanceof HTMLTableRowElement) {
        const firstRect = firstRootTr.getBoundingClientRect();
        if (clientY < firstRect.top) {
          return { type: "root-start", targetIndex: 0 };
        }
      }
    }
  }

  let rowElement = target.closest("tr[data-row-id]");
  if (!(rowElement instanceof HTMLTableRowElement) && tableElement instanceof HTMLTableElement) {
    const fallback = Array.from(tableElement.querySelectorAll("tr[data-row-id]")).find((row) => {
      if (!(row instanceof HTMLTableRowElement)) {
        return false;
      }
      const rect = row.getBoundingClientRect();
      return clientY >= rect.top && clientY <= rect.bottom;
    });
    rowElement = fallback instanceof HTMLTableRowElement ? fallback : null;
  }
  if (!(rowElement instanceof HTMLTableRowElement)) {
    return null;
  }

  const rowId = rowElement.dataset.rowId;
  if (!rowId || rowId === movingId) {
    return null;
  }

  const row = rowsById.get(rowId);
  if (!row) {
    return null;
  }

  const rect = rowElement.getBoundingClientRect();
  const relativeY = clientY - rect.top;
  const isGutterDrop = clientX <= rect.left + gutterWidth;
  if (isGutterDrop) {
    const position = relativeY < rect.height / 2 ? "before" : "after";
    return buildBetweenIntent(row, position, movingId, siblingsByParent);
  }

  const topThreshold = rect.height * 0.4;
  const bottomThreshold = rect.height * 0.6;

  if (relativeY < topThreshold) {
    return buildBetweenIntent(row, "before", movingId, siblingsByParent);
  }
  if (relativeY > bottomThreshold) {
    return buildBetweenIntent(row, "after", movingId, siblingsByParent);
  }

  return { type: "nest", targetId: row.id };
}
