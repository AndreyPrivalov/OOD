"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode
} from "react";
import {
  buildInsertLanes,
  isSameDropIntent,
  resolveDropIntentAtPoint,
  withLaneAnchors,
  type DropIntent,
  type FlatRowLike,
  type InsertLane,
  type InteractionMode,
  type OverlayIndicator,
  type RowAnchor
} from "./workspace-interactions";
import {
  LocalFirstRowQueue,
  resolveAutosaveDelayMs,
  type RevisionedValue,
  type RowEditPatch
} from "./local-first-autosave";

type WorkTreeNode = {
  id: string;
  workspaceId: string;
  title: string;
  object: string | null;
  possiblyRemovable: boolean;
  parentId: string | null;
  siblingOrder: number;
  overcomplication: number | null;
  importance: number | null;
  blocksMoney: number | null;
  currentProblems: string[];
  solutionVariants: string[];
  overcomplicationSum?: number;
  importanceSum?: number;
  blocksMoneySum?: number;
  overcomplication_sum?: number;
  importance_sum?: number;
  blocks_money_sum?: number;
  aggregates?: {
    overcomplicationSum?: number;
    importanceSum?: number;
    blocksMoneySum?: number;
    overcomplication_sum?: number;
    importance_sum?: number;
    blocks_money_sum?: number;
  };
  children: WorkTreeNode[];
};

type FlatRow = WorkTreeNode & { depth: number };

type EditState = {
  title: string;
  object: string;
  possiblyRemovable: boolean;
  overcomplication: string;
  importance: string;
  blocksMoney: string;
  currentProblems: string;
  solutionVariants: string;
};

type RowEditMeta = {
  isDirty: boolean;
  isFocused: boolean;
  lastLocalRevision: number;
  lastAckRevision: number;
};

type DevPerfMetrics = {
  patchLatencies: number[];
  refreshCount: number;
  inputToPaintSamples: number[];
  overlayRecalcCount: number;
};

type PointerDragState = {
  activeId: string;
  pointerId: number;
  startX: number;
  startY: number;
  isDragging: boolean;
  intent: DropIntent | null;
};

type TableColumnWidths = {
  work: string;
  object: string;
  overcomplication: string;
  importance: string;
  blocksMoney: string;
  currentProblems: string;
  solutionVariants: string;
  removable: string;
};

const DEFAULT_WORKSPACE_ID = "default-workspace";
const DRAG_START_DISTANCE = 5;
const FRAME_X_PX = 24;
const LEFT_GUTTER_WIDTH_PX = 84;
const WORK_CONTENT_INDENT_PX = 14;
const CELL_INLINE_PAD_PX = 14;
const STRUCTURE_LINE_WIDTH_PX = 2;
const CONTENT_START_X_PX = CELL_INLINE_PAD_PX + WORK_CONTENT_INDENT_PX;
const TREE_LEVEL_OFFSET_PX = 24;
const DEV_METRICS_SAMPLE_LIMIT = 40;
const MAX_COLUMN_CHARS = 70;

type MemoRowProps = {
  rowId: string;
  parentId: string | null;
  depth: number;
  hasMultilineField: boolean;
  className: string;
  rowRenderSignature: string;
  editRenderSignature: string;
  registerRowElementRef: (rowId: string, node: HTMLTableRowElement | null) => void;
  children: ReactNode;
};

const MemoWorkRow = memo(
  function MemoWorkRow(props: MemoRowProps) {
    return (
      <tr
        ref={(node) => props.registerRowElementRef(props.rowId, node)}
        data-row-id={props.rowId}
        data-parent-id={props.parentId ?? "root"}
        data-depth={props.depth}
        data-multiline={props.hasMultilineField ? "true" : "false"}
        className={props.className}
      >
        {props.children}
      </tr>
    );
  },
  (prev, next) =>
    prev.rowId === next.rowId &&
    prev.parentId === next.parentId &&
    prev.depth === next.depth &&
    prev.hasMultilineField === next.hasMultilineField &&
    prev.className === next.className &&
    prev.rowRenderSignature === next.rowRenderSignature &&
    prev.editRenderSignature === next.editRenderSignature
);
const STABLE_TABLE_COLUMN_WIDTHS: TableColumnWidths = {
  work: "420px",
  object: "260px",
  overcomplication: "15ch",
  importance: "15ch",
  blocksMoney: "15ch",
  currentProblems: "34ch",
  solutionVariants: "34ch",
  removable: "15ch"
};

function clampColumnChars(value: number, min: number, max = MAX_COLUMN_CHARS) {
  return Math.max(min, Math.min(max, value));
}

function maxLineLengthWithSpaces(value: string): number {
  return value
    .split("\n")
    .reduce((max, line) => Math.max(max, line.length), 0);
}

const ERROR_TEXT_BY_CODE: Record<string, string> = {
  INVALID_PAYLOAD: "Некорректные данные в запросе.",
  INVALID_NUMERIC_RANGE: "Оценка должна быть целым числом от 0 до 5.",
  EMPTY_TITLE: "Заголовок не может быть пустым.",
  PARENT_NOT_FOUND: "Указанный родитель не найден.",
  CYCLE_DETECTED: "Нельзя переместить задачу внутрь собственной ветки.",
  INVALID_MOVE_TARGET: "Некорректная цель перемещения.",
  PARENT_RATINGS_READ_ONLY: "У родительской работы оценки только для чтения.",
  INTERNAL_ERROR: "Внутренняя ошибка сервера."
};

function flattenTree(nodes: WorkTreeNode[], depth = 0): FlatRow[] {
  const result: FlatRow[] = [];
  for (const node of nodes) {
    result.push({ ...node, depth });
    result.push(...flattenTree(node.children, depth + 1));
  }
  return result;
}

function buildTreeNumbering(nodes: WorkTreeNode[], prefix: number[] = []) {
  const map = new Map<string, string>();
  const sorted = [...nodes].sort((a, b) => a.siblingOrder - b.siblingOrder);
  sorted.forEach((node, index) => {
    const path = [...prefix, index + 1];
    map.set(node.id, path.join("."));
    const childMap = buildTreeNumbering(node.children, path);
    for (const [childId, value] of childMap.entries()) {
      map.set(childId, value);
    }
  });
  return map;
}

function listToMultiline(values: string[]) {
  return values.join("\n");
}

