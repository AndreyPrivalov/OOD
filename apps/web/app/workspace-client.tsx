"use client"
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  type EditState,
  buildEditState,
  useWorkItemEditing,
} from "./use-work-item-editing"
import {
  WorkItemRequestError,
  createWorkItem,
  deleteWorkItem,
  fetchWorkItems,
  moveWorkItem,
  patchWorkItem,
} from "./work-item-client"
import {
  type DropIntent,
  type FlatRowLike,
  type InsertLane,
  type InteractionMode,
  type OverlayIndicator,
  type RowAnchor,
  buildInsertLanes,
  isSameDropIntent,
  resolveDropIntentAtPoint,
  withLaneAnchors,
} from "./workspace-interactions"
import {
  WorkspaceRatingCell,
  workspaceRatingFieldConfigs,
} from "./workspace-ratings"
import { useWorkspaceContext } from "./workspaces/use-workspace-context"
import { WorkspaceSwitcher } from "./workspaces/workspace-switcher"

type WorkTreeNode = {
  id: string
  workspaceId: string
  title: string
  object: string | null
  possiblyRemovable: boolean
  parentId: string | null
  siblingOrder: number
  overcomplication: number | null
  importance: number | null
  blocksMoney: number | null
  currentProblems: string[]
  solutionVariants: string[]
  overcomplicationSum?: number
  importanceSum?: number
  blocksMoneySum?: number
  children: WorkTreeNode[]
}

type FlatRow = WorkTreeNode & { depth: number }

type DevPerfMetrics = {
  patchLatencies: number[]
  refreshCount: number
  inputToPaintSamples: number[]
  overlayRecalcCount: number
}

type PointerDragState = {
  activeId: string
  pointerId: number
  startX: number
  startY: number
  isDragging: boolean
  intent: DropIntent | null
}

type TableColumnWidths = {
  work: string
  object: string
  overcomplication: string
  importance: string
  blocksMoney: string
  currentProblems: string
  solutionVariants: string
  removable: string
}

const DEFAULT_WORKSPACE_ID = "default-workspace"
const DRAG_START_DISTANCE = 5
const FRAME_X_PX = 24
const LEFT_GUTTER_WIDTH_PX = 84
const WORK_CONTENT_INDENT_PX = 14
const CELL_INLINE_PAD_PX = 14
const STRUCTURE_LINE_WIDTH_PX = 2
const CONTENT_START_X_PX = CELL_INLINE_PAD_PX + WORK_CONTENT_INDENT_PX
const TREE_LEVEL_OFFSET_PX = 24
const DEV_METRICS_SAMPLE_LIMIT = 40
const MAX_COLUMN_CHARS = 70

type MemoRowProps = {
  rowId: string
  parentId: string | null
  depth: number
  hasMultilineField: boolean
  className: string
  rowRenderSignature: string
  editRenderSignature: string
  registerRowElementRef: (
    rowId: string,
    node: HTMLTableRowElement | null,
  ) => void
  children: ReactNode
}

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
    )
  },
  (prev, next) =>
    prev.rowId === next.rowId &&
    prev.parentId === next.parentId &&
    prev.depth === next.depth &&
    prev.hasMultilineField === next.hasMultilineField &&
    prev.className === next.className &&
    prev.rowRenderSignature === next.rowRenderSignature &&
    prev.editRenderSignature === next.editRenderSignature,
)
const STABLE_TABLE_COLUMN_WIDTHS: TableColumnWidths = {
  work: "420px",
  object: "260px",
  overcomplication: "15ch",
  importance: "15ch",
  blocksMoney: "15ch",
  currentProblems: "34ch",
  solutionVariants: "34ch",
  removable: "15ch",
}

function clampColumnChars(value: number, min: number, max = MAX_COLUMN_CHARS) {
  return Math.max(min, Math.min(max, value))
}

function maxLineLengthWithSpaces(value: string): number {
  return value.split("\n").reduce((max, line) => Math.max(max, line.length), 0)
}

const ERROR_TEXT_BY_CODE: Record<string, string> = {
  INVALID_PAYLOAD: "Некорректные данные в запросе.",
  INVALID_NUMERIC_RANGE: "Оценка должна быть целым числом от 0 до 5.",
  EMPTY_TITLE: "Заголовок не может быть пустым.",
  PARENT_NOT_FOUND: "Указанный родитель не найден.",
  CYCLE_DETECTED: "Нельзя переместить задачу внутрь собственной ветки.",
  INVALID_MOVE_TARGET: "Некорректная цель перемещения.",
  PARENT_RATINGS_READ_ONLY: "У родительской работы оценки только для чтения.",
  INTERNAL_ERROR: "Внутренняя ошибка сервера.",
}

function flattenTree(nodes: WorkTreeNode[], depth = 0): FlatRow[] {
  const result: FlatRow[] = []
  for (const node of nodes) {
    result.push({ ...node, depth })
    result.push(...flattenTree(node.children, depth + 1))
  }
  return result
}

