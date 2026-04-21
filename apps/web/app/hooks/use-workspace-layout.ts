"use client"

import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { FlatRow } from "../state/workspace-tree-state"
import {
  type RowAnchorMap,
  applyMeasuredRowAnchor,
  parseRowIdFromTextareaKey,
  removeRowAnchor,
} from "./workspace-layout/row-measurement-layer"

type TextEditLike = {
  title: string
  object: string
  currentProblems: string
  solutionVariants: string
}

export type TableColumnWidths = {
  work: string
  object: string
  overcomplication: string
  importance: string
  currentProblems: string
  solutionVariants: string
  removable: string
}

const TREE_LEVEL_OFFSET_PX = 24
const MAX_COLUMN_CHARS = 70
const FIXED_WORK_COLUMN_WIDTH_CH = 50
const FIXED_MULTILINE_COLUMN_WIDTH_CH = 35
const STABLE_TABLE_COLUMN_WIDTHS: TableColumnWidths = {
  work: `${FIXED_WORK_COLUMN_WIDTH_CH}ch`,
  object: "260px",
  overcomplication: "15ch",
  importance: "15ch",
  currentProblems: `${FIXED_MULTILINE_COLUMN_WIDTH_CH}ch`,
  solutionVariants: `${FIXED_MULTILINE_COLUMN_WIDTH_CH}ch`,
  removable: "15ch",
}

function clampColumnChars(value: number, min: number, max = MAX_COLUMN_CHARS) {
  return Math.max(min, Math.min(max, value))
}

function maxLineLengthWithSpaces(value: string): number {
  return value.split("\n").reduce((max, line) => Math.max(max, line.length), 0)
}

function autoGrowTextarea(target: HTMLTextAreaElement) {
  target.style.height = "auto"
  target.style.height = `${target.scrollHeight}px`
}

type UseWorkspaceLayoutOptions = {
  getEditForRow: (row: FlatRow) => TextEditLike
  isDev: boolean
  rows: FlatRow[]
}