function multilineToList(value: string) {
  return value
    .split("\n")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function isSameStringList(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function toNullableNumber(value: string): number | null {
  if (value.trim().length === 0) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRating(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(5, Math.trunc(parsed)));
}

function ratingToneClass(value: number): string {
  if (value <= 0) {
    return "rating-tone-none";
  }
  if (value === 1) {
    return "rating-tone-low";
  }
  if (value <= 3) {
    return "rating-tone-mid";
  }
  return "rating-tone-high";
}

function buildEditState(row: FlatRow): EditState {
  return {
    title: row.title,
    object: row.object ?? "",
    possiblyRemovable: row.possiblyRemovable ?? false,
    overcomplication:
      row.overcomplication === null ? "" : String(row.overcomplication),
    importance: row.importance === null ? "" : String(row.importance),
    blocksMoney: row.blocksMoney === null ? "" : String(row.blocksMoney),
    currentProblems: listToMultiline(row.currentProblems),
    solutionVariants: listToMultiline(row.solutionVariants)
  };
}

function isSameEditState(left: EditState, right: EditState): boolean {
  return (
    left.title === right.title &&
    left.object === right.object &&
    left.possiblyRemovable === right.possiblyRemovable &&
    left.overcomplication === right.overcomplication &&
    left.importance === right.importance &&
    left.blocksMoney === right.blocksMoney &&
    left.currentProblems === right.currentProblems &&
    left.solutionVariants === right.solutionVariants
  );
}

function buildRowPatchFromServer(updated: Partial<WorkTreeNode>): Partial<WorkTreeNode> {
  const patch: Partial<WorkTreeNode> = {};
  if (typeof updated.title === "string") {
    patch.title = updated.title;
  }
  if (updated.object === null || typeof updated.object === "string") {
    patch.object = updated.object;
  }
  if (typeof updated.possiblyRemovable === "boolean") {
    patch.possiblyRemovable = updated.possiblyRemovable;
  }
  if (
    updated.overcomplication === null ||
    typeof updated.overcomplication === "number"
  ) {
    patch.overcomplication = updated.overcomplication;
  }
  if (updated.importance === null || typeof updated.importance === "number") {
    patch.importance = updated.importance;
  }
  if (updated.blocksMoney === null || typeof updated.blocksMoney === "number") {
    patch.blocksMoney = updated.blocksMoney;
  }
  if (Array.isArray(updated.currentProblems)) {
    patch.currentProblems = updated.currentProblems.filter(
      (item): item is string => typeof item === "string"
    );
  }
  if (Array.isArray(updated.solutionVariants)) {
    patch.solutionVariants = updated.solutionVariants.filter(
      (item): item is string => typeof item === "string"
    );
  }
  return patch;
}

function mapErrorText(payload: { error?: string; message?: string } | null | undefined) {
  if (payload?.error && ERROR_TEXT_BY_CODE[payload.error]) {
    return ERROR_TEXT_BY_CODE[payload.error];
  }
  if (payload?.message && ERROR_TEXT_BY_CODE[payload.message]) {
    return ERROR_TEXT_BY_CODE[payload.message];
  }
  if (payload?.message && payload.message.trim().length > 0) {
    return payload.message;
  }
  return "Не удалось выполнить действие. Повторите попытку.";
}

function autoGrowTextarea(target: HTMLTextAreaElement) {
  target.style.height = "auto";
  target.style.height = `${target.scrollHeight}px`;
}

function getMedian(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function isSamePrimitiveOrList(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }
    return left.every((item, index) => item === right[index]);
  }
  return left === right;
}

function isServerPatchEchoingPayload(
  patch: Partial<WorkTreeNode>,
  payload: Record<string, unknown>
): boolean {
  const entries = Object.entries(patch);
  if (entries.length === 0) {
    return false;
  }
  return entries.every(([key, value]) => isSamePrimitiveOrList(value, payload[key]));
}

function normalizeTreeData(input: unknown): WorkTreeNode[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const raw = input as Array<Partial<WorkTreeNode>>;
  const hasNestedChildren = raw.some(
    (node) => Array.isArray(node.children) && node.children.length > 0
  );
  if (hasNestedChildren) {
    return raw as WorkTreeNode[];
  }

  const byId = new Map<string, WorkTreeNode>();
  for (const row of raw) {
    if (!row || typeof row.id !== "string") continue;
    byId.set(row.id, {
      id: row.id,
      workspaceId: row.workspaceId ?? DEFAULT_WORKSPACE_ID,
      title: row.title ?? "",
      object: row.object ?? null,
      possiblyRemovable: row.possiblyRemovable ?? false,
      parentId: row.parentId ?? null,
      siblingOrder: row.siblingOrder ?? 0,
      overcomplication: row.overcomplication ?? null,
      importance: row.importance ?? null,
      blocksMoney: row.blocksMoney ?? null,
      currentProblems: Array.isArray(row.currentProblems) ? row.currentProblems : [],
      solutionVariants: Array.isArray(row.solutionVariants) ? row.solutionVariants : [],
      overcomplicationSum: row.overcomplicationSum,
      importanceSum: row.importanceSum,
      blocksMoneySum: row.blocksMoneySum,
      overcomplication_sum: row.overcomplication_sum,
      importance_sum: row.importance_sum,
      blocks_money_sum: row.blocks_money_sum,
      aggregates: row.aggregates,
      children: []
    });
  }

  const roots: WorkTreeNode[] = [];
  for (const node of byId.values()) {
    if (!node.parentId || !byId.has(node.parentId)) {
      roots.push(node);
      continue;
    }
    byId.get(node.parentId)?.children.push(node);
  }

  const sortRecursively = (nodes: WorkTreeNode[]) => {
    nodes.sort((a, b) => a.siblingOrder - b.siblingOrder);
    for (const node of nodes) {
      sortRecursively(node.children);
    }
  };
  sortRecursively(roots);
  return roots;
}

function patchTreeRow(
  nodes: WorkTreeNode[],
  rowId: string,
  patch: Partial<WorkTreeNode>
): WorkTreeNode[] {
  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (node.id === rowId) {
      changed = true;
      return { ...node, ...patch };
    }
    const nextChildren = patchTreeRow(node.children, rowId, patch);
    if (nextChildren !== node.children) {
      changed = true;
      return { ...node, children: nextChildren };
    }
    return node;
  });
  return changed ? nextNodes : nodes;
}

function getAggregateFromBackend(
  row: FlatRow,
  key: "overcomplicationSum" | "importanceSum" | "blocksMoneySum"
): number | null {
  const candidates: unknown[] = [row[key], row.aggregates?.[key]];
  if (key === "overcomplicationSum") {
    candidates.push(row.overcomplication_sum, row.aggregates?.overcomplication_sum);
  }
  if (key === "importanceSum") {
    candidates.push(row.importance_sum, row.aggregates?.importance_sum);
  }
  if (key === "blocksMoneySum") {
    candidates.push(row.blocks_money_sum, row.aggregates?.blocks_money_sum);
  }
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function cloneTree(nodes: WorkTreeNode[]): WorkTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    children: cloneTree(node.children)
  }));
}

function getChildrenBucket(
  roots: WorkTreeNode[],
  parentId: string | null
): WorkTreeNode[] | null {
  if (parentId === null) {
    return roots;
  }

  const queue = [...roots];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (current.id === parentId) {
      return current.children;
    }
    queue.push(...current.children);
  }
  return null;
}

function resequenceSiblings(nodes: WorkTreeNode[]) {
  nodes.forEach((node, index) => {
    node.siblingOrder = index;
  });
}

function detachNode(
  nodes: WorkTreeNode[],
  id: string
): { node: WorkTreeNode; sourceSiblings: WorkTreeNode[] } | null {
  const index = nodes.findIndex((node) => node.id === id);
  if (index >= 0) {
    const [node] = nodes.splice(index, 1);
    return { node, sourceSiblings: nodes };
  }

  for (const node of nodes) {
    const found = detachNode(node.children, id);
    if (found) {
      return found;
    }
  }
  return null;
}

function makeOptimisticNode(input: Partial<WorkTreeNode>): WorkTreeNode | null {
  if (typeof input.id !== "string" || input.id.length === 0) {
    return null;
  }
  return {
    id: input.id,
    workspaceId: input.workspaceId ?? DEFAULT_WORKSPACE_ID,
    title: input.title ?? "",
    object: input.object ?? null,
    possiblyRemovable: input.possiblyRemovable ?? false,
    parentId: input.parentId ?? null,
    siblingOrder: input.siblingOrder ?? 0,
    overcomplication: input.overcomplication ?? null,
    importance: input.importance ?? null,
    blocksMoney: input.blocksMoney ?? null,
    currentProblems: Array.isArray(input.currentProblems) ? input.currentProblems : [],
    solutionVariants: Array.isArray(input.solutionVariants) ? input.solutionVariants : [],
    overcomplicationSum: input.overcomplicationSum,
    importanceSum: input.importanceSum,
    blocksMoneySum: input.blocksMoneySum,
    overcomplication_sum: input.overcomplication_sum,
    importance_sum: input.importance_sum,
    blocks_money_sum: input.blocks_money_sum,
    aggregates: input.aggregates,
    children: []
  };
}

function applyOptimisticCreate(
  currentTree: WorkTreeNode[],
  created: Partial<WorkTreeNode>,
  parentId: string | null,
  targetIndex: number
): WorkTreeNode[] {
  const optimisticNode = makeOptimisticNode(created);
  if (!optimisticNode) {
    return currentTree;
  }

  const nextTree = cloneTree(currentTree);
  const siblings = getChildrenBucket(nextTree, parentId);
  if (!siblings) {
    return currentTree;
  }

  const safeIndex = Math.max(0, Math.min(targetIndex, siblings.length));
  optimisticNode.parentId = parentId;
  siblings.splice(safeIndex, 0, optimisticNode);
  resequenceSiblings(siblings);
  return nextTree;
}

