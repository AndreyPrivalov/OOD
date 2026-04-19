"use client"

import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { FlatRow } from "../state/workspace-tree-state"
import type { RowAnchor } from "../tree-interactions"

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
  blocksMoney: string
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
  blocksMoney: "15ch",
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
  const rowElementRefs = useRef<Map<string, HTMLTableRowElement>>(new Map())
  const titleInputRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map())
  const textareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map())
  const overlayRafRef = useRef<number | null>(null)
  const columnWidthRafRef = useRef<number | null>(null)
  const textareaAutoGrowRafRef = useRef<number | null>(null)
  const tableWrapRef = useRef<HTMLDivElement | null>(null)
  const tableRef = useRef<HTMLTableElement | null>(null)
  const listScrollRef = useRef<HTMLDivElement | null>(null)
  const viewportScrollbarRef = useRef<HTMLDivElement | null>(null)
  const syncScrollRef = useRef(false)
  const [rowAnchors, setRowAnchors] = useState<Record<string, RowAnchor>>({})
  const [tableHeaderBottom, setTableHeaderBottom] = useState(0)
  const [overlayHeight, setOverlayHeight] = useState(0)
  const [viewportScrollbarWidth, setViewportScrollbarWidth] = useState(0)
  const [showViewportScrollbar, setShowViewportScrollbar] = useState(false)
  const [overlayRecalcCount, setOverlayRecalcCount] = useState(0)
  const [tableColumnWidths, setTableColumnWidths] = useState<TableColumnWidths>(
    STABLE_TABLE_COLUMN_WIDTHS,
  )
  const textareaLayoutSignature = [
    tableColumnWidths.work,
    tableColumnWidths.object,
    tableColumnWidths.currentProblems,
    tableColumnWidths.solutionVariants,
  ].join(":")

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
      blocksMoney: STABLE_TABLE_COLUMN_WIDTHS.blocksMoney,
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
        current.blocksMoney === next.blocksMoney &&
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

  useEffect(() => {
    void textareaLayoutSignature
    if (typeof window === "undefined") {
      return
    }
    if (textareaAutoGrowRafRef.current !== null) {
      cancelAnimationFrame(textareaAutoGrowRafRef.current)
    }
    textareaAutoGrowRafRef.current = requestAnimationFrame(() => {
      textareaAutoGrowRafRef.current = null
      for (const titleField of titleInputRefs.current.values()) {
        autoGrowTextarea(titleField)
      }
      for (const textarea of textareaRefs.current.values()) {
        autoGrowTextarea(textarea)
      }
    })
  }, [textareaLayoutSignature])

  const recalcOverlayGeometry = useCallback(() => {
    const wrapElement = tableWrapRef.current
    const tableElement = tableRef.current
    if (!wrapElement || !tableElement) {
      return
    }
    if (isDev) {
      setOverlayRecalcCount((current) => current + 1)
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
      }
      if (textareaAutoGrowRafRef.current !== null) {
        cancelAnimationFrame(textareaAutoGrowRafRef.current)
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

  const registerTitleInputRef = useCallback(
    (rowId: string, node: HTMLTextAreaElement | null) => {
      if (!node) {
        titleInputRefs.current.delete(rowId)
        return
      }
      titleInputRefs.current.set(rowId, node)
      autoGrowTextarea(node)
    },
    [],
  )

  const registerRowElementRef = useCallback(
    (rowId: string, node: HTMLTableRowElement | null) => {
      if (!node) {
        rowElementRefs.current.delete(rowId)
        return
      }
      rowElementRefs.current.set(rowId, node)
    },
    [],
  )

  const registerTextareaRef = useCallback(
    (key: string, node: HTMLTextAreaElement | null) => {
      if (!node) {
        textareaRefs.current.delete(key)
        return
      }
      textareaRefs.current.set(key, node)
      autoGrowTextarea(node)
    },
    [],
  )

  const focusTitleInput = useCallback((rowId: string) => {
    const titleInput = titleInputRefs.current.get(rowId)
    if (!titleInput) {
      return false
    }
    titleInput.focus()
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