function buildTreeNumbering(nodes: WorkTreeNode[], prefix: number[] = []) {
  const map = new Map<string, string>()
  const sorted = [...nodes].sort((a, b) => a.siblingOrder - b.siblingOrder)
  sorted.forEach((node, index) => {
    const path = [...prefix, index + 1]
    map.set(node.id, path.join("."))
    const childMap = buildTreeNumbering(node.children, path)
    for (const [childId, value] of childMap.entries()) {
      map.set(childId, value)
    }
  })
  return map
}

function mapErrorText(
  payload: { error?: string; message?: string } | null | undefined,
) {
  if (payload?.error && ERROR_TEXT_BY_CODE[payload.error]) {
    return ERROR_TEXT_BY_CODE[payload.error]
  }
  if (payload?.message && ERROR_TEXT_BY_CODE[payload.message]) {
    return ERROR_TEXT_BY_CODE[payload.message]
  }
  if (payload?.message && payload.message.trim().length > 0) {
    return payload.message
  }
  return "Не удалось выполнить действие. Повторите попытку."
}

function autoGrowTextarea(target: HTMLTextAreaElement) {
  target.style.height = "auto"
  target.style.height = `${target.scrollHeight}px`
}

function getMedian(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }
  return sorted[middle]
}

function normalizeTreeData(input: unknown): WorkTreeNode[] {
  if (!Array.isArray(input)) {
    return []
  }
  const raw = input as Array<Partial<WorkTreeNode>>
  const hasNestedChildren = raw.some(
    (node) => Array.isArray(node.children) && node.children.length > 0,
  )
  if (hasNestedChildren) {
    return raw as WorkTreeNode[]
  }

  const byId = new Map<string, WorkTreeNode>()
  for (const row of raw) {
    if (!row || typeof row.id !== "string") continue
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
      currentProblems: Array.isArray(row.currentProblems)
        ? row.currentProblems
        : [],
      solutionVariants: Array.isArray(row.solutionVariants)
        ? row.solutionVariants
        : [],
      overcomplicationSum: row.overcomplicationSum,
      importanceSum: row.importanceSum,
      blocksMoneySum: row.blocksMoneySum,
      children: [],
    })
  }

  const roots: WorkTreeNode[] = []
  for (const node of byId.values()) {
    if (!node.parentId || !byId.has(node.parentId)) {
      roots.push(node)
      continue
    }
    byId.get(node.parentId)?.children.push(node)
  }

  const sortRecursively = (nodes: WorkTreeNode[]) => {
    nodes.sort((a, b) => a.siblingOrder - b.siblingOrder)
    for (const node of nodes) {
      sortRecursively(node.children)
    }
  }
  sortRecursively(roots)
  return roots
}

function patchTreeRow(
  nodes: WorkTreeNode[],
  rowId: string,
  patch: Partial<WorkTreeNode>,
): WorkTreeNode[] {
  let changed = false
  const nextNodes = nodes.map((node) => {
    if (node.id === rowId) {
      changed = true
      return { ...node, ...patch }
    }
    const nextChildren = patchTreeRow(node.children, rowId, patch)
    if (nextChildren !== node.children) {
      changed = true
      return { ...node, children: nextChildren }
    }
    return node
  })
  return changed ? nextNodes : nodes
}

function cloneTree(nodes: WorkTreeNode[]): WorkTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    children: cloneTree(node.children),
  }))
}

function getChildrenBucket(
  roots: WorkTreeNode[],
  parentId: string | null,
): WorkTreeNode[] | null {
  if (parentId === null) {
    return roots
  }

  const queue = [...roots]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    if (current.id === parentId) {
      return current.children
    }
    queue.push(...current.children)
  }
  return null
}

function resequenceSiblings(nodes: WorkTreeNode[]) {
  nodes.forEach((node, index) => {
    node.siblingOrder = index
  })
}

function detachNode(
  nodes: WorkTreeNode[],
  id: string,
): { node: WorkTreeNode; sourceSiblings: WorkTreeNode[] } | null {
  const index = nodes.findIndex((node) => node.id === id)
  if (index >= 0) {
    const [node] = nodes.splice(index, 1)
    return { node, sourceSiblings: nodes }
  }

  for (const node of nodes) {
    const found = detachNode(node.children, id)
    if (found) {
      return found
    }
  }
  return null
}

function makeOptimisticNode(input: Partial<WorkTreeNode>): WorkTreeNode | null {
  if (typeof input.id !== "string" || input.id.length === 0) {
    return null
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
    currentProblems: Array.isArray(input.currentProblems)
      ? input.currentProblems
      : [],
    solutionVariants: Array.isArray(input.solutionVariants)
      ? input.solutionVariants
      : [],
    overcomplicationSum: input.overcomplicationSum,
    importanceSum: input.importanceSum,
    blocksMoneySum: input.blocksMoneySum,
    children: [],
  }
}

function applyOptimisticCreate(
  currentTree: WorkTreeNode[],
  created: Partial<WorkTreeNode>,
  parentId: string | null,
  targetIndex: number,
): WorkTreeNode[] {
  const optimisticNode = makeOptimisticNode(created)
  if (!optimisticNode) {
    return currentTree
  }

  const nextTree = cloneTree(currentTree)
  const siblings = getChildrenBucket(nextTree, parentId)
  if (!siblings) {
    return currentTree
  }

  const safeIndex = Math.max(0, Math.min(targetIndex, siblings.length))
  optimisticNode.parentId = parentId
  siblings.splice(safeIndex, 0, optimisticNode)
  resequenceSiblings(siblings)
  return nextTree
}