export function useWorkspaceLayout(options: UseWorkspaceLayoutOptions) {
  const { getEditForRow, isDev, rows } = options
  const rowOrder = useMemo(() => rows.map((row) => row.id), [rows])
  const rowOrderRef = useRef<readonly string[]>(rowOrder)
  const rowOrderSignature = useMemo(() => rowOrder.join("|"), [rowOrder])
  const rowElementRefs = useRef<Map<string, HTMLTableRowElement>>(new Map())
  const titleInputRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map())
  const textareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map())
  const rowResizeObserverRef = useRef<ResizeObserver | null>(null)
  const pendingRowMeasurementIdsRef = useRef<Set<string>>(new Set())
  const rowMeasurementRafRef = useRef<number | null>(null)
  const overlayRafRef = useRef<number | null>(null)
  const columnWidthRafRef = useRef<number | null>(null)
  const tableWrapRef = useRef<HTMLDivElement | null>(null)
  const tableRef = useRef<HTMLTableElement | null>(null)
  const listScrollRef = useRef<HTMLDivElement | null>(null)
  const viewportScrollbarRef = useRef<HTMLDivElement | null>(null)
  const syncScrollRef = useRef(false)
  const [rowAnchors, setRowAnchors] = useState<RowAnchorMap>({})
  const [tableHeaderBottom, setTableHeaderBottom] = useState(0)
  const [overlayHeight, setOverlayHeight] = useState(0)
  const [viewportScrollbarWidth, setViewportScrollbarWidth] = useState(0)
  const [showViewportScrollbar, setShowViewportScrollbar] = useState(false)
  const [overlayRecalcCount, setOverlayRecalcCount] = useState(0)
  const [tableColumnWidths, setTableColumnWidths] = useState<TableColumnWidths>(
    STABLE_TABLE_COLUMN_WIDTHS,
  )

  useEffect(() => {
    rowOrderRef.current = rowOrder
  }, [rowOrder])

  const recomputeTextColumnWidths = useCallback(() => {
    let maxObject = 0

    for (const row of rows) {
      const edit = getEditForRow(row)
      maxObject = Math.max(maxObject, maxLineLengthWithSpaces(edit.object))
    }

    const next: TableColumnWidths = {
      work: STABLE_TABLE_COLUMN_WIDTHS.work,
      object: `${clampColumnChars(maxObject, 16)}ch`,
      overcomplication: STABLE_TABLE_COLUMN_WIDTHS.overcomplication,
      importance: STABLE_TABLE_COLUMN_WIDTHS.importance,
      currentProblems: STABLE_TABLE_COLUMN_WIDTHS.currentProblems,
      solutionVariants: STABLE_TABLE_COLUMN_WIDTHS.solutionVariants,
      removable: STABLE_TABLE_COLUMN_WIDTHS.removable,
    }

    setTableColumnWidths((current) => {
      if (
        current.work === next.work &&
        current.object === next.object &&
        current.overcomplication === next.overcomplication &&
        current.importance === next.importance &&
        current.currentProblems === next.currentProblems &&
        current.solutionVariants === next.solutionVariants &&
        current.removable === next.removable
      ) {
        return current
      }
      return next
    })
  }, [getEditForRow, rows])

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

  useEffect(() => {
    scheduleTextColumnWidthRecalc()
  }, [scheduleTextColumnWidthRecalc])

  useEffect(() => {
    return () => {
      if (columnWidthRafRef.current !== null) {
        cancelAnimationFrame(columnWidthRafRef.current)
      }
    }
  }, [])

  const recalcStaticOverlayGeometry = useCallback(() => {
    const wrapElement = tableWrapRef.current
    const tableElement = tableRef.current
    if (!wrapElement || !tableElement) {
      return
    }
    if (isDev) {
      setOverlayRecalcCount((current) => current + 1)
    }

    const wrapRect = wrapElement.getBoundingClientRect()
    const theadRect = tableElement.tHead?.getBoundingClientRect()
    const nextHeaderBottom = theadRect
      ? Math.round(theadRect.bottom - wrapRect.top)
      : 0
    setTableHeaderBottom((current) =>
      current === nextHeaderBottom ? current : nextHeaderBottom,
    )
    const tableRect = tableElement.getBoundingClientRect()
    const nextOverlayHeight = Math.round(tableRect.height)
    setOverlayHeight((current) =>
      current === nextOverlayHeight ? current : nextOverlayHeight,
    )
  }, [isDev])

  const flushRowMeasurements = useCallback(() => {
    const wrapElement = tableWrapRef.current
    if (!wrapElement) {
      return
    }
    const measurementIds = Array.from(pendingRowMeasurementIdsRef.current)
    if (measurementIds.length === 0) {
      return
    }
    pendingRowMeasurementIdsRef.current.clear()
    const wrapRect = wrapElement.getBoundingClientRect()
    const measured = measurementIds
      .map((rowId) => {
        const rowElement = rowElementRefs.current.get(rowId)
        if (!rowElement) {
          return null
        }
        const rect = rowElement.getBoundingClientRect()
        return {
          rowId,
          anchor: {
            top: Math.round(rect.top - wrapRect.top),
            bottom: Math.round(rect.bottom - wrapRect.top),
          },
        }
      })
      .filter(
        (
          entry,
        ): entry is {
          rowId: string
          anchor: { top: number; bottom: number }
        } => entry !== null,
      )

    if (measured.length === 0) {
      return
    }

    const measuredById = new Map<string, { top: number; bottom: number }>(
      measured.map((entry) => [entry.rowId, entry.anchor]),
    )
    const currentRowOrder = rowOrderRef.current
    const rowIndexById = new Map(
      currentRowOrder.map((rowId, index) => [rowId, index]),
    )
    const orderedIds = [...measuredById.keys()].sort(
      (left, right) =>
        (rowIndexById.get(left) ?? Number.POSITIVE_INFINITY) -
        (rowIndexById.get(right) ?? Number.POSITIVE_INFINITY),
    )

    setRowAnchors((current) => {
      let next = current
      for (const rowId of orderedIds) {
        const anchor = measuredById.get(rowId)
        if (!anchor) {
          continue
        }
        next = applyMeasuredRowAnchor(next, currentRowOrder, rowId, anchor)
      }
      return next
    })
  }, [])

  const scheduleRowMeasurement = useCallback(
    (rowIds: Iterable<string>) => {
      if (typeof window === "undefined") {
        return
      }
      for (const rowId of rowIds) {
        pendingRowMeasurementIdsRef.current.add(rowId)
      }
      if (pendingRowMeasurementIdsRef.current.size === 0) {
        return
      }
      if (rowMeasurementRafRef.current !== null) {
        cancelAnimationFrame(rowMeasurementRafRef.current)
      }
      rowMeasurementRafRef.current = requestAnimationFrame(() => {
        rowMeasurementRafRef.current = null
        flushRowMeasurements()
      })
    },
    [flushRowMeasurements],
  )

  const scheduleOverlayRecalc = useCallback(() => {
    if (typeof window === "undefined") {
      return
    }
    if (overlayRafRef.current !== null) {
      cancelAnimationFrame(overlayRafRef.current)
    }
    overlayRafRef.current = requestAnimationFrame(() => {
      overlayRafRef.current = null
      recalcStaticOverlayGeometry()
    })
  }, [recalcStaticOverlayGeometry])

  useEffect(() => {
    scheduleOverlayRecalc()
  }, [scheduleOverlayRecalc])

  useEffect(() => {
    const handleResize = () => {
      scheduleOverlayRecalc()
    }
    window.addEventListener("resize", handleResize)
    return () => {
      window.removeEventListener("resize", handleResize)
      if (overlayRafRef.current !== null) {
        cancelAnimationFrame(overlayRafRef.current)
      }
      if (rowMeasurementRafRef.current !== null) {
        cancelAnimationFrame(rowMeasurementRafRef.current)
      }
    }
  }, [scheduleOverlayRecalc])

  useLayoutEffect(() => {
    void rowOrderSignature
    scheduleRowMeasurement(rowOrderRef.current)
  }, [rowOrderSignature, scheduleRowMeasurement])

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const changedRowIds = new Set<string>()
      for (const entry of entries) {
        const target = entry.target
        if (target instanceof HTMLTableRowElement) {
          const rowId = target.dataset.rowId
          if (rowId) {
            changedRowIds.add(rowId)
          }
          continue
        }
        const row = target.closest("tr[data-row-id]")
        const rowId = row?.getAttribute("data-row-id")
        if (rowId) {
          changedRowIds.add(rowId)
        }
      }
      if (changedRowIds.size > 0) {
        scheduleRowMeasurement(changedRowIds)
      }
      scheduleOverlayRecalc()
    })

    rowResizeObserverRef.current = observer

    for (const rowElement of rowElementRefs.current.values()) {
      observer.observe(rowElement)
    }
    for (const titleInput of titleInputRefs.current.values()) {
      observer.observe(titleInput)
    }
    for (const textarea of textareaRefs.current.values()) {
      observer.observe(textarea)
    }

    return () => {
      observer.disconnect()
      rowResizeObserverRef.current = null
    }
  }, [scheduleOverlayRecalc, scheduleRowMeasurement])

  const recalcViewportScrollbar = useCallback(() => {
    const listElement = listScrollRef.current
    const viewportScrollbar = viewportScrollbarRef.current
    if (!listElement) {
      setViewportScrollbarWidth(0)
      setShowViewportScrollbar(false)
      return
    }
    const listScrollWidth = Math.ceil(listElement.scrollWidth)
    const listClientWidth = Math.ceil(listElement.clientWidth)
    const viewportClientWidth = Math.ceil(
      viewportScrollbar?.clientWidth ?? listClientWidth,
    )
    const listMaxScrollLeft = Math.max(0, listScrollWidth - listClientWidth)
    const viewportSpacerWidth = listMaxScrollLeft + viewportClientWidth

    setViewportScrollbarWidth(viewportSpacerWidth)
    setShowViewportScrollbar(listMaxScrollLeft > 1)
  }, [])

  useEffect(() => {
    recalcViewportScrollbar()
  }, [recalcViewportScrollbar])

  useEffect(() => {
    const listElement = listScrollRef.current
    const tableElement = tableRef.current
    const wrapElement = tableWrapRef.current
    if (!listElement) {
      return
    }

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            recalcViewportScrollbar()
            scheduleOverlayRecalc()
          })

    observer?.observe(listElement)
    if (tableElement) {
      observer?.observe(tableElement)
    }
    if (wrapElement) {
      observer?.observe(wrapElement)
    }
    window.addEventListener("resize", recalcViewportScrollbar)
    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", recalcViewportScrollbar)
    }
  }, [recalcViewportScrollbar, scheduleOverlayRecalc])

  useEffect(() => {
    const listElement = listScrollRef.current
    const viewportScrollbar = viewportScrollbarRef.current
    if (!listElement || !viewportScrollbar) {
      return
    }

    const getMaxScrollLeft = (element: HTMLDivElement) =>
      Math.max(0, element.scrollWidth - element.clientWidth)

    const syncFromList = () => {
      if (syncScrollRef.current) {
        return
      }
      syncScrollRef.current = true
      const listMax = getMaxScrollLeft(listElement)
      const viewportMax = getMaxScrollLeft(viewportScrollbar)
      if (listMax === 0 || viewportMax === 0) {
        viewportScrollbar.scrollLeft = 0
      } else {
        viewportScrollbar.scrollLeft =
          (listElement.scrollLeft / listMax) * viewportMax
      }
      syncScrollRef.current = false
    }

    const syncFromViewport = () => {
      if (syncScrollRef.current) {
        return
      }
      syncScrollRef.current = true
      const listMax = getMaxScrollLeft(listElement)
      const viewportMax = getMaxScrollLeft(viewportScrollbar)
      if (listMax === 0 || viewportMax === 0) {
        listElement.scrollLeft = 0
      } else {
        listElement.scrollLeft =
          (viewportScrollbar.scrollLeft / viewportMax) * listMax
      }
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

  const registerTitleInputRef = useCallback(
    (rowId: string, node: HTMLTextAreaElement | null) => {
      const previousNode = titleInputRefs.current.get(rowId)
      if (previousNode && previousNode !== node) {
        rowResizeObserverRef.current?.unobserve(previousNode)
      }
      if (!node) {
        titleInputRefs.current.delete(rowId)
        return
      }
      titleInputRefs.current.set(rowId, node)
      rowResizeObserverRef.current?.observe(node)
      autoGrowTextarea(node)
      scheduleRowMeasurement([rowId])
    },
    [scheduleRowMeasurement],
  )

  const registerRowElementRef = useCallback(
    (rowId: string, node: HTMLTableRowElement | null) => {
      const previousNode = rowElementRefs.current.get(rowId)
      if (previousNode && previousNode !== node) {
        rowResizeObserverRef.current?.unobserve(previousNode)
      }
      if (!node) {
        rowElementRefs.current.delete(rowId)
        setRowAnchors((current) => removeRowAnchor(current, rowId))
        return
      }
      rowElementRefs.current.set(rowId, node)
      rowResizeObserverRef.current?.observe(node)
      scheduleRowMeasurement([rowId])
    },
    [scheduleRowMeasurement],
  )

  const registerTextareaRef = useCallback(
    (key: string, node: HTMLTextAreaElement | null) => {
      const rowId = parseRowIdFromTextareaKey(key)
      const previousNode = textareaRefs.current.get(key)
      if (previousNode && previousNode !== node) {
        rowResizeObserverRef.current?.unobserve(previousNode)
      }
      if (!node) {
        textareaRefs.current.delete(key)
        return
      }
      textareaRefs.current.set(key, node)
      rowResizeObserverRef.current?.observe(node)
      autoGrowTextarea(node)
      if (rowId) {
        scheduleRowMeasurement([rowId])
      }
    },
    [scheduleRowMeasurement],
  )

  const focusTitleInput = useCallback((rowId: string) => {
    const titleInput = titleInputRefs.current.get(rowId)
    if (!titleInput) {
      return false
    }
    titleInput.focus({ preventScroll: true })
    titleInput.setSelectionRange(0, titleInput.value.length)
    return true
  }, [])

  return {
    listScrollRef: listScrollRef as RefObject<HTMLDivElement>,
    overlayHeight,
    overlayRecalcCount,
    rowAnchors,
    scheduleOverlayRecalc,
    scheduleTextColumnWidthRecalc,
    showViewportScrollbar,
    tableColumnWidths,
    tableHeaderBottom,
    tableRef: tableRef as RefObject<HTMLTableElement>,
    tableWrapRef: tableWrapRef as RefObject<HTMLDivElement>,
    viewportScrollbarRef: viewportScrollbarRef as RefObject<HTMLDivElement>,
    viewportScrollbarWidth,
    focusTitleInput,
    registerRowElementRef,
    registerTextareaRef,
    registerTitleInputRef,
  }
}

export function useTableFrameConstants() {
  return useMemo(
    () => ({
      FRAME_X_PX: 24,
      LEFT_GUTTER_WIDTH_PX: 84,
      WORK_CONTENT_INDENT_PX: 14,
      CELL_INLINE_PAD_PX: 14,
      STRUCTURE_LINE_WIDTH_PX: 2,
      CONTENT_START_X_PX: 28,
      TREE_LEVEL_OFFSET_PX,
    }),
    [],
  )
}