function applyOptimisticMove(
  currentTree: WorkTreeNode[],
  id: string,
  targetParentId: string | null,
  targetIndex: number
): WorkTreeNode[] {
  const nextTree = cloneTree(currentTree);
  const detached = detachNode(nextTree, id);
  if (!detached) {
    return currentTree;
  }

  const destinationSiblings = getChildrenBucket(nextTree, targetParentId);
  if (!destinationSiblings) {
    return currentTree;
  }

  const safeIndex = Math.max(0, Math.min(targetIndex, destinationSiblings.length));
  detached.node.parentId = targetParentId;
  destinationSiblings.splice(safeIndex, 0, detached.node);
  resequenceSiblings(detached.sourceSiblings);
  resequenceSiblings(destinationSiblings);
  return nextTree;
}

export function WorkspaceClient() {
  const isDev = process.env.NODE_ENV !== "production";
  const [tree, setTree] = useState<WorkTreeNode[]>([]);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [errorText, setErrorText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pendingFocusRowId, setPendingFocusRowId] = useState<string | null>(null);
  const [escapeCancellableRowId, setEscapeCancellableRowId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<PointerDragState | null>(null);
  const dragStateRef = useRef<PointerDragState | null>(null);
  const autosaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const rowQueuesRef = useRef<Map<string, LocalFirstRowQueue<EditState>>>(new Map());
  const rowMetaRef = useRef<Map<string, RowEditMeta>>(new Map());
  const editsRef = useRef<Record<string, EditState>>({});
  const columnWidthRafRef = useRef<number | null>(null);
  const devMetricsRef = useRef<DevPerfMetrics>({
    patchLatencies: [],
    refreshCount: 0,
    inputToPaintSamples: [],
    overlayRecalcCount: 0
  });
  const titleInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const textareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const rowElementRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const overlayRafRef = useRef<number | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const viewportScrollbarRef = useRef<HTMLDivElement | null>(null);
  const syncScrollRef = useRef(false);
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const [rowAnchors, setRowAnchors] = useState<Record<string, RowAnchor>>({});
  const [tableHeaderBottom, setTableHeaderBottom] = useState(0);
  const [overlayHeight, setOverlayHeight] = useState(0);
  const [viewportScrollbarWidth, setViewportScrollbarWidth] = useState(0);
  const [showViewportScrollbar, setShowViewportScrollbar] = useState(false);

  const rows = useMemo(() => flattenTree(tree), [tree]);
  const numberingById = useMemo(() => buildTreeNumbering(tree), [tree]);
  const siblingsByParent = useMemo(() => {
    const map = new Map<string | null, FlatRow[]>();
    for (const row of rows) {
      const bucket = map.get(row.parentId) ?? [];
      bucket.push(row);
      map.set(row.parentId, bucket);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.siblingOrder - b.siblingOrder);
    }
    return map;
  }, [rows]);
  const rowsById = useMemo(() => {
    const map = new Map<string, FlatRow>();
    for (const row of rows) {
      map.set(row.id, row);
    }
    return map;
  }, [rows]);
  const [tableColumnWidths, setTableColumnWidths] = useState<TableColumnWidths>(
    STABLE_TABLE_COLUMN_WIDTHS
  );

  useEffect(() => {
    editsRef.current = edits;
  }, [edits]);

  const recomputeTextColumnWidths = useCallback(() => {
    const editsSnapshot = editsRef.current;
    let maxTitle = 0;
    let maxObject = 0;
    let maxProblems = 0;
    let maxSolutions = 0;

    for (const row of rows) {
      const edit = editsSnapshot[row.id] ?? buildEditState(row);
      const depthChars = Math.ceil((row.depth * TREE_LEVEL_OFFSET_PX) / 10);
      maxTitle = Math.max(maxTitle, maxLineLengthWithSpaces(edit.title) + depthChars);
      maxObject = Math.max(maxObject, maxLineLengthWithSpaces(edit.object));
      maxProblems = Math.max(maxProblems, maxLineLengthWithSpaces(edit.currentProblems));
      maxSolutions = Math.max(maxSolutions, maxLineLengthWithSpaces(edit.solutionVariants));
    }

    const next: TableColumnWidths = {
      work: `${clampColumnChars(maxTitle, 24)}ch`,
      object: `${clampColumnChars(maxObject, 16)}ch`,
      overcomplication: STABLE_TABLE_COLUMN_WIDTHS.overcomplication,
      importance: STABLE_TABLE_COLUMN_WIDTHS.importance,
      blocksMoney: STABLE_TABLE_COLUMN_WIDTHS.blocksMoney,
      currentProblems: `${clampColumnChars(maxProblems, 18)}ch`,
      solutionVariants: `${clampColumnChars(maxSolutions, 18)}ch`,
      removable: STABLE_TABLE_COLUMN_WIDTHS.removable
    };

    setTableColumnWidths((current) => {
      if (
        current.work === next.work &&
        current.object === next.object &&
        current.overcomplication === next.overcomplication &&
        current.importance === next.importance &&
        current.blocksMoney === next.blocksMoney &&
        current.currentProblems === next.currentProblems &&
        current.solutionVariants === next.solutionVariants &&
        current.removable === next.removable
      ) {
        return current;
      }
      return next;
    });
  }, [rows]);

  const scheduleTextColumnWidthRecalc = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (columnWidthRafRef.current !== null) {
      cancelAnimationFrame(columnWidthRafRef.current);
    }
    columnWidthRafRef.current = requestAnimationFrame(() => {
      columnWidthRafRef.current = null;
      recomputeTextColumnWidths();
    });
  }, [recomputeTextColumnWidths]);

  const getRowQueue = useCallback((rowId: string) => {
    const existing = rowQueuesRef.current.get(rowId);
    if (existing) {
      return existing;
    }
    const created = new LocalFirstRowQueue<EditState>();
    rowQueuesRef.current.set(rowId, created);
    return created;
  }, []);

  const getRowMeta = useCallback((rowId: string) => {
    const existing = rowMetaRef.current.get(rowId);
    if (existing) {
      return existing;
    }
    const created: RowEditMeta = {
      isDirty: false,
      isFocused: false,
      lastLocalRevision: 0,
      lastAckRevision: 0
    };
    rowMetaRef.current.set(rowId, created);
    return created;
  }, []);

  const recordInputToPaint = useCallback(
    (durationMs: number) => {
      if (!isDev || typeof window === "undefined") {
        return;
      }
      const metrics = devMetricsRef.current;
      metrics.inputToPaintSamples.push(durationMs);
      if (metrics.inputToPaintSamples.length > DEV_METRICS_SAMPLE_LIMIT) {
        metrics.inputToPaintSamples.shift();
      }
    },
    [isDev]
  );

  const baseInsertLanes = useMemo(
    () => buildInsertLanes(rows, siblingsByParent as Map<string | null, FlatRowLike[]>),
    [rows, siblingsByParent]
  );
  const insertLanes = useMemo(
    () => withLaneAnchors(baseInsertLanes, rowAnchors, tableHeaderBottom),
    [baseInsertLanes, rowAnchors, tableHeaderBottom]
  );
  const rowSignature = useMemo(
    () =>
      rows
        .map((row) =>
          [
            row.id,
            row.parentId ?? "root",
            row.siblingOrder,
            row.title,
            row.object ?? "",
            row.overcomplication ?? "",
            row.importance ?? "",
            row.blocksMoney ?? "",
            row.currentProblems.join("|"),
            row.solutionVariants.join("|")
          ].join("::")
        )
        .join("||"),
    [rows]
  );
  const structureSignature = useMemo(
    () =>
      rows
        .map((row) => `${row.id}:${row.parentId ?? "root"}:${row.siblingOrder}`)
        .join("||"),
    [rows]
  );

  useEffect(() => {
    scheduleTextColumnWidthRecalc();
  }, [scheduleTextColumnWidthRecalc, structureSignature]);

  async function refreshTree(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setIsLoading(true);
    }
    try {
      const response = await fetch(
        `/api/work-items?workspaceId=${encodeURIComponent(DEFAULT_WORKSPACE_ID)}`,
        { cache: "no-store" }
      );
      const json = await response.json();
      if (!response.ok) {
        throw new Error(mapErrorText(json));
      }
      setTree(normalizeTreeData(json.data));
      if (isDev) {
        const metrics = devMetricsRef.current;
        metrics.refreshCount += 1;
      }
      setErrorText("");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Неизвестная ошибка.");
    } finally {
      if (!options?.silent) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    void refreshTree();
  }, []);

  useEffect(() => {
    const liveRowIds = new Set(rows.map((row) => row.id));
    setEdits((current) => {
      let changed = false;
      const next: Record<string, EditState> = { ...current };

      for (const row of rows) {
        const serverEdit = buildEditState(row);
        const currentEdit = current[row.id];
        const meta = getRowMeta(row.id);
        const queue = rowQueuesRef.current.get(row.id);
        const hasTimer = autosaveTimersRef.current.has(row.id);
        const hasPending = (queue?.hasPending() ?? false) || hasTimer;
        const protectDraft = meta.isDirty && (meta.isFocused || hasPending);

        if (!currentEdit) {
          next[row.id] = serverEdit;
          changed = true;
          continue;
        }
        if (protectDraft) {
          continue;
        }
        if (!isSameEditState(currentEdit, serverEdit)) {
          next[row.id] = serverEdit;
          changed = true;
        }
      }

      for (const rowId of Object.keys(next)) {
        if (liveRowIds.has(rowId)) {
          continue;
        }
        delete next[rowId];
        rowMetaRef.current.delete(rowId);
        rowQueuesRef.current.delete(rowId);
        clearAutosaveTimer(rowId);
        changed = true;
      }

      return changed ? next : current;
    });
  }, [rowSignature, rows]);

  useEffect(() => {
    if (!pendingFocusRowId) {
      return;
    }
    const titleInput = titleInputRefs.current.get(pendingFocusRowId);
    if (!titleInput) {
      return;
    }
    titleInput.focus();
    titleInput.setSelectionRange(0, titleInput.value.length);
    setPendingFocusRowId(null);
  }, [pendingFocusRowId, rows]);

  const recalcOverlayGeometry = useCallback(() => {
    const wrapElement = tableWrapRef.current;
    const tableElement = tableRef.current;
    if (!wrapElement || !tableElement) {
      return;
    }
    if (isDev) {
      devMetricsRef.current.overlayRecalcCount += 1;
    }

    const wrapRect = wrapElement.getBoundingClientRect();
    const nextAnchors: Record<string, RowAnchor> = {};
    for (const row of rows) {
      const rowElement = rowElementRefs.current.get(row.id);
      if (!rowElement) {
        continue;
      }
      const rect = rowElement.getBoundingClientRect();
      nextAnchors[row.id] = {
        top: Math.round(rect.top - wrapRect.top),
        bottom: Math.round(rect.bottom - wrapRect.top)
      };
    }

    const theadRect = tableElement.tHead?.getBoundingClientRect();
    setTableHeaderBottom(theadRect ? Math.round(theadRect.bottom - wrapRect.top) : 0);
    setRowAnchors(nextAnchors);

    const tableRect = tableElement.getBoundingClientRect();
    setOverlayHeight(Math.round(tableRect.height));
  }, [isDev, rows]);

  const scheduleOverlayRecalc = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (overlayRafRef.current !== null) {
      cancelAnimationFrame(overlayRafRef.current);
    }
    overlayRafRef.current = requestAnimationFrame(() => {
      overlayRafRef.current = null;
      recalcOverlayGeometry();
    });
  }, [recalcOverlayGeometry]);

  useEffect(() => {
    scheduleOverlayRecalc();
  }, [scheduleOverlayRecalc, structureSignature]);

  useEffect(() => {
    const handleScroll = () => {
      scheduleOverlayRecalc();
    };

    window.addEventListener("resize", handleScroll);
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("resize", handleScroll);
      window.removeEventListener("scroll", handleScroll);
      if (overlayRafRef.current !== null) {
        cancelAnimationFrame(overlayRafRef.current);
        overlayRafRef.current = null;
      }
    };
  }, [scheduleOverlayRecalc]);

  const recalcViewportScrollbar = useCallback(() => {
    const listElement = listScrollRef.current;
    if (!listElement) {
      setViewportScrollbarWidth(0);
      setShowViewportScrollbar(false);
      return;
    }

    const scrollWidth = Math.ceil(listElement.scrollWidth);
    const clientWidth = Math.ceil(listElement.clientWidth);
    setViewportScrollbarWidth(scrollWidth);
    setShowViewportScrollbar(scrollWidth > clientWidth + 1);
  }, []);

  useEffect(() => {
    recalcViewportScrollbar();
  }, [recalcViewportScrollbar, structureSignature]);

  useEffect(() => {
    const listElement = listScrollRef.current;
    const tableElement = tableRef.current;
    if (!listElement) {
      return;
    }

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            recalcViewportScrollbar();
          });

    observer?.observe(listElement);
    if (tableElement) {
      observer?.observe(tableElement);
    }
    window.addEventListener("resize", recalcViewportScrollbar);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", recalcViewportScrollbar);
    };
  }, [recalcViewportScrollbar]);

  useEffect(() => {
    const listElement = listScrollRef.current;
    const viewportScrollbar = viewportScrollbarRef.current;
    if (!listElement || !viewportScrollbar) {
      return;
    }

    const syncFromList = () => {
      if (syncScrollRef.current) {
        return;
      }
      syncScrollRef.current = true;
      viewportScrollbar.scrollLeft = listElement.scrollLeft;
      syncScrollRef.current = false;
    };

    const syncFromViewport = () => {
      if (syncScrollRef.current) {
        return;
      }
      syncScrollRef.current = true;
      listElement.scrollLeft = viewportScrollbar.scrollLeft;
      syncScrollRef.current = false;
    };

    listElement.addEventListener("scroll", syncFromList, { passive: true });
    viewportScrollbar.addEventListener("scroll", syncFromViewport, { passive: true });
    syncFromList();
    return () => {
      listElement.removeEventListener("scroll", syncFromList);
      viewportScrollbar.removeEventListener("scroll", syncFromViewport);
    };
  }, [showViewportScrollbar]);

  useEffect(() => {
    if (!isDev || typeof window === "undefined") {
      return;
    }
    const timer = window.setInterval(() => {
      const metrics = devMetricsRef.current;
      const medianInputToPaint = getMedian(metrics.inputToPaintSamples);
      const medianPatch = getMedian(metrics.patchLatencies);
      console.debug(
        "[workspace perf]",
        JSON.stringify({
          overlayRecalcCount: metrics.overlayRecalcCount,
          medianInputToPaintMs:
            medianInputToPaint === null ? null : Number(medianInputToPaint.toFixed(1)),
          medianPatchLatencyMs:
            medianPatch === null ? null : Number(medianPatch.toFixed(1)),
          refreshCount: metrics.refreshCount
        })
      );
    }, 5000);
    return () => {
      window.clearInterval(timer);
    };
  }, [isDev]);

  async function createRowAtPosition(parentId: string | null, targetIndex: number) {
    try {
      const response = await fetch("/api/work-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: DEFAULT_WORKSPACE_ID,
          title: "",
          object: null,
          parentId,
          siblingOrder: targetIndex
        })
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(mapErrorText(json));
      }
      const createdId = json?.data?.id;
      if (json?.data && typeof json.data === "object") {
        setTree((current) =>
          applyOptimisticCreate(
            current,
            json.data as Partial<WorkTreeNode>,
            parentId,
            targetIndex
          )
        );
      }
      if (typeof createdId === "string" && createdId.length > 0) {
        setPendingFocusRowId(createdId);
        setEscapeCancellableRowId(createdId);
      }
      await refreshTree({ silent: true });
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Неизвестная ошибка.");
    }
  }

  function buildPatchPayload(currentRow: FlatRow, rowEdit: EditState) {
    const payload: Record<string, unknown> = {};
    const nextTitle = rowEdit.title;
    if (nextTitle !== currentRow.title) {
      payload.title = nextTitle;
    }

    const nextObject = rowEdit.object.trim().length === 0 ? null : rowEdit.object;
    if (nextObject !== currentRow.object) {
      payload.object = nextObject;
    }

    if (rowEdit.possiblyRemovable !== currentRow.possiblyRemovable) {
      payload.possiblyRemovable = rowEdit.possiblyRemovable;
    }

    const isParentRow = currentRow.children.length > 0;
    if (!isParentRow) {
      const nextOvercomplication = toNullableNumber(rowEdit.overcomplication);
      if (nextOvercomplication !== currentRow.overcomplication) {
        payload.overcomplication = nextOvercomplication;
      }

      const nextImportance = toNullableNumber(rowEdit.importance);
      if (nextImportance !== currentRow.importance) {
        payload.importance = nextImportance;
      }

      const nextBlocksMoney = toNullableNumber(rowEdit.blocksMoney);
      if (nextBlocksMoney !== currentRow.blocksMoney) {
        payload.blocksMoney = nextBlocksMoney;
      }
    }

    const nextCurrentProblems = multilineToList(rowEdit.currentProblems);
    if (!isSameStringList(nextCurrentProblems, currentRow.currentProblems)) {
      payload.currentProblems = nextCurrentProblems;
    }

    const nextSolutionVariants = multilineToList(rowEdit.solutionVariants);
    if (!isSameStringList(nextSolutionVariants, currentRow.solutionVariants)) {
      payload.solutionVariants = nextSolutionVariants;
    }

    return payload;
  }

  function markRowCleanIfSettled(id: string) {
    const queue = rowQueuesRef.current.get(id);
    const meta = getRowMeta(id);
    const hasTimer = autosaveTimersRef.current.has(id);
    const hasPending = (queue?.hasPending() ?? false) || hasTimer;
    if (!hasPending && meta.lastAckRevision >= meta.lastLocalRevision && !meta.isFocused) {
      meta.isDirty = false;
    }
  }

  async function runRowSaveRequest(id: string, request: RevisionedValue<EditState>) {
    const queue = getRowQueue(id);
    const currentRow = rowsById.get(id);
    if (!currentRow) {
      queue.acknowledge(request.revision);
      markRowCleanIfSettled(id);
      return;
    }

    const payload = buildPatchPayload(currentRow, request.value);
    if (Object.keys(payload).length === 0) {
      const ackResult = queue.acknowledge(request.revision);
      const meta = getRowMeta(id);
      meta.lastAckRevision = Math.max(meta.lastAckRevision, queue.getLastAckRevision());
      if (ackResult.nextRequest) {
        void runRowSaveRequest(id, ackResult.nextRequest);
      }
      markRowCleanIfSettled(id);
      return;
    }

    const startedAt = typeof performance !== "undefined" ? performance.now() : 0;
    try {
      const response = await fetch(`/api/work-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(mapErrorText(json));
      }

      if (isDev && typeof performance !== "undefined") {
        const latency = Math.max(0, performance.now() - startedAt);
        const metrics = devMetricsRef.current;
        metrics.patchLatencies.push(latency);
        if (metrics.patchLatencies.length > DEV_METRICS_SAMPLE_LIMIT) {
          metrics.patchLatencies.shift();
        }
      }

      const ackResult = queue.acknowledge(request.revision);
      const meta = getRowMeta(id);
      meta.lastAckRevision = Math.max(meta.lastAckRevision, queue.getLastAckRevision());

      if (!ackResult.stale && ackResult.shouldApply && json?.data) {
        const patch = buildRowPatchFromServer(json.data as Partial<WorkTreeNode>);
        if (
          Object.keys(patch).length > 0 &&
          !isServerPatchEchoingPayload(patch, payload)
        ) {
          setTree((currentTree) => patchTreeRow(currentTree, id, patch));
        }
      }
      if (ackResult.nextRequest) {
        void runRowSaveRequest(id, ackResult.nextRequest);
      }
      setErrorText("");
      markRowCleanIfSettled(id);
    } catch (error) {
      const nextRequest = queue.fail(request.revision);
      if (nextRequest) {
        void runRowSaveRequest(id, nextRequest);
      }
      setErrorText(error instanceof Error ? error.message : "Неизвестная ошибка.");
    }
  }

  async function deleteRow(id: string) {
    try {
      clearAutosaveTimer(id);
      rowQueuesRef.current.delete(id);
      rowMetaRef.current.delete(id);
      const response = await fetch(`/api/work-items/${id}`, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(mapErrorText(json));
      }
      if (escapeCancellableRowId === id) {
        setEscapeCancellableRowId(null);
      }
      await refreshTree();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Неизвестная ошибка.");
    }
  }

  function clearAutosaveTimer(id: string) {
    const timer = autosaveTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      autosaveTimersRef.current.delete(id);
    }
  }

  function startQueuedSave(id: string) {
    const queue = getRowQueue(id);
    const nextRequest = queue.startNext();
    if (!nextRequest) {
      markRowCleanIfSettled(id);
      return;
    }
    void runRowSaveRequest(id, nextRequest);
  }

  function queueAutosave(id: string, nextEdit: EditState, patch: RowEditPatch) {
    const queue = getRowQueue(id);
    const revisioned = queue.enqueue(nextEdit);
    const meta = getRowMeta(id);
    meta.isDirty = true;
    meta.lastLocalRevision = Math.max(meta.lastLocalRevision, revisioned.revision);

    clearAutosaveTimer(id);
    const delay = resolveAutosaveDelayMs(Object.keys(patch) as Array<keyof RowEditPatch>);
    const timer = setTimeout(() => {
      autosaveTimersRef.current.delete(id);
      startQueuedSave(id);
    }, delay);
    autosaveTimersRef.current.set(id, timer);
  }

  function flushRowAutosave(id: string) {
    clearAutosaveTimer(id);
    startQueuedSave(id);
  }

  useEffect(() => {
    return () => {
      for (const timer of autosaveTimersRef.current.values()) {
        clearTimeout(timer);
      }
      autosaveTimersRef.current.clear();
      if (columnWidthRafRef.current !== null) {
        cancelAnimationFrame(columnWidthRafRef.current);
        columnWidthRafRef.current = null;
      }
    };
  }, []);

  function updateEdit(
    id: string,
    patch: RowEditPatch,
    options?: { queueAutosave?: boolean; flush?: boolean; recalcColumnWidths?: boolean }
  ) {
    const startedAt = isDev && typeof performance !== "undefined" ? performance.now() : 0;
    const shouldQueueAutosave = options?.queueAutosave ?? true;
    const shouldRecalcColumnWidths = options?.recalcColumnWidths ?? false;
    setEdits((current) => {
      const fallbackRow = rowsById.get(id);
      const base = current[id] ?? (fallbackRow ? buildEditState(fallbackRow) : null);
      if (!base) return current;
      const nextEdit = { ...base, ...patch };
      if (isSameEditState(base, nextEdit)) {
        return current;
      }
      if (shouldQueueAutosave) {
        queueAutosave(id, nextEdit, patch);
      }
      const next = { ...current, [id]: nextEdit };
      if (shouldRecalcColumnWidths) {
        editsRef.current = next;
      }
      return next;
    });
    if (options?.flush) {
      flushRowAutosave(id);
    }
    if (shouldRecalcColumnWidths) {
      scheduleTextColumnWidthRecalc();
    }
    if (isDev && typeof window !== "undefined" && startedAt > 0) {
      requestAnimationFrame(() => {
        recordInputToPaint(Math.max(0, performance.now() - startedAt));
      });
    }
  }

  function commitTextEdit(id: string, patch: RowEditPatch) {
    updateEdit(id, patch, {
      queueAutosave: true,
      flush: true,
      recalcColumnWidths: true
    });
    handleFieldBlur(id, { flushAutosave: true });
  }

  function handleFieldFocus(rowId: string) {
    const meta = getRowMeta(rowId);
    meta.isFocused = true;
  }

  function handleFieldBlur(rowId: string, options?: { flushAutosave?: boolean }) {
    const meta = getRowMeta(rowId);
    meta.isFocused = false;
    if (options?.flushAutosave) {
      flushRowAutosave(rowId);
    } else {
      markRowCleanIfSettled(rowId);
    }
  }

  function handleTitleBlur(rowId: string) {
    if (escapeCancellableRowId === rowId) {
      setEscapeCancellableRowId(null);
    }
  }

  function handleTitleKeyDown(event: KeyboardEvent<HTMLInputElement>, rowId: string) {
    if (event.key !== "Escape") {
      return;
    }
    if (escapeCancellableRowId !== rowId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    clearAutosaveTimer(rowId);
    setEscapeCancellableRowId(null);
    void deleteRow(rowId);
  }

  async function moveRow(id: string, targetParentId: string | null, targetIndex: number) {
    try {
      setTree((current) => applyOptimisticMove(current, id, targetParentId, targetIndex));
      const response = await fetch(`/api/work-items/${id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetParentId,
          targetIndex
        })
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(mapErrorText(json));
      }
      await refreshTree({ silent: true });
      setErrorText("");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Неизвестная ошибка.");
    }
  }

  async function commitDrop(activeId: string, intent: DropIntent | null) {
    if (!intent) return;
    if (intent.type === "nest") {
      if (intent.targetId === activeId) return;
      const parentNode = rowsById.get(intent.targetId);
      if (!parentNode) return;
      const targetIndex = parentNode.children.filter((child) => child.id !== activeId).length;
      await moveRow(activeId, intent.targetId, targetIndex);
      return;
    }
    if (intent.type === "between") {
      await moveRow(activeId, intent.parentId, intent.targetIndex);
      return;
    }
    if (intent.type === "root-start") {
      await moveRow(activeId, null, 0);
      return;
    }
  }

  function updateDragState(next: PointerDragState | null) {
    dragStateRef.current = next;
    setDragState(next);
  }

  function resetDragState() {
    updateDragState(null);
  }

  function handleHandlePointerDown(event: PointerEvent<HTMLButtonElement>, rowId: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    scheduleOverlayRecalc();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateDragState({
      activeId: rowId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      isDragging: false,
      intent: null
    });
  }

  function handleHandlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = dragStateRef.current;
    if (!current || current.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - current.startX;
    const deltaY = event.clientY - current.startY;
    const distance = Math.hypot(deltaX, deltaY);
    if (!current.isDragging && distance < DRAG_START_DISTANCE) {
      return;
    }
    event.preventDefault();
    const nextIntent = resolveDropIntentAtPoint({
      clientX: event.clientX,
      clientY: event.clientY,
      movingId: current.activeId,
      rowsById: rowsById as Map<string, FlatRowLike>,
      siblingsByParent: siblingsByParent as Map<string | null, FlatRowLike[]>,
      gutterWidth: LEFT_GUTTER_WIDTH_PX
    });
    const nextState: PointerDragState = {
      ...current,
      isDragging: true,
      intent: nextIntent
    };
    if (
      current.isDragging !== nextState.isDragging ||
      !isSameDropIntent(current.intent, nextState.intent)
    ) {
      updateDragState(nextState);
    }
  }

  function handleHandlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    const current = dragStateRef.current;
    if (!current || current.pointerId !== event.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resetDragState();
    if (!current.isDragging) {
      return;
    }
    void commitDrop(current.activeId, current.intent);
  }

  function handleHandlePointerCancel(event: PointerEvent<HTMLButtonElement>) {
    const current = dragStateRef.current;
    if (!current || current.pointerId !== event.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resetDragState();
  }

  const draggedRowId = dragState?.isDragging ? dragState.activeId : null;
  const dropIntent = dragState?.isDragging ? dragState.intent : null;
  const isDragging = Boolean(dragState?.isDragging);
  const isDragPrimed = dragState !== null;
  const interactionMode: InteractionMode = isDragging ? "dragging" : "idle";
  const visibleInsertLanes = useMemo(
    () => insertLanes.filter((lane) => lane.anchorY !== null),
    [insertLanes]
  );
  const overlayAddIndicators = useMemo<OverlayIndicator[]>(() => {
    if (interactionMode !== "idle" || isDragPrimed) {
      return [];
    }
    return visibleInsertLanes.map((lane) => ({
      kind: "add",
      laneId: lane.id,
      y: lane.anchorY ?? 0,
      parentId: lane.parentId,
      targetIndex: lane.targetIndex,
      showPlus: true
    }));
  }, [interactionMode, isDragPrimed, visibleInsertLanes]);
  const overlayDropIndicator = useMemo<OverlayIndicator | null>(() => {
    if (interactionMode !== "dragging" || !dropIntent) {
      return null;
    }

    if (dropIntent.type === "between") {
      const rowAnchor = rowAnchors[dropIntent.rowId];
      if (!rowAnchor) {
        return null;
      }
      const y = dropIntent.position === "before" ? rowAnchor.top : rowAnchor.bottom;
      return {
        kind: "drop",
        laneId: `drop:${dropIntent.rowId}:${dropIntent.position}`,
        y,
        parentId: dropIntent.parentId,
        targetIndex: dropIntent.targetIndex,
        showPlus: false
      };
    }

    if (dropIntent.type === "root-start") {
      const firstRootId = (siblingsByParent.get(null) ?? [])[0]?.id;
      const rootTop = firstRootId ? rowAnchors[firstRootId]?.top : undefined;
      return {
        kind: "drop",
        laneId: "drop:root-start",
        y: rootTop ?? tableHeaderBottom,
        parentId: null,
        targetIndex: 0,
        showPlus: false
      };
    }

    return null;
  }, [interactionMode, dropIntent, rowAnchors, siblingsByParent, tableHeaderBottom]);

  function registerTitleInputRef(rowId: string, node: HTMLInputElement | null) {
    if (!node) {
      titleInputRefs.current.delete(rowId);
      return;
    }
    titleInputRefs.current.set(rowId, node);
  }

  function registerRowElementRef(rowId: string, node: HTMLTableRowElement | null) {
    if (!node) {
      rowElementRefs.current.delete(rowId);
      return;
    }
    rowElementRefs.current.set(rowId, node);
  }

  function registerTextareaRef(key: string, node: HTMLTextAreaElement | null) {
    if (!node) {
      textareaRefs.current.delete(key);
      return;
    }
    textareaRefs.current.set(key, node);
    autoGrowTextarea(node);
  }

  return (
    <main>
      <div className="workspace">
        <section className="section">
          <header className="section-head">
            <h1 className="works-title">Работы</h1>
          </header>
          {errorText ? <p className="error-text">{errorText}</p> : null}
        </section>

        <section className="section">
          {isLoading ? <p className="list-loading">Загрузка</p> : null}
          {!isLoading && rows.length === 0 ? (
            <p className="list-empty">Пусто</p>
          ) : null}

          <div className="list" ref={listScrollRef}>
            <div className="work-table-wrap" ref={tableWrapRef}>
              <table
                data-tree-table
                ref={tableRef}
                data-drop-intent={dropIntent?.type ?? "none"}
                data-drop-position={dropIntent?.type === "between" ? dropIntent.position : "none"}
                style={
                  {
                    "--work-col-width": tableColumnWidths.work,
                    "--object-col-width": tableColumnWidths.object,
                    "--overcomplication-col-width": tableColumnWidths.overcomplication,
                    "--importance-col-width": tableColumnWidths.importance,
                    "--blocks-money-col-width": tableColumnWidths.blocksMoney,
                    "--problems-col-width": tableColumnWidths.currentProblems,
                    "--solutions-col-width": tableColumnWidths.solutionVariants,
                    "--removable-col-width": tableColumnWidths.removable,
                    "--frame-x": `${FRAME_X_PX}px`,
                    "--left-gutter-width": `${LEFT_GUTTER_WIDTH_PX}px`,
                    "--work-content-indent": `${WORK_CONTENT_INDENT_PX}px`,
                    "--cell-inline-pad": `${CELL_INLINE_PAD_PX}px`,
                    "--content-start-x": `${CONTENT_START_X_PX}px`,
                    "--structure-line-width": `${STRUCTURE_LINE_WIDTH_PX}px`
                  } as CSSProperties
                }
                className={[
                  "work-table",
                  dropIntent?.type === "root-start" ? "root-start-active" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <thead>
                  <tr>
                    <th className="work-col">Работа</th>
                    <th className="object-col">Объект</th>
                    <th className="score-col overcomplication-col">Сложно</th>
                    <th className="score-col importance-col">Важно</th>
                    <th className="score-col blocks-money-col">Не доплачивает</th>
                    <th className="problems-col">Проблемы</th>
                    <th className="solutions-col">Решения</th>
                    <th className="removable-col">Возможно убрать</th>
                    <th className="actions-col" aria-label="Удаление" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const edit = edits[row.id] ?? buildEditState(row);
                    const hasMultilineField =
                      edit.currentProblems.includes("\n") ||
                      edit.solutionVariants.includes("\n");
                    const rowClassName = [
                      draggedRowId === row.id ? "drag-source" : "",
                      dropIntent?.type === "between" && dropIntent.rowId === row.id
                        ? `drop-between-target-${dropIntent.position}`
                        : "",
                      dropIntent?.type === "nest" && dropIntent.targetId === row.id
                        ? "drop-nest-target"
                        : ""
                    ]
                      .filter(Boolean)
                      .join(" ");
                    const rowRenderSignature = `${row.id}:${row.parentId ?? "root"}:${row.siblingOrder}:${row.depth}`;
                    const editRenderSignature = [
                      edit.title,
                      edit.object,
                      edit.overcomplication,
                      edit.importance,
                      edit.blocksMoney,
                      edit.currentProblems,
                      edit.solutionVariants,
                      edit.possiblyRemovable ? "1" : "0"
                    ].join("::");
                    const isParentRow = row.children.length > 0;
                    const overcomplicationSum = getAggregateFromBackend(
                      row,
                      "overcomplicationSum"
                    );
                    const importanceSum = getAggregateFromBackend(row, "importanceSum");
                    const blocksMoneySum = getAggregateFromBackend(row, "blocksMoneySum");
                    return (
                      <MemoWorkRow
                        key={row.id}
                        rowId={row.id}
                        parentId={row.parentId}
                        depth={row.depth}
                        hasMultilineField={hasMultilineField}
                        className={rowClassName}
                        rowRenderSignature={rowRenderSignature}
                        editRenderSignature={editRenderSignature}
                        registerRowElementRef={registerRowElementRef}
                      >
                        <td className="work-col">
                          <div
                            className="cell-tree"
                            style={
                              {
                                "--row-depth": row.depth
                              } as CSSProperties
                            }
                          >
                            <span className="work-number" aria-hidden>
                              {numberingById.get(row.id) ?? ""}
                            </span>
                            <button
                              type="button"
                              className="drag-handle"
                              aria-label="Перетащить задачу"
                              title="Перетащить задачу"
                              onPointerDown={(event) => handleHandlePointerDown(event, row.id)}
                              onPointerMove={handleHandlePointerMove}
                              onPointerUp={handleHandlePointerUp}
                              onPointerCancel={handleHandlePointerCancel}
                            >
                              <i className="ri-draggable" aria-hidden />
                            </button>
                            <input
                              className="input-title"
                              key={`title:${row.id}:${edit.title}`}
                              ref={(node) => registerTitleInputRef(row.id, node)}
                              style={{
                                paddingInlineStart: `${
                                  row.depth * TREE_LEVEL_OFFSET_PX + WORK_CONTENT_INDENT_PX
                                }px`
                              }}
                              defaultValue={edit.title}
                              placeholder="Название"
                              aria-label="Название"
                              onFocus={() => handleFieldFocus(row.id)}
                              onKeyDown={(event) => handleTitleKeyDown(event, row.id)}
                              onBlur={(event) => {
                                commitTextEdit(row.id, { title: event.currentTarget.value });
                                handleTitleBlur(row.id);
                              }}
                            />
                          </div>
                        </td>
                        <td className="object-col">
                          <input
                            className="input-object"
                            key={`object:${row.id}:${edit.object}`}
                            defaultValue={edit.object}
                            placeholder="Объект"
                            aria-label="Объект"
                            onFocus={() => handleFieldFocus(row.id)}
                            onBlur={(event) =>
                              commitTextEdit(row.id, { object: event.currentTarget.value })
                            }
                          />
                        </td>
                        <td className="score-col overcomplication-col">
                          {isParentRow ? (
                            <span
                              className="score-summary"
                              title={
                                overcomplicationSum === null
                                  ? "Агрегат не получен от API"
                                  : undefined
                              }
                            >
                              {overcomplicationSum ?? "—"}
                            </span>
                          ) : (
                            <div
                              className={`rating-control ${ratingToneClass(
                                parseRating(edit.overcomplication)
                              )}`}
                              aria-label="Сложно от 1 до 5"
                            >
                              {[1, 2, 3, 4, 5].map((value) => {
                                const current = parseRating(edit.overcomplication);
                                const active = value <= current;
                                return (
                                  <button
                                    key={`overcomplication-${value}`}
                                    type="button"
                                    className={`rating-icon-btn${active ? " is-active" : ""}`}
                                    aria-label={`Сложно ${value} из 5`}
                                    aria-pressed={active}
                                    onClick={() =>
                                      updateEdit(row.id, {
                                        overcomplication:
                                          current === value ? "" : String(value)
                                      })
                                    }
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 24 24"
                                      width="1.12em"
                                      height="1.12em"
                                      fill="currentColor"
                                      aria-hidden
                                    >
                                      <path d="M7 6C7 6.23676 7.04072 6.46184 7.11469 6.66999C7.22686 6.98559 7.17357 7.33638 6.97276 7.60444C6.77194 7.8725 6.45026 8.02222 6.11585 8.00327C6.0776 8.0011 6.03898 8 6 8C4.89543 8 4 8.89543 4 10C4 10.5129 4.19174 10.9786 4.50903 11.3331C4.84885 11.7128 4.84885 12.2872 4.50903 12.6669C4.19174 13.0214 4 13.4871 4 14C4 14.8842 4.57447 15.6369 5.37327 15.9001C5.84924 16.057 6.1356 16.5419 6.04308 17.0345C6.01489 17.1846 6 17.3401 6 17.5C6 18.8807 7.11929 20 8.5 20C9.75862 20 10.8015 19.069 10.9746 17.8583C10.9806 17.8165 10.9891 17.7756 11 17.7358V6C11 4.89543 10.1046 4 9 4C7.89543 4 7 4.89543 7 6ZM13 17.7358C13.0109 17.7756 13.0194 17.8165 13.0254 17.8583C13.1985 19.069 14.2414 20 15.5 20C16.8807 20 18 18.8807 18 17.5C18 17.3401 17.9851 17.1846 17.9569 17.0345C17.8644 16.5419 18.1508 16.057 18.6267 15.9001C19.4255 15.6369 20 14.8842 20 14C20 13.4871 19.8083 13.0214 19.491 12.6669C19.1511 12.2872 19.1511 11.7128 19.491 11.3331C19.8083 10.9786 20 10.5129 20 10C20 8.89543 19.1046 8 18 8C17.961 8 17.9224 8.0011 17.8841 8.00327C17.5497 8.02222 17.2281 7.8725 17.0272 7.60444C16.8264 7.33638 16.7731 6.98559 16.8853 6.66999C16.9593 6.46184 17 6.23676 17 6C17 4.89543 16.1046 4 15 4C13.8954 4 13 4.89543 13 6V17.7358ZM9 2C10.1947 2 11.2671 2.52376 12 3.35418C12.7329 2.52376 13.8053 2 15 2C17.2091 2 19 3.79086 19 6C19 6.04198 18.9994 6.08382 18.9981 6.12552C20.7243 6.56889 22 8.13546 22 10C22 10.728 21.8049 11.4116 21.4646 12C21.8049 12.5884 22 13.272 22 14C22 15.4817 21.1949 16.7734 19.9999 17.4646L20 17.5C20 19.9853 17.9853 22 15.5 22C14.0859 22 12.8248 21.3481 12 20.3285C11.1752 21.3481 9.91405 22 8.5 22C6.01472 22 4 19.9853 4 17.5L4.00014 17.4646C2.80512 16.7734 2 15.4817 2 14C2 13.272 2.19513 12.5884 2.53536 12C2.19513 11.4116 2 10.728 2 10C2 8.13546 3.27573 6.56889 5.00194 6.12552C5.00065 6.08382 5 6.04198 5 6C5 3.79086 6.79086 2 9 2Z"></path>
                                    </svg>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="score-col importance-col">
                          {isParentRow ? (
                            <span
                              className="score-summary"
                              title={
                                importanceSum === null
                                  ? "Агрегат не получен от API"
                                  : undefined
                              }
                            >
                              {importanceSum ?? "—"}
                            </span>
                          ) : (
                            <div
                              className={`rating-control ${ratingToneClass(
                                parseRating(edit.importance)
                              )}`}
                              aria-label="Важно от 1 до 5"
                            >
                              {[1, 2, 3, 4, 5].map((value) => {
                                const current = parseRating(edit.importance);
                                const active = value <= current;
                                return (
                                  <button
                                    key={`importance-${value}`}
                                    type="button"
                                    className={`rating-icon-btn${active ? " is-active" : ""}`}
                                    aria-label={`Важно ${value} из 5`}
                                    aria-pressed={active}
                                    onClick={() =>
                                      updateEdit(row.id, {
                                        importance: current === value ? "" : String(value)
                                      })
                                    }
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 24 24"
                                      width="1.12em"
                                      height="1.12em"
                                      fill="currentColor"
                                      aria-hidden
                                    >
                                      <path d="M12 23C16.1421 23 19.5 19.6421 19.5 15.5C19.5 14.6345 19.2697 13.8032 19 13.0296C17.3333 14.6765 16.0667 15.5 15.2 15.5C19.1954 8.5 17 5.5 11 1.5C11.5 6.49951 8.20403 8.77375 6.86179 10.0366C5.40786 11.4045 4.5 13.3462 4.5 15.5C4.5 19.6421 7.85786 23 12 23ZM12.7094 5.23498C15.9511 7.98528 15.9666 10.1223 13.463 14.5086C12.702 15.8419 13.6648 17.5 15.2 17.5C15.8884 17.5 16.5841 17.2992 17.3189 16.9051C16.6979 19.262 14.5519 21 12 21C8.96243 21 6.5 18.5376 6.5 15.5C6.5 13.9608 7.13279 12.5276 8.23225 11.4932C8.35826 11.3747 8.99749 10.8081 9.02477 10.7836C9.44862 10.4021 9.7978 10.0663 10.1429 9.69677C11.3733 8.37932 12.2571 6.91631 12.7094 5.23498Z"></path>
                                    </svg>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="score-col blocks-money-col">
                          {isParentRow ? (
                            <span
                              className="score-summary"
                              title={
                                blocksMoneySum === null
                                  ? "Агрегат не получен от API"
                                  : undefined
                              }
                            >
                              {blocksMoneySum ?? "—"}
                            </span>
                          ) : (
                            <div
                              className={`rating-control ${ratingToneClass(
                                parseRating(edit.blocksMoney)
                              )}`}
                              aria-label="Не доплачивает от 1 до 5"
                            >
                              {[1, 2, 3, 4, 5].map((value) => {
                                const current = parseRating(edit.blocksMoney);
                                const active = value <= current;
                                return (
                                  <button
                                    key={`blocksMoney-${value}`}
                                    type="button"
                                    className={`rating-icon-btn${active ? " is-active" : ""}`}
                                    aria-label={`Не доплачивает ${value} из 5`}
                                    aria-pressed={active}
                                    onClick={() =>
                                      updateEdit(row.id, {
                                        blocksMoney: current === value ? "" : String(value)
                                      })
                                    }
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 24 24"
                                      width="1.12em"
                                      height="1.12em"
                                      fill="currentColor"
                                      aria-hidden
                                    >
                                      <path d="M12.0049 22.0027C6.48204 22.0027 2.00488 17.5256 2.00488 12.0027C2.00488 6.4799 6.48204 2.00275 12.0049 2.00275C17.5277 2.00275 22.0049 6.4799 22.0049 12.0027C22.0049 17.5256 17.5277 22.0027 12.0049 22.0027ZM12.0049 20.0027C16.4232 20.0027 20.0049 16.421 20.0049 12.0027C20.0049 7.58447 16.4232 4.00275 12.0049 4.00275C7.5866 4.00275 4.00488 7.58447 4.00488 12.0027C4.00488 16.421 7.5866 20.0027 12.0049 20.0027ZM12.0049 7.053L16.9546 12.0027L12.0049 16.9525L7.05514 12.0027L12.0049 7.053ZM12.0049 9.88143L9.88356 12.0027L12.0049 14.1241L14.1262 12.0027L12.0049 9.88143Z"></path>
                                    </svg>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="problems-col">
                          <textarea
                            className="textarea-list"
                            ref={(node) => registerTextareaRef(`currentProblems:${row.id}`, node)}
                            key={`currentProblems:${row.id}:${edit.currentProblems}`}
                            rows={1}
                            defaultValue={edit.currentProblems}
                            placeholder="Проблемы"
                            aria-label="Проблемы по строкам"
                            onFocus={() => handleFieldFocus(row.id)}
                            onBlur={(event) =>
                              commitTextEdit(row.id, {
                                currentProblems: event.currentTarget.value
                              })
                            }
                            onKeyDown={(event) => {
                              if (
                                event.key === "Enter" &&
                                (event.ctrlKey || event.metaKey)
                              ) {
                                event.preventDefault();
                                commitTextEdit(row.id, {
                                  currentProblems: event.currentTarget.value
                                });
                              }
                            }}
                            onInput={(event) => autoGrowTextarea(event.currentTarget)}
                          />
                        </td>
                        <td className="solutions-col">
                          <textarea
                            className="textarea-list"
                            ref={(node) => registerTextareaRef(`solutionVariants:${row.id}`, node)}
                            key={`solutionVariants:${row.id}:${edit.solutionVariants}`}
                            rows={1}
                            defaultValue={edit.solutionVariants}
                            placeholder="Решения"
                            aria-label="Решения по строкам"
                            onFocus={() => handleFieldFocus(row.id)}
                            onBlur={(event) =>
                              commitTextEdit(row.id, {
                                solutionVariants: event.currentTarget.value
                              })
                            }
                            onKeyDown={(event) => {
                              if (
                                event.key === "Enter" &&
                                (event.ctrlKey || event.metaKey)
                              ) {
                                event.preventDefault();
                                commitTextEdit(row.id, {
                                  solutionVariants: event.currentTarget.value
                                });
                              }
                            }}
                            onInput={(event) => autoGrowTextarea(event.currentTarget)}
                          />
                        </td>
                        <td className="removable-col">
                          <label className="possibly-removable-control">
                            <input
                              type="checkbox"
                              checked={edit.possiblyRemovable}
                              aria-label="Возможно убрать"
                              onChange={(event) =>
                                updateEdit(row.id, {
                                  possiblyRemovable: event.target.checked
                                })
                              }
                              onFocus={() => handleFieldFocus(row.id)}
                              onBlur={() => handleFieldBlur(row.id)}
                            />
                          </label>
                        </td>
                        <td>
                          <div className="cell-actions">
                            <button
                              className="btn btn-secondary btn-icon delete-handle"
                              onClick={() => void deleteRow(row.id)}
                              aria-label="Удалить"
                              title="Удалить"
                            >
                              <i className="ri-delete-bin-line" aria-hidden />
                            </button>
                          </div>
                        </td>
                      </MemoWorkRow>
                    );
                  })}
                </tbody>
              </table>
              <div
                className="work-table-overlay"
                style={
                  {
                    height: `${overlayHeight}px`,
                    "--work-col-width": tableColumnWidths.work,
                    "--content-start-x": `${CONTENT_START_X_PX}px`
                  } as CSSProperties
                }
              >
                {overlayAddIndicators.map((indicator) => (
                  <div
                    key={indicator.laneId}
                    className="overlay-add-lane"
                    style={{ top: `${indicator.y}px` }}
                  >
                    <div className="overlay-add-hotspot" aria-hidden>
                      <button
                        type="button"
                        className="overlay-add-plus"
                        aria-label="Добавить работу между строками"
                        title="Добавить работу"
                        onClick={() =>
                          void createRowAtPosition(indicator.parentId, indicator.targetIndex)
                        }
                      >
                        <i className="ri-add-line" aria-hidden />
                      </button>
                    </div>
                    <span className="overlay-add-line" aria-hidden />
                  </div>
                ))}
                {overlayDropIndicator ? (
                  <div
                    className="overlay-drop-line"
                    aria-hidden
                    style={{
                      top: `${Math.round(overlayDropIndicator.y)}px`
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>
      <div className={`viewport-scrollbar${showViewportScrollbar ? " is-visible" : ""}`}>
        <div className="viewport-scrollbar-track" ref={viewportScrollbarRef}>
          <div
            className="viewport-scrollbar-spacer"
            style={{ width: `${viewportScrollbarWidth}px` }}
          />
        </div>
      </div>
    </main>
  );
}