function applyOptimisticMove(
  currentTree: WorkTreeNode[],
  id: string,
  targetParentId: string | null,
  targetIndex: number,
): WorkTreeNode[] {
  const nextTree = cloneTree(currentTree)
  const detached = detachNode(nextTree, id)
  if (!detached) {
    return currentTree
  }

  const destinationSiblings = getChildrenBucket(nextTree, targetParentId)
  if (!destinationSiblings) {
    return currentTree
  }

  const safeIndex = Math.max(
    0,
    Math.min(targetIndex, destinationSiblings.length),
  )
  detached.node.parentId = targetParentId
  destinationSiblings.splice(safeIndex, 0, detached.node)
  resequenceSiblings(detached.sourceSiblings)
  resequenceSiblings(destinationSiblings)
  return nextTree
}

export function WorkspaceClient() {
  const isDev = process.env.NODE_ENV !== "production"
  const {
    workspaces,
    currentWorkspace,
    currentWorkspaceId,
    errorText: workspaceErrorText,
    isCreating: isCreatingWorkspace,
    isLoading: isWorkspaceLoading,
    createWorkspace,
    openWorkspace,
  } = useWorkspaceContext()
  const [tree, setTree] = useState<WorkTreeNode[]>([])
  const [errorText, setErrorText] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [pendingFocusRowId, setPendingFocusRowId] = useState<string | null>(
    null,
  )
  const [escapeCancellableRowId, setEscapeCancellableRowId] = useState<
    string | null
  >(null)
  const [dragState, setDragState] = useState<PointerDragState | null>(null)
  const dragStateRef = useRef<PointerDragState | null>(null)
  const editsRef = useRef<Record<string, EditState>>({})
  const columnWidthRafRef = useRef<number | null>(null)
  const devMetricsRef = useRef<DevPerfMetrics>({
    patchLatencies: [],
    refreshCount: 0,
    inputToPaintSamples: [],
    overlayRecalcCount: 0,
  })
  const titleInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const textareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map())
  const rowElementRefs = useRef<Map<string, HTMLTableRowElement>>(new Map())
  const overlayRafRef = useRef<number | null>(null)
  const listScrollRef = useRef<HTMLDivElement | null>(null)
  const viewportScrollbarRef = useRef<HTMLDivElement | null>(null)
  const syncScrollRef = useRef(false)
  const tableWrapRef = useRef<HTMLDivElement | null>(null)
  const tableRef = useRef<HTMLTableElement | null>(null)
  const [rowAnchors, setRowAnchors] = useState<Record<string, RowAnchor>>({})
  const [tableHeaderBottom, setTableHeaderBottom] = useState(0)
  const [overlayHeight, setOverlayHeight] = useState(0)
  const [viewportScrollbarWidth, setViewportScrollbarWidth] = useState(0)
  const [showViewportScrollbar, setShowViewportScrollbar] = useState(false)

  const rows = useMemo(() => flattenTree(tree), [tree])
  const numberingById = useMemo(() => buildTreeNumbering(tree), [tree])
  const siblingsByParent = useMemo(() => {
    const map = new Map<string | null, FlatRow[]>()
    for (const row of rows) {
      const bucket = map.get(row.parentId) ?? []
      bucket.push(row)
      map.set(row.parentId, bucket)
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.siblingOrder - b.siblingOrder)
    }
    return map
  }, [rows])
  const rowsById = useMemo(() => {
    const map = new Map<string, FlatRow>()
    for (const row of rows) {
      map.set(row.id, row)
    }
    return map
  }, [rows])
  const [tableColumnWidths, setTableColumnWidths] = useState<TableColumnWidths>(
    STABLE_TABLE_COLUMN_WIDTHS,
  )

  const recomputeTextColumnWidths = useCallback(() => {
    let maxTitle = 0
    let maxObject = 0
    let maxProblems = 0
    let maxSolutions = 0

    for (const row of rows) {
      const edit = editsRef.current[row.id] ?? buildEditState(row)
      const depthChars = Math.ceil((row.depth * TREE_LEVEL_OFFSET_PX) / 10)
      maxTitle = Math.max(
        maxTitle,
        maxLineLengthWithSpaces(edit.title) + depthChars,
      )
      maxObject = Math.max(maxObject, maxLineLengthWithSpaces(edit.object))
      maxProblems = Math.max(
        maxProblems,
        maxLineLengthWithSpaces(edit.currentProblems),
      )
      maxSolutions = Math.max(
        maxSolutions,
        maxLineLengthWithSpaces(edit.solutionVariants),
      )
    }

    const next: TableColumnWidths = {
      work: `${clampColumnChars(maxTitle, 24)}ch`,
      object: `${clampColumnChars(maxObject, 16)}ch`,
      overcomplication: STABLE_TABLE_COLUMN_WIDTHS.overcomplication,
      importance: STABLE_TABLE_COLUMN_WIDTHS.importance,
      blocksMoney: STABLE_TABLE_COLUMN_WIDTHS.blocksMoney,
      currentProblems: `${clampColumnChars(maxProblems, 18)}ch`,
      solutionVariants: `${clampColumnChars(maxSolutions, 18)}ch`,
      removable: STABLE_TABLE_COLUMN_WIDTHS.removable,
    }

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
        return current
      }
      return next
    })
  }, [rows])

  const scheduleTextColumnWidthRecalc = useCallback(() => {
    if (typeof window === "undefined") {
      return
    }
    if (columnWidthRafRef.current !== null) {
      cancelAnimationFrame(columnWidthRafRef.current)
    }
    columnWidthRafRef.current = requestAnimationFrame(() => {
      columnWidthRafRef.current = null
      recomputeTextColumnWidths()
    })
  }, [recomputeTextColumnWidths])

  const recordInputToPaint = useCallback(
    (durationMs: number) => {
      if (!isDev || typeof window === "undefined") {
        return
      }
      const metrics = devMetricsRef.current
      metrics.inputToPaintSamples.push(durationMs)
      if (metrics.inputToPaintSamples.length > DEV_METRICS_SAMPLE_LIMIT) {
        metrics.inputToPaintSamples.shift()
      }
    },
    [isDev],
  )

  const baseInsertLanes = useMemo(
    () =>
      buildInsertLanes(
        rows,
        siblingsByParent as Map<string | null, FlatRowLike[]>,
      ),
    [rows, siblingsByParent],
  )
  const insertLanes = useMemo(
    () => withLaneAnchors(baseInsertLanes, rowAnchors, tableHeaderBottom),
    [baseInsertLanes, rowAnchors, tableHeaderBottom],
  )
  useEffect(() => {
    scheduleTextColumnWidthRecalc()
  }, [scheduleTextColumnWidthRecalc])

  useEffect(() => {
    return () => {
      if (columnWidthRafRef.current !== null) {
        cancelAnimationFrame(columnWidthRafRef.current)
        columnWidthRafRef.current = null
      }
    }
  }, [])

  const toErrorText = useCallback((error: unknown) => {
    if (error instanceof WorkItemRequestError) {
      return mapErrorText(error.payload)
    }
    return error instanceof Error ? error.message : "Неизвестная ошибка."
  }, [])

  const {
    edits,
    commitEdit,
    commitTextEdit,
    discardPendingSave,
    flushPendingEdits,
    handleFieldBlur,
    handleFieldFocus,
    updateEdit,
  } = useWorkItemEditing({
    isDev,
    rows,
    rowsById,
    patchRow: (rowId, patch) => {
      setTree((currentTree) => patchTreeRow(currentTree, rowId, patch))
    },
    reportError: setErrorText,
    saveRow: patchWorkItem,
    toErrorText,
    recordInputToPaint,
    recordPatchLatency: (latency) => {
      const metrics = devMetricsRef.current
      metrics.patchLatencies.push(latency)
      if (metrics.patchLatencies.length > DEV_METRICS_SAMPLE_LIMIT) {
        metrics.patchLatencies.shift()
      }
    },
    scheduleTextColumnWidthRecalc,
  })

  useEffect(() => {
    editsRef.current = edits
  }, [edits])

  const refreshTree = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!currentWorkspaceId) {
        setTree([])
        setIsLoading(false)
        return
      }
      if (!options?.silent) {
        setIsLoading(true)
      }
      try {
        const data = await fetchWorkItems(currentWorkspaceId)
        setTree(normalizeTreeData(data))
        if (isDev) {
          const metrics = devMetricsRef.current
          metrics.refreshCount += 1
        }
        setErrorText("")
      } catch (error) {
        setErrorText(toErrorText(error))
      } finally {
        if (!options?.silent) {
          setIsLoading(false)
        }
      }
    },
    [currentWorkspaceId, isDev, toErrorText],
  )

  useEffect(() => {
    void refreshTree()
  }, [refreshTree])

  useEffect(() => {
    if (!pendingFocusRowId) {
      return
    }
    const titleInput = titleInputRefs.current.get(pendingFocusRowId)
    if (!titleInput) {
      return
    }
    titleInput.focus()
    titleInput.setSelectionRange(0, titleInput.value.length)
    setPendingFocusRowId(null)
  }, [pendingFocusRowId])

  const recalcOverlayGeometry = useCallback(() => {
    const wrapElement = tableWrapRef.current
    const tableElement = tableRef.current
    if (!wrapElement || !tableElement) {
      return
    }
    if (isDev) {
      devMetricsRef.current.overlayRecalcCount += 1
    }

    const wrapRect = wrapElement.getBoundingClientRect()
    const nextAnchors: Record<string, RowAnchor> = {}
    for (const row of rows) {
      const rowElement = rowElementRefs.current.get(row.id)
      if (!rowElement) {
        continue
      }
      const rect = rowElement.getBoundingClientRect()
      nextAnchors[row.id] = {
        top: Math.round(rect.top - wrapRect.top),
        bottom: Math.round(rect.bottom - wrapRect.top),
      }
    }

    const theadRect = tableElement.tHead?.getBoundingClientRect()
    setTableHeaderBottom(
      theadRect ? Math.round(theadRect.bottom - wrapRect.top) : 0,
    )
    setRowAnchors(nextAnchors)

    const tableRect = tableElement.getBoundingClientRect()
    setOverlayHeight(Math.round(tableRect.height))
  }, [isDev, rows])

  const scheduleOverlayRecalc = useCallback(() => {
    if (typeof window === "undefined") {
      return
    }
    if (overlayRafRef.current !== null) {
      cancelAnimationFrame(overlayRafRef.current)
    }
    overlayRafRef.current = requestAnimationFrame(() => {
      overlayRafRef.current = null
      recalcOverlayGeometry()
    })
  }, [recalcOverlayGeometry])

  useEffect(() => {
    scheduleOverlayRecalc()
  }, [scheduleOverlayRecalc])

  useEffect(() => {
    const handleScroll = () => {
      scheduleOverlayRecalc()
    }

    window.addEventListener("resize", handleScroll)
    window.addEventListener("scroll", handleScroll, { passive: true })

    return () => {
      window.removeEventListener("resize", handleScroll)
      window.removeEventListener("scroll", handleScroll)
      if (overlayRafRef.current !== null) {
        cancelAnimationFrame(overlayRafRef.current)
        overlayRafRef.current = null
      }
    }
  }, [scheduleOverlayRecalc])

  const recalcViewportScrollbar = useCallback(() => {
    const listElement = listScrollRef.current
    if (!listElement) {
      setViewportScrollbarWidth(0)
      setShowViewportScrollbar(false)
      return
    }

    const scrollWidth = Math.ceil(listElement.scrollWidth)
    const clientWidth = Math.ceil(listElement.clientWidth)
    setViewportScrollbarWidth(scrollWidth)
    setShowViewportScrollbar(scrollWidth > clientWidth + 1)
  }, [])

  useEffect(() => {
    recalcViewportScrollbar()
  }, [recalcViewportScrollbar])

  useEffect(() => {
    const listElement = listScrollRef.current
    const tableElement = tableRef.current
    if (!listElement) {
      return
    }

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            recalcViewportScrollbar()
          })

    observer?.observe(listElement)
    if (tableElement) {
      observer?.observe(tableElement)
    }
    window.addEventListener("resize", recalcViewportScrollbar)
    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", recalcViewportScrollbar)
    }
  }, [recalcViewportScrollbar])

  useEffect(() => {
    const listElement = listScrollRef.current
    const viewportScrollbar = viewportScrollbarRef.current
    if (!listElement || !viewportScrollbar) {
      return
    }

    const syncFromList = () => {
      if (syncScrollRef.current) {
        return
      }
      syncScrollRef.current = true
      viewportScrollbar.scrollLeft = listElement.scrollLeft
      syncScrollRef.current = false
    }

    const syncFromViewport = () => {
      if (syncScrollRef.current) {
        return
      }
      syncScrollRef.current = true
      listElement.scrollLeft = viewportScrollbar.scrollLeft
      syncScrollRef.current = false
    }

    listElement.addEventListener("scroll", syncFromList, { passive: true })
    viewportScrollbar.addEventListener("scroll", syncFromViewport, {
      passive: true,
    })
    syncFromList()
    return () => {
      listElement.removeEventListener("scroll", syncFromList)
      viewportScrollbar.removeEventListener("scroll", syncFromViewport)
    }
  }, [])

  useEffect(() => {
    if (!isDev || typeof window === "undefined") {
      return
    }
    const timer = window.setInterval(() => {
      const metrics = devMetricsRef.current
      const medianInputToPaint = getMedian(metrics.inputToPaintSamples)
      const medianPatch = getMedian(metrics.patchLatencies)
      console.debug(
        "[workspace perf]",
        JSON.stringify({
          overlayRecalcCount: metrics.overlayRecalcCount,
          medianInputToPaintMs:
            medianInputToPaint === null
              ? null
              : Number(medianInputToPaint.toFixed(1)),
          medianPatchLatencyMs:
            medianPatch === null ? null : Number(medianPatch.toFixed(1)),
          refreshCount: metrics.refreshCount,
        }),
      )
    }, 5000)
    return () => {
      window.clearInterval(timer)
    }
  }, [isDev])

  async function createRowAtPosition(
    parentId: string | null,
    targetIndex: number,
  ) {
    if (!currentWorkspaceId) {
      return
    }

    try {
      const created = await createWorkItem({
        workspaceId: currentWorkspaceId,
        title: "",
        object: null,
        parentId,
        siblingOrder: targetIndex,
      })
      const createdId =
        created && typeof created === "object" && "id" in created
          ? created.id
          : null
      if (created && typeof created === "object") {
        setTree((current) =>
          applyOptimisticCreate(
            current,
            created as Partial<WorkTreeNode>,
            parentId,
            targetIndex,
          ),
        )
      }
      if (typeof createdId === "string" && createdId.length > 0) {
        setPendingFocusRowId(createdId)
        setEscapeCancellableRowId(createdId)
      }
      await refreshTree({ silent: true })
    } catch (error) {
      setErrorText(toErrorText(error))
    }
  }

  async function deleteRow(id: string) {
    try {
      discardPendingSave(id)
      await deleteWorkItem(id)
      if (escapeCancellableRowId === id) {
        setEscapeCancellableRowId(null)
      }
      await refreshTree()
    } catch (error) {
      setErrorText(toErrorText(error))
    }
  }

  function handleTitleBlur(rowId: string) {
    if (escapeCancellableRowId === rowId) {
      setEscapeCancellableRowId(null)
    }
  }

  function handleTitleKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    rowId: string,
  ) {
    if (event.key !== "Escape") {
      return
    }
    if (escapeCancellableRowId !== rowId) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    discardPendingSave(rowId)
    setEscapeCancellableRowId(null)
    void deleteRow(rowId)
  }

  async function moveRow(
    id: string,
    targetParentId: string | null,
    targetIndex: number,
  ) {
    try {
      setTree((current) =>
        applyOptimisticMove(current, id, targetParentId, targetIndex),
      )
      await moveWorkItem(id, {
        targetParentId,
        targetIndex,
      })
      await refreshTree({ silent: true })
      setErrorText("")
    } catch (error) {
      setErrorText(toErrorText(error))
    }
  }

  async function commitDrop(activeId: string, intent: DropIntent | null) {
    if (!intent) return
    if (intent.type === "nest") {
      if (intent.targetId === activeId) return
      const parentNode = rowsById.get(intent.targetId)
      if (!parentNode) return
      const targetIndex = parentNode.children.filter(
        (child) => child.id !== activeId,
      ).length
      await moveRow(activeId, intent.targetId, targetIndex)
      return
    }
    if (intent.type === "between") {
      await moveRow(activeId, intent.parentId, intent.targetIndex)
      return
    }
    if (intent.type === "root-start") {
      await moveRow(activeId, null, 0)
      return
    }
  }

  function updateDragState(next: PointerDragState | null) {
    dragStateRef.current = next
    setDragState(next)
  }

  function resetDragState() {
    updateDragState(null)
  }

  function handleHandlePointerDown(
    event: PointerEvent<HTMLButtonElement>,
    rowId: string,
  ) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    scheduleOverlayRecalc()
    event.currentTarget.setPointerCapture(event.pointerId)
    updateDragState({
      activeId: rowId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      isDragging: false,
      intent: null,
    })
  }

  function handleHandlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = dragStateRef.current
    if (!current || current.pointerId !== event.pointerId) {
      return
    }
    const deltaX = event.clientX - current.startX
    const deltaY = event.clientY - current.startY
    const distance = Math.hypot(deltaX, deltaY)
    if (!current.isDragging && distance < DRAG_START_DISTANCE) {
      return
    }
    event.preventDefault()
    const nextIntent = resolveDropIntentAtPoint({
      clientX: event.clientX,
      clientY: event.clientY,
      movingId: current.activeId,
      rowsById: rowsById as Map<string, FlatRowLike>,
      siblingsByParent: siblingsByParent as Map<string | null, FlatRowLike[]>,
      gutterWidth: LEFT_GUTTER_WIDTH_PX,
    })
    const nextState: PointerDragState = {
      ...current,
      isDragging: true,
      intent: nextIntent,
    }
    if (
      current.isDragging !== nextState.isDragging ||
      !isSameDropIntent(current.intent, nextState.intent)
    ) {
      updateDragState(nextState)
    }
  }

  function handleHandlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    const current = dragStateRef.current
    if (!current || current.pointerId !== event.pointerId) {
      return
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    resetDragState()
    if (!current.isDragging) {
      return
    }
    void commitDrop(current.activeId, current.intent)
  }

  function handleHandlePointerCancel(event: PointerEvent<HTMLButtonElement>) {
    const current = dragStateRef.current
    if (!current || current.pointerId !== event.pointerId) {
      return
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    resetDragState()
  }

  const draggedRowId = dragState?.isDragging ? dragState.activeId : null
  const dropIntent = dragState?.isDragging ? dragState.intent : null
  const isDragging = Boolean(dragState?.isDragging)
  const isDragPrimed = dragState !== null
  const interactionMode: InteractionMode = isDragging ? "dragging" : "idle"
  const visibleInsertLanes = useMemo(
    () => insertLanes.filter((lane) => lane.anchorY !== null),
    [insertLanes],
  )
  const overlayAddIndicators = useMemo<OverlayIndicator[]>(() => {
    if (interactionMode !== "idle" || isDragPrimed) {
      return []
    }
    return visibleInsertLanes.map((lane) => ({
      kind: "add",
      laneId: lane.id,
      y: lane.anchorY ?? 0,
      parentId: lane.parentId,
      targetIndex: lane.targetIndex,
      showPlus: true,
    }))
  }, [interactionMode, isDragPrimed, visibleInsertLanes])
  const overlayDropIndicator = useMemo<OverlayIndicator | null>(() => {
    if (interactionMode !== "dragging" || !dropIntent) {
      return null
    }

    if (dropIntent.type === "between") {
      const rowAnchor = rowAnchors[dropIntent.rowId]
      if (!rowAnchor) {
        return null
      }
      const y =
        dropIntent.position === "before" ? rowAnchor.top : rowAnchor.bottom
      return {
        kind: "drop",
        laneId: `drop:${dropIntent.rowId}:${dropIntent.position}`,
        y,
        parentId: dropIntent.parentId,
        targetIndex: dropIntent.targetIndex,
        showPlus: false,
      }
    }

    if (dropIntent.type === "root-start") {
      const firstRootId = (siblingsByParent.get(null) ?? [])[0]?.id
      const rootTop = firstRootId ? rowAnchors[firstRootId]?.top : undefined
      return {
        kind: "drop",
        laneId: "drop:root-start",
        y: rootTop ?? tableHeaderBottom,
        parentId: null,
        targetIndex: 0,
        showPlus: false,
      }
    }

    return null
  }, [
    interactionMode,
    dropIntent,
    rowAnchors,
    siblingsByParent,
    tableHeaderBottom,
  ])

  function registerTitleInputRef(rowId: string, node: HTMLInputElement | null) {
    if (!node) {
      titleInputRefs.current.delete(rowId)
      return
    }
    titleInputRefs.current.set(rowId, node)
  }

  function registerRowElementRef(
    rowId: string,
    node: HTMLTableRowElement | null,
  ) {
    if (!node) {
      rowElementRefs.current.delete(rowId)
      return
    }
    rowElementRefs.current.set(rowId, node)
  }

  function registerTextareaRef(key: string, node: HTMLTextAreaElement | null) {
    if (!node) {
      textareaRefs.current.delete(key)
      return
    }
    textareaRefs.current.set(key, node)
    autoGrowTextarea(node)
  }

  const currentWorkspaceName = currentWorkspace?.name ?? "Рабочее пространство"

  function handleOpenWorkspace(workspaceId: string) {
    if (workspaceId === currentWorkspaceId) {
      return
    }

    flushPendingEdits()
    setErrorText("")
    openWorkspace(workspaceId)
  }

  async function handleCreateWorkspace(name: string) {
    flushPendingEdits()
    setErrorText("")
    await createWorkspace(name)
  }

  return (
    <main>
      <div className="workspace">
        <section className="section">
          <WorkspaceSwitcher
            currentWorkspaceId={currentWorkspaceId}
            isCreating={isCreatingWorkspace}
            isLoading={isWorkspaceLoading}
            onCreateWorkspace={handleCreateWorkspace}
            onOpenWorkspace={handleOpenWorkspace}
            workspaces={workspaces}
          />
          {workspaceErrorText ? (
            <p className="error-text">{workspaceErrorText}</p>
          ) : null}
        </section>

        <section className="section">
          <header className="section-head">
            <h1 className="works-title">Работы</h1>
            <p className="workspace-context">{currentWorkspaceName}</p>
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
                data-drop-position={
                  dropIntent?.type === "between" ? dropIntent.position : "none"
                }
                style={
                  {
                    "--work-col-width": tableColumnWidths.work,
                    "--object-col-width": tableColumnWidths.object,
                    "--overcomplication-col-width":
                      tableColumnWidths.overcomplication,
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
                    "--structure-line-width": `${STRUCTURE_LINE_WIDTH_PX}px`,
                  } as CSSProperties
                }
                className={[
                  "work-table",
                  dropIntent?.type === "root-start" ? "root-start-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <thead>
                  <tr>
                    <th className="work-col">Работа</th>
                    <th className="object-col">Объект</th>
                    {workspaceRatingFieldConfigs.map((field) => (
                      <th
                        key={field.key}
                        className={`score-col ${field.columnClassName}`}
                      >
                        {field.headerLabel}
                      </th>
                    ))}
                    <th className="problems-col">Проблемы</th>
                    <th className="solutions-col">Решения</th>
                    <th className="removable-col">Возможно убрать</th>
                    <th className="actions-col" aria-label="Удаление" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const edit = edits[row.id] ?? buildEditState(row)
                    const hasMultilineField =
                      edit.currentProblems.includes("\n") ||
                      edit.solutionVariants.includes("\n")
                    const rowClassName = [
                      draggedRowId === row.id ? "drag-source" : "",
                      dropIntent?.type === "between" &&
                      dropIntent.rowId === row.id
                        ? `drop-between-target-${dropIntent.position}`
                        : "",
                      dropIntent?.type === "nest" &&
                      dropIntent.targetId === row.id
                        ? "drop-nest-target"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")
                    const rowRenderSignature = `${row.id}:${row.parentId ?? "root"}:${row.siblingOrder}:${row.depth}`
                    const editRenderSignature = [
                      edit.title,
                      edit.object,
                      edit.overcomplication,
                      edit.importance,
                      edit.blocksMoney,
                      edit.currentProblems,
                      edit.solutionVariants,
                      edit.possiblyRemovable ? "1" : "0",
                    ].join("::")
                    const isParentRow = row.children.length > 0
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
                                "--row-depth": row.depth,
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
                              onPointerDown={(event) =>
                                handleHandlePointerDown(event, row.id)
                              }
                              onPointerMove={handleHandlePointerMove}
                              onPointerUp={handleHandlePointerUp}
                              onPointerCancel={handleHandlePointerCancel}
                            >
                              <i className="ri-draggable" aria-hidden />
                            </button>
                            <input
                              className="input-title"
                              key={`title:${row.id}:${edit.title}`}
                              ref={(node) =>
                                registerTitleInputRef(row.id, node)
                              }
                              style={{
                                paddingInlineStart: `${
                                  row.depth * TREE_LEVEL_OFFSET_PX +
                                  WORK_CONTENT_INDENT_PX
                                }px`,
                              }}
                              defaultValue={edit.title}
                              placeholder="Название"
                              aria-label="Название"
                              onFocus={() => handleFieldFocus(row.id)}
                              onKeyDown={(event) =>
                                handleTitleKeyDown(event, row.id)
                              }
                              onBlur={(event) => {
                                commitTextEdit(row.id, {
                                  title: event.currentTarget.value,
                                })
                                handleFieldBlur(row.id)
                                handleTitleBlur(row.id)
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
                            onBlur={(event) => {
                              commitTextEdit(row.id, {
                                object: event.currentTarget.value,
                              })
                              handleFieldBlur(row.id)
                            }}
                          />
                        </td>
                        <WorkspaceRatingCell
                          field={workspaceRatingFieldConfigs[0]}
                          row={row}
                          editState={edit}
                          isParentRow={isParentRow}
                          onChange={(value) =>
                            commitEdit(row.id, {
                              overcomplication: value,
                            })
                          }
                        />
                        <WorkspaceRatingCell
                          field={workspaceRatingFieldConfigs[1]}
                          row={row}
                          editState={edit}
                          isParentRow={isParentRow}
                          onChange={(value) =>
                            commitEdit(row.id, {
                              importance: value,
                            })
                          }
                        />
                        <WorkspaceRatingCell
                          field={workspaceRatingFieldConfigs[2]}
                          row={row}
                          editState={edit}
                          isParentRow={isParentRow}
                          onChange={(value) =>
                            commitEdit(row.id, {
                              blocksMoney: value,
                            })
                          }
                        />
                        <td className="problems-col">
                          <textarea
                            className="textarea-list"
                            ref={(node) =>
                              registerTextareaRef(
                                `currentProblems:${row.id}`,
                                node,
                              )
                            }
                            key={`currentProblems:${row.id}:${edit.currentProblems}`}
                            rows={1}
                            defaultValue={edit.currentProblems}
                            placeholder="Проблемы"
                            aria-label="Проблемы по строкам"
                            onFocus={() => handleFieldFocus(row.id)}
                            onBlur={(event) => {
                              commitTextEdit(row.id, {
                                currentProblems: event.currentTarget.value,
                              })
                              handleFieldBlur(row.id)
                            }}
                            onKeyDown={(event) => {
                              if (
                                event.key === "Enter" &&
                                (event.ctrlKey || event.metaKey)
                              ) {
                                event.preventDefault()
                                commitTextEdit(row.id, {
                                  currentProblems: event.currentTarget.value,
                                })
                              }
                            }}
                            onInput={(event) =>
                              autoGrowTextarea(event.currentTarget)
                            }
                          />
                        </td>
                        <td className="solutions-col">
                          <textarea
                            className="textarea-list"
                            ref={(node) =>
                              registerTextareaRef(
                                `solutionVariants:${row.id}`,
                                node,
                              )
                            }
                            key={`solutionVariants:${row.id}:${edit.solutionVariants}`}
                            rows={1}
                            defaultValue={edit.solutionVariants}
                            placeholder="Решения"
                            aria-label="Решения по строкам"
                            onFocus={() => handleFieldFocus(row.id)}
                            onBlur={(event) => {
                              commitTextEdit(row.id, {
                                solutionVariants: event.currentTarget.value,
                              })
                              handleFieldBlur(row.id)
                            }}
                            onKeyDown={(event) => {
                              if (
                                event.key === "Enter" &&
                                (event.ctrlKey || event.metaKey)
                              ) {
                                event.preventDefault()
                                commitTextEdit(row.id, {
                                  solutionVariants: event.currentTarget.value,
                                })
                              }
                            }}
                            onInput={(event) =>
                              autoGrowTextarea(event.currentTarget)
                            }
                          />
                        </td>
                        <td className="removable-col">
                          <label className="possibly-removable-control">
                            <input
                              type="checkbox"
                              checked={edit.possiblyRemovable}
                              aria-label="Возможно убрать"
                              onChange={(event) =>
                                commitEdit(row.id, {
                                  possiblyRemovable: event.target.checked,
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
                              type="button"
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
                    )
                  })}
                </tbody>
              </table>
              <div
                className="work-table-overlay"
                style={
                  {
                    height: `${overlayHeight}px`,
                    "--work-col-width": tableColumnWidths.work,
                    "--content-start-x": `${CONTENT_START_X_PX}px`,
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
                          void createRowAtPosition(
                            indicator.parentId,
                            indicator.targetIndex,
                          )
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
                      top: `${Math.round(overlayDropIndicator.y)}px`,
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>
      <div
        className={`viewport-scrollbar${showViewportScrollbar ? " is-visible" : ""}`}
      >
        <div className="viewport-scrollbar-track" ref={viewportScrollbarRef}>
          <div
            className="viewport-scrollbar-spacer"
            style={{ width: `${viewportScrollbarWidth}px` }}
          />
        </div>
      </div>
    </main>
  )
}
