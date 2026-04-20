"use client"

import type {
  WorkspaceRatingFieldConfig,
  WorkspaceTreeRowUiModel,
} from "@ood/ui"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { isUndoRedoShortcut } from "../history/workspace-history"
import {
  areSetsEqual,
  filterVisibleRows,
  pruneCollapsedRowIds,
} from "../state/tree-visibility"
import { useWorkspaceContext } from "../workspaces/use-workspace-context"
import { WorkspaceSwitcher } from "../workspaces/workspace-switcher"
import {
  useTableFrameConstants,
  useWorkspaceLayout,
} from "./use-workspace-layout"
import { readActiveFieldSnapshot } from "./workspace-client-composition/page-exit-save"
import { useWorkspaceDndOverlayComposition } from "./workspace-client-composition/use-dnd-overlay-composition"
import {
  useWorkspaceEditingComposition,
  useWorkspaceEditingStateComposition,
} from "./workspace-client-composition/use-editing-composition"
import { useWorkspaceTreeDataComposition } from "./workspace-client-composition/use-tree-data-composition"

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

function autoGrowTextarea(target: HTMLTextAreaElement) {
  target.style.height = "auto"
  target.style.height = `${target.scrollHeight}px`
}

export function useWorkspaceClientComposition() {
  const isDev = process.env.NODE_ENV !== "production"
  const {
    workspaces,
    currentWorkspace,
    currentWorkspaceId,
    errorText: workspaceErrorText,
    isCreating: isCreatingWorkspace,
    isDeletingWorkspaceId,
    isLoading: isWorkspaceLoading,
    isRenamingWorkspaceId,
    createWorkspace,
    deleteWorkspace,
    openWorkspace,
    renameWorkspace,
    updateWorkspaceMetrics,
  } = useWorkspaceContext()

  const tableScoreHeaders = useMemo<
    Array<{ key: string; headerLabel: string; columnClassName: string }>
  >(() => {
    const baseHeaders: WorkspaceRatingFieldConfig[] = [
      {
        key: "overcomplication",
        buttonLabel: "Сложно",
        columnClassName: "overcomplication-col",
        controlAriaLabel: "Сложно от 1 до 5",
        headerLabel: "Сложно",
      },
      {
        key: "importance",
        buttonLabel: "Важно",
        columnClassName: "importance-col",
        controlAriaLabel: "Важно от 1 до 5",
        headerLabel: "Важно",
      },
    ]

    const metricHeaders = (currentWorkspace?.metrics ?? []).map((metric) => ({
      key: `metric:${metric.id}`,
      headerLabel: metric.shortName,
      columnClassName: "workspace-metric-col",
    }))

    return [...baseHeaders, ...metricHeaders]
  }, [currentWorkspace?.metrics])

  const [pendingFocusRowId, setPendingFocusRowId] = useState<string | null>(
    null,
  )
  const [escapeCancellableRowId, setEscapeCancellableRowId] = useState<
    string | null
  >(null)
  const [collapsedRowIds, setCollapsedRowIds] = useState<Set<string>>(
    () => new Set(),
  )
  const discardPendingSaveRef = useRef<(id: string) => void>(() => {})

  const treeData = useWorkspaceTreeDataComposition({
    currentWorkspaceId,
    discardPendingSave: (id) => {
      discardPendingSaveRef.current(id)
    },
    isDev,
    onCreateFocusRow: (rowId) => {
      setPendingFocusRowId(rowId)
      setEscapeCancellableRowId(rowId)
    },
    onDeleteRow: (rowId) => {
      setEscapeCancellableRowId((current) =>
        current === rowId ? null : current,
      )
    },
  })

  const editingState = useWorkspaceEditingStateComposition(treeData.rows)
  const rows = useMemo(
    () => filterVisibleRows(treeData.rows, collapsedRowIds),
    [collapsedRowIds, treeData.rows],
  )

  const layout = useWorkspaceLayout({
    getEditForRow: editingState.getEditForRow,
    isDev,
    rows,
  })

  const editing = useWorkspaceEditingComposition({
    deleteRow: treeData.deleteRow,
    escapeCancellableRowId,
    focusTitleInput: layout.focusTitleInput,
    isDev,
    onPersistedChange: treeData.recordPersistedChange,
    pendingFocusRowId,
    reportError: treeData.setErrorText,
    rows: treeData.rows,
    rowsById: treeData.rowsById,
    saveRow: treeData.saveRow,
    scheduleTextColumnWidthRecalc: layout.scheduleTextColumnWidthRecalc,
    setEscapeCancellableRowId,
    setPendingFocusRowId,
    setTree: treeData.setTree,
    syncEditsRef: editingState.syncEditsRef,
    toErrorText: treeData.toErrorText,
    workspaceMetrics: currentWorkspace?.metrics ?? [],
    onDiscardPendingSaveReady: (handler) => {
      discardPendingSaveRef.current = handler
    },
  })

  const {
    FRAME_X_PX,
    LEFT_GUTTER_WIDTH_PX,
    WORK_CONTENT_INDENT_PX,
    CELL_INLINE_PAD_PX,
    STRUCTURE_LINE_WIDTH_PX,
    CONTENT_START_X_PX,
    TREE_LEVEL_OFFSET_PX,
  } = useTableFrameConstants()

  const dndOverlay = useWorkspaceDndOverlayComposition({
    contentStartXPx: CONTENT_START_X_PX,
    moveRow: treeData.moveRow,
    rowAnchors: layout.rowAnchors,
    rows,
    rowsById: treeData.rowsById,
    rowTreeIndentPx: TREE_LEVEL_OFFSET_PX,
    scheduleOverlayRecalc: layout.scheduleOverlayRecalc,
    siblingsByParent: treeData.siblingsByParent,
    tableHeaderBottom: layout.tableHeaderBottom,
  })

  const readInputToPaintMedian = useCallback(
    () => getMedian(editing.inputToPaintRef.current),
    [editing.inputToPaintRef],
  )

  const readPatchLatencyMedian = useCallback(
    () => getMedian(editing.patchLatenciesRef.current),
    [editing.patchLatenciesRef],
  )

  useEffect(() => {
    if (!isDev || typeof window === "undefined") {
      return
    }
    const timer = window.setInterval(() => {
      const medianInputToPaint = readInputToPaintMedian()
      const medianPatch = readPatchLatencyMedian()
      console.debug(
        "[workspace perf]",
        JSON.stringify({
          overlayRecalcCount: layout.overlayRecalcCount,
          medianInputToPaintMs:
            medianInputToPaint === null
              ? null
              : Number(medianInputToPaint.toFixed(1)),
          medianPatchLatencyMs:
            medianPatch === null ? null : Number(medianPatch.toFixed(1)),
          refreshCount: treeData.refreshCount,
        }),
      )
    }, 5000)
    return () => {
      window.clearInterval(timer)
    }
  }, [
    isDev,
    layout.overlayRecalcCount,
    readInputToPaintMedian,
    readPatchLatencyMedian,
    treeData.refreshCount,
  ])

  useEffect(() => {
    setCollapsedRowIds((current) => {
      const next = pruneCollapsedRowIds(treeData.rows, current)
      if (areSetsEqual(current, next)) {
        return current
      }
      return next
    })
  }, [treeData.rows])

  const toggleRowCollapse = useCallback(
    (rowId: string) => {
      const row = treeData.rowsById.get(rowId)
      if (!row || row.children.length === 0) {
        return
      }
      setCollapsedRowIds((current) => {
        const next = new Set(current)
        if (next.has(rowId)) {
          next.delete(rowId)
        } else {
          next.add(rowId)
        }
        return next
      })
    },
    [treeData.rowsById],
  )

  const handleOpenWorkspace = useCallback(
    (workspaceId: string) => {
      if (workspaceId === currentWorkspaceId) {
        return
      }
      editing.flushPendingEdits()
      treeData.setErrorText("")
      openWorkspace(workspaceId)
    },
    [
      currentWorkspaceId,
      editing.flushPendingEdits,
      openWorkspace,
      treeData.setErrorText,
    ],
  )

  const handleCreateWorkspace = useCallback(
    async (name: string) => {
      editing.flushPendingEdits()
      treeData.setErrorText("")
      await createWorkspace(name)
    },
    [createWorkspace, editing.flushPendingEdits, treeData.setErrorText],
  )

  const handleRenameWorkspace = useCallback(
    async (workspaceId: string, name: string) => {
      editing.flushPendingEdits()
      treeData.setErrorText("")
      await renameWorkspace(workspaceId, name)
    },
    [editing.flushPendingEdits, renameWorkspace, treeData.setErrorText],
  )

  const handleDeleteWorkspace = useCallback(
    async (workspaceId: string) => {
      editing.flushPendingEdits()
      treeData.setErrorText("")
      await deleteWorkspace(workspaceId)
    },
    [deleteWorkspace, editing.flushPendingEdits, treeData.setErrorText],
  )

  const commitActiveFieldBeforeLeave = useCallback(() => {
    if (typeof document === "undefined") {
      return
    }

    const snapshot = readActiveFieldSnapshot(document.activeElement)
    if (!snapshot) {
      return
    }

    if (snapshot.field === "title") {
      editing.commitTextEdit(snapshot.rowId, { title: snapshot.value })
      editing.handleTitleBlur(snapshot.rowId)
    } else if (snapshot.field === "object") {
      editing.commitTextEdit(snapshot.rowId, { object: snapshot.value })
    } else if (snapshot.field === "currentProblems") {
      editing.commitTextEdit(snapshot.rowId, {
        currentProblems: snapshot.value,
      })
    } else if (snapshot.field === "solutionVariants") {
      editing.commitTextEdit(snapshot.rowId, {
        solutionVariants: snapshot.value,
      })
    }

    editing.handleFieldBlur(snapshot.rowId)
  }, [editing])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const handlePageExit = () => {
      commitActiveFieldBeforeLeave()
      editing.flushPendingEdits()
    }

    window.addEventListener("pagehide", handlePageExit)
    window.addEventListener("beforeunload", handlePageExit)

    return () => {
      window.removeEventListener("pagehide", handlePageExit)
      window.removeEventListener("beforeunload", handlePageExit)
    }
  }, [commitActiveFieldBeforeLeave, editing.flushPendingEdits])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const direction = isUndoRedoShortcut(event)
      if (!direction) {
        return
      }

      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.isContentEditable)
      ) {
        return
      }

      if (treeData.isApplyingHistory) {
        return
      }

      if (direction === "undo" && !treeData.canUndo) {
        return
      }
      if (direction === "redo" && !treeData.canRedo) {
        return
      }

      event.preventDefault()
      if (direction === "undo") {
        void treeData.undo()
      } else {
        void treeData.redo()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [
    treeData.canRedo,
    treeData.canUndo,
    treeData.isApplyingHistory,
    treeData.redo,
    treeData.undo,
  ])

  const renderSwitcher = useCallback(
    ({
      currentWorkspaceId,
      isCreatingWorkspace,
      isWorkspaceLoading,
      workspaces: switcherWorkspaces,
    }: {
      currentWorkspaceId: string | null
      isCreatingWorkspace: boolean
      isWorkspaceLoading: boolean
      workspaces: { id: string; name: string }[]
    }) => (
      <WorkspaceSwitcher
        currentWorkspaceId={currentWorkspaceId}
        isCreating={isCreatingWorkspace}
        isDeletingWorkspaceId={isDeletingWorkspaceId}
        isLoading={isWorkspaceLoading}
        isRenamingWorkspaceId={isRenamingWorkspaceId}
        onCreateWorkspace={handleCreateWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
        onWorkspaceMetricsChange={updateWorkspaceMetrics}
        onOpenWorkspace={handleOpenWorkspace}
        onRenameWorkspace={handleRenameWorkspace}
        workspaces={switcherWorkspaces.map(
          (workspace) =>
            workspaces.find((entry) => entry.id === workspace.id) ?? {
              ...workspace,
              metrics: [],
            },
        )}
      />
    ),
    [
      handleCreateWorkspace,
      handleDeleteWorkspace,
      handleOpenWorkspace,
      handleRenameWorkspace,
      isDeletingWorkspaceId,
      isRenamingWorkspaceId,
      updateWorkspaceMetrics,
      workspaces,
    ],
  )

  const currentWorkspaceName = currentWorkspace?.name ?? "Рабочее пространство"
  const rowUiById = useMemo<Record<string, WorkspaceTreeRowUiModel>>(() => {
    const next: Record<string, WorkspaceTreeRowUiModel> = {}

    for (const row of treeData.rows) {
      const edit = editing.rowEdits[row.id]
      if (!edit) {
        continue
      }
      const rowId = row.id
      next[rowId] = {
        title: {
          value: edit.title,
          registerTextareaRef: (node) =>
            layout.registerTitleInputRef(rowId, node),
          onFocus: () => editing.handleFieldFocus(rowId),
          onBlur: (value) => {
            editing.commitTextEdit(rowId, { title: value })
            editing.handleFieldBlur(rowId)
            editing.handleTitleBlur(rowId)
          },
          onKeyDown: (event) => editing.handleTitleKeyDown(event, rowId),
          onInput: autoGrowTextarea,
        },
        object: {
          value: edit.object,
          onFocus: () => editing.handleFieldFocus(rowId),
          onBlur: (value) => {
            editing.commitTextEdit(rowId, { object: value })
            editing.handleFieldBlur(rowId)
          },
        },
        currentProblems: {
          value: edit.currentProblems,
          registerTextareaRef: (node) =>
            layout.registerTextareaRef(`currentProblems:${rowId}`, node),
          onFocus: () => editing.handleFieldFocus(rowId),
          onBlur: (value) => {
            editing.commitTextEdit(rowId, { currentProblems: value })
            editing.handleFieldBlur(rowId)
          },
          onKeyDown: (event) => {
            if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) {
              return
            }
            event.preventDefault()
            editing.commitTextEdit(rowId, {
              currentProblems: event.currentTarget.value,
            })
          },
          onInput: autoGrowTextarea,
        },
        solutionVariants: {
          value: edit.solutionVariants,
          registerTextareaRef: (node) =>
            layout.registerTextareaRef(`solutionVariants:${rowId}`, node),
          onFocus: () => editing.handleFieldFocus(rowId),
          onBlur: (value) => {
            editing.commitTextEdit(rowId, { solutionVariants: value })
            editing.handleFieldBlur(rowId)
          },
          onKeyDown: (event) => {
            if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) {
              return
            }
            event.preventDefault()
            editing.commitTextEdit(rowId, {
              solutionVariants: event.currentTarget.value,
            })
          },
          onInput: autoGrowTextarea,
        },
        possiblyRemovable: {
          checked: edit.possiblyRemovable,
          onChange: (checked) =>
            editing.commitEdit(rowId, { possiblyRemovable: checked }),
          onFocus: () => editing.handleFieldFocus(rowId),
          onBlur: () => editing.handleFieldBlur(rowId),
        },
        ratingCells: editing.renderRatingCells({
          edit,
          isParentRow: row.children.length > 0,
          row,
          onCommitEdit: (patch) => editing.commitEdit(rowId, patch),
        }),
        renderSignature: [
          edit.title,
          edit.object,
          edit.overcomplication,
          edit.importance,
          edit.blocksMoney,
          edit.currentProblems,
          edit.solutionVariants,
          edit.possiblyRemovable ? "1" : "0",
        ].join("::"),
      }
    }

    return next
  }, [editing, layout, treeData.rows])

  return {
    currentWorkspaceId,
    isCreatingWorkspace,
    isDeletingWorkspaceId,
    isWorkspaceLoading,
    isRenamingWorkspaceId,
    workspaceErrorText,
    workspaces,
    currentWorkspaceName,
    errorText: treeData.errorText,
    isLoading: treeData.isLoading,
    rows,
    numberingById: treeData.numberingById,
    collapsedRowIds,
    rowUiById,
    dnd: dndOverlay.dnd,
    layout,
    overlayAddIndicators: dndOverlay.overlayAddIndicators,
    overlayDropY: dndOverlay.overlayDropY,
    overlayNestTarget: dndOverlay.overlayNestTarget,
    tableFrame: {
      FRAME_X_PX,
      LEFT_GUTTER_WIDTH_PX,
      WORK_CONTENT_INDENT_PX,
      CELL_INLINE_PAD_PX,
      STRUCTURE_LINE_WIDTH_PX,
      CONTENT_START_X_PX,
      TREE_LEVEL_OFFSET_PX,
    },
    handlers: {
      createRowAtPosition: treeData.createRowAtPosition,
      deleteRow: treeData.deleteRow,
      toggleRowCollapse,
      renderSwitcher,
    },
    workspaceRatingFieldConfigs: tableScoreHeaders,
  }
}
