"use client"

import {
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import {
  type HistoryEntry,
  type HistoryRowSnapshot,
  type WorkspaceHistoryState,
  areTreesEquivalent,
  clearWorkspaceHistory,
  findBranch,
  getRowPlacement,
  loadWorkspaceHistory,
  makeEmptyHistory,
  recordHistoryEntry,
  remapHistoryIds,
  removeBranchFromTree,
  restoreBranchIntoTree,
  saveWorkspaceHistory,
} from "../history/workspace-history"
import {
  type WorkTreeNode,
  applyOptimisticCreate,
  applyOptimisticMove,
  mapWorkItemErrorText,
  normalizeTreeData,
  patchTreeRow,
} from "../state/workspace-tree-state"
import {
  WorkItemRequestError,
  createWorkItem,
  deleteWorkItem,
  fetchWorkItems,
  moveWorkItem,
  patchWorkItem,
  restoreWorkItemBranch,
} from "../work-item-client"
import { attachSaveRowDeferredError } from "../work-item-editing/save-result"
import {
  WorkspaceMetricRequestError,
  createWorkspaceMetric,
  deleteWorkspaceMetric,
  restoreWorkspaceMetric,
  updateWorkspaceMetric,
} from "../workspace-metric-client"
import type { WorkspaceMetricSummary } from "../workspaces/types"
import { mapSettingsErrorMessage } from "../workspaces/workspace-settings"

type UseWorkspaceTreeDataOptions = {
  currentWorkspaceId: string | null
  discardPendingSave: (id: string) => void
  isDev: boolean
  onWorkspaceMetricsChange: (
    workspaceId: string,
    metrics: WorkspaceMetricSummary[],
  ) => void
  onCreateFocusRow: (rowId: string) => void
  onDeleteRow: (rowId: string) => void
  workspaceMetrics: WorkspaceMetricSummary[]
}

const LOCAL_DRAFT_ROW_ID_PREFIX = "local-draft:"

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object"
}

function isLocalDraftRowId(id: string) {
  return id.startsWith(LOCAL_DRAFT_ROW_ID_PREFIX)
}

function removeLocalRow(nodes: WorkTreeNode[], rowId: string): WorkTreeNode[] {
  const nextNodes: WorkTreeNode[] = []
  let changed = false

  for (const node of nodes) {
    if (node.id === rowId) {
      changed = true
      continue
    }
    const nextChildren = removeLocalRow(node.children, rowId)
    if (nextChildren !== node.children) {
      changed = true
      nextNodes.push({ ...node, children: nextChildren })
      continue
    }
    nextNodes.push(node)
  }

  if (!changed) {
    return nodes
  }

  return nextNodes.map((node, index) => ({ ...node, siblingOrder: index }))
}

function removeMetricFromNodeMaps(
  nodes: WorkTreeNode[],
  metricId: string,
): WorkTreeNode[] {
  return nodes.map((node) => {
    const nextMetricValues = { ...(node.metricValues ?? {}) }
    const nextMetricAggregates = { ...(node.metricAggregates ?? {}) }
    delete nextMetricValues[metricId]
    delete nextMetricAggregates[metricId]

    return {
      ...node,
      metricValues: nextMetricValues,
      metricAggregates: nextMetricAggregates,
      children: removeMetricFromNodeMaps(node.children, metricId),
    }
  })
}

function restoreMetricValuesIntoTree(
  nodes: WorkTreeNode[],
  snapshot: {
    metric: { id: string }
    removedValues: Array<{
      workItemId: string
      value: "none" | "indirect" | "direct"
    }>
  },
): WorkTreeNode[] {
  let nextTree = removeMetricFromNodeMaps(nodes, snapshot.metric.id)
  for (const entry of snapshot.removedValues) {
    const row = findRow(nextTree, entry.workItemId)
    if (!row || row.children.length > 0) {
      continue
    }

    const nextMetricValues = { ...(row.metricValues ?? {}) }
    if (entry.value === "none") {
      delete nextMetricValues[snapshot.metric.id]
    } else {
      nextMetricValues[snapshot.metric.id] = entry.value
    }
    nextTree = patchTreeRow(nextTree, row.id, {
      metricValues: nextMetricValues,
    })
  }
  return nextTree
}

function findRow(nodes: WorkTreeNode[], rowId: string): WorkTreeNode | null {
  const queue = [...nodes]
  while (queue.length > 0) {
    const node = queue.shift()
    if (!node) {
      continue
    }
    if (node.id === rowId) {
      return node
    }
    queue.push(...node.children)
  }
  return null
}

function toHistoryBranchSnapshot(
  row: Pick<
    WorkTreeNode,
    | "id"
    | "workspaceId"
    | "title"
    | "object"
    | "possiblyRemovable"
    | "parentId"
    | "siblingOrder"
    | "overcomplication"
    | "importance"
    | "blocksMoney"
    | "metricValues"
    | "metricAggregates"
    | "currentProblems"
    | "solutionVariants"
  >,
): HistoryRowSnapshot {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    object: row.object,
    possiblyRemovable: row.possiblyRemovable,
    parentId: row.parentId,
    siblingOrder: row.siblingOrder,
    overcomplication: row.overcomplication,
    importance: row.importance,
    blocksMoney: row.blocksMoney,
    metricValues: { ...(row.metricValues ?? {}) },
    metricAggregates: { ...(row.metricAggregates ?? {}) },
    currentProblems: [...row.currentProblems],
    solutionVariants: [...row.solutionVariants],
    children: [],
  }
}

function toTreePatch(row: HistoryRowSnapshot | WorkTreeNode) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    object: row.object,
    possiblyRemovable: row.possiblyRemovable,
    parentId: row.parentId,
    siblingOrder: row.siblingOrder,
    overcomplication: row.overcomplication,
    importance: row.importance,
    blocksMoney: row.blocksMoney,
    metricValues: { ...(row.metricValues ?? {}) },
    metricAggregates: { ...(row.metricAggregates ?? {}) },
    currentProblems: [...row.currentProblems],
    solutionVariants: [...row.solutionVariants],
  }
}

function buildPatchPayloadFromSnapshot(
  snapshot: HistoryRowSnapshot,
  currentRow?: Pick<WorkTreeNode, "metricValues"> | null,
) {
  const nextMetricValues = snapshot.metricValues ?? {}
  const currentMetricValues = currentRow?.metricValues ?? {}
  const metricPatch: Record<string, "none" | "indirect" | "direct"> = {}
  const metricIds = new Set([
    ...Object.keys(nextMetricValues),
    ...Object.keys(currentMetricValues),
  ])
  for (const metricId of metricIds) {
    const currentValue = currentMetricValues[metricId] ?? "none"
    const nextValue = nextMetricValues[metricId] ?? "none"
    if (currentValue !== nextValue) {
      metricPatch[metricId] = nextValue
    }
  }

  return {
    title: snapshot.title,
    object: snapshot.object,
    possiblyRemovable: snapshot.possiblyRemovable,
    overcomplication: snapshot.overcomplication,
    importance: snapshot.importance,
    blocksMoney: snapshot.blocksMoney,
    ...(Object.keys(metricPatch).length > 0
      ? { metricValues: metricPatch }
      : {}),
    currentProblems: [...snapshot.currentProblems],
    solutionVariants: [...snapshot.solutionVariants],
  }
}

function applyHistoryStateTransition(
  state: WorkspaceHistoryState,
  nextPresent: WorkTreeNode[],
  direction: "undo" | "redo",
): WorkspaceHistoryState | null {
  if (direction === "undo") {
    const entry = state.past.at(-1)
    if (!entry) {
      return null
    }
    return {
      version: state.version,
      past: state.past.slice(0, -1),
      present: nextPresent,
      future: [entry, ...state.future],
    }
  }

  const entry = state.future[0]
  if (!entry) {
    return null
  }
  return {
    version: state.version,
    past: [...state.past, entry],
    present: nextPresent,
    future: state.future.slice(1),
  }
}

const CREATE_ONLY_KEYS = new Set(["title", "object", "possiblyRemovable"])

function buildPostCreatePatchPayload(payload: Record<string, unknown>) {
  const patchPayload: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (CREATE_ONLY_KEYS.has(key)) {
      continue
    }
    patchPayload[key] = value
  }
  return patchPayload
}

export async function finalizeCreatedDraftRow(
  created: Record<string, unknown>,
  payload: Record<string, unknown>,
  patchRowById: (
    id: string,
    patchPayload: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>,
) {
  const patchPayload = buildPostCreatePatchPayload(payload)
  if (Object.keys(patchPayload).length === 0) {
    return created
  }

  const createdId = created.id
  if (typeof createdId !== "string" || createdId.length === 0) {
    return created
  }

  try {
    const patched = await patchRowById(createdId, patchPayload)
    return { ...created, ...patched }
  } catch (error) {
    return attachSaveRowDeferredError(created, error)
  }
}

export function useWorkspaceTreeData(options: UseWorkspaceTreeDataOptions) {
  const {
    currentWorkspaceId,
    discardPendingSave,
    isDev,
    onWorkspaceMetricsChange,
    onCreateFocusRow,
    onDeleteRow,
    workspaceMetrics,
  } = options
  const [tree, setTree] = useState<WorkTreeNode[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorText, setErrorText] = useState("")
  const [refreshCount, setRefreshCount] = useState(0)
  const [historyState, setHistoryState] =
    useState<WorkspaceHistoryState | null>(null)
  const [isApplyingHistory, setIsApplyingHistory] = useState(false)
  const draftSequenceRef = useRef(0)
  const treeRef = useRef(tree)
  const historyRef = useRef<WorkspaceHistoryState | null>(historyState)
  const workspaceMetricsRef = useRef(workspaceMetrics)

  useEffect(() => {
    treeRef.current = tree
  }, [tree])

  useEffect(() => {
    historyRef.current = historyState
  }, [historyState])

  useEffect(() => {
    workspaceMetricsRef.current = workspaceMetrics
  }, [workspaceMetrics])

  const toErrorText = useCallback((error: unknown) => {
    if (error instanceof WorkItemRequestError) {
      return mapWorkItemErrorText(error.payload)
    }
    if (error instanceof WorkspaceMetricRequestError) {
      return mapSettingsErrorMessage(
        error.payload,
        "Не удалось выполнить действие с метрикой.",
      )
    }
    return error instanceof Error ? error.message : "Неизвестная ошибка."
  }, [])

  const commitTree = useCallback((nextTree: WorkTreeNode[]) => {
    treeRef.current = nextTree
    setTree(nextTree)
  }, [])

  const updateTree = useCallback(
    (nextTree: SetStateAction<WorkTreeNode[]>) => {
      const resolved =
        typeof nextTree === "function" ? nextTree(treeRef.current) : nextTree
      commitTree(resolved)
    },
    [commitTree],
  )

  const commitHistory = useCallback(
    (nextHistory: WorkspaceHistoryState | null) => {
      historyRef.current = nextHistory
      setHistoryState(nextHistory)
      if (!currentWorkspaceId) {
        return
      }
      if (!nextHistory) {
        clearWorkspaceHistory(currentWorkspaceId)
        return
      }
      saveWorkspaceHistory(currentWorkspaceId, nextHistory)
    },
    [currentWorkspaceId],
  )

  const pushHistoryEntry = useCallback(
    (entry: HistoryEntry, nextPresent: WorkTreeNode[]) => {
      const base = historyRef.current ?? makeEmptyHistory(treeRef.current)
      commitHistory(recordHistoryEntry(base, entry, nextPresent))
    },
    [commitHistory],
  )

  const refreshTree = useCallback(
    async (opts?: { silent?: boolean; reconcileHistory?: boolean }) => {
      if (!currentWorkspaceId) {
        commitTree([])
        commitHistory(null)
        setIsLoading(false)
        return
      }

      if (!opts?.silent) {
        setIsLoading(true)
      }

      try {
        const data = normalizeTreeData(await fetchWorkItems(currentWorkspaceId))
        const existingHistory = historyRef.current

        if (opts?.reconcileHistory && existingHistory) {
          if (areTreesEquivalent(data, existingHistory.present)) {
            commitTree(data)
            commitHistory({ ...existingHistory, present: data })
          } else {
            commitTree(data)
            commitHistory(makeEmptyHistory(data))
          }
        } else {
          commitTree(data)
          commitHistory(makeEmptyHistory(data))
        }

        if (isDev) {
          setRefreshCount((current) => current + 1)
        }
        setErrorText("")
      } catch (error) {
        setErrorText(toErrorText(error))
      } finally {
        if (!opts?.silent) {
          setIsLoading(false)
        }
      }
    },
    [commitHistory, commitTree, currentWorkspaceId, isDev, toErrorText],
  )

  useEffect(() => {
    if (!currentWorkspaceId) {
      commitTree([])
      commitHistory(null)
      setIsLoading(false)
      setErrorText("")
      return
    }

    const restoredHistory = loadWorkspaceHistory(currentWorkspaceId)
    if (restoredHistory) {
      commitTree(restoredHistory.present)
      commitHistory(restoredHistory)
      setIsLoading(false)
      void refreshTree({ silent: true, reconcileHistory: true })
      return
    }

    commitTree([])
    commitHistory(makeEmptyHistory([]))
    void refreshTree()
  }, [commitHistory, commitTree, currentWorkspaceId, refreshTree])

  const createRowAtPosition = useCallback(
    async (parentId: string | null, targetIndex: number) => {
      if (!currentWorkspaceId) {
        return
      }

      draftSequenceRef.current += 1
      const draftId = `${LOCAL_DRAFT_ROW_ID_PREFIX}${draftSequenceRef.current}`
      commitTree(
        applyOptimisticCreate(
          treeRef.current,
          {
            id: draftId,
            workspaceId: currentWorkspaceId,
            title: "",
            object: null,
            parentId,
            siblingOrder: targetIndex,
            possiblyRemovable: false,
            overcomplication: null,
            importance: null,
            blocksMoney: null,
            currentProblems: [],
            solutionVariants: [],
          },
          parentId,
          targetIndex,
        ),
      )
      setErrorText("")
      onCreateFocusRow(draftId)
    },
    [commitTree, currentWorkspaceId, onCreateFocusRow],
  )

  const deleteRow = useCallback(
    async (id: string) => {
      if (isLocalDraftRowId(id)) {
        discardPendingSave(id)
        commitTree(removeLocalRow(treeRef.current, id))
        onDeleteRow(id)
        return
      }

      const previousTree = treeRef.current
      const optimisticTree = removeLocalRow(previousTree, id)
      const branch = findBranch(previousTree, id)
      const placement = getRowPlacement(previousTree, id)
      if (
        optimisticTree === previousTree ||
        !branch ||
        !placement ||
        !currentWorkspaceId
      ) {
        return
      }

      discardPendingSave(id)
      commitTree(optimisticTree)
      onDeleteRow(id)

      try {
        await deleteWorkItem(id)
        pushHistoryEntry(
          {
            type: "deleteBranch",
            targetParentId: placement.parentId,
            targetIndex: placement.index,
            branch,
          },
          optimisticTree,
        )
        setErrorText("")
      } catch (error) {
        commitTree(previousTree)
        void refreshTree({ silent: true })
        setErrorText(toErrorText(error))
      }
    },
    [
      commitTree,
      currentWorkspaceId,
      discardPendingSave,
      onDeleteRow,
      pushHistoryEntry,
      refreshTree,
      toErrorText,
    ],
  )

  const saveRow = useCallback(
    async (id: string, payload: Record<string, unknown>) => {
      if (!isLocalDraftRowId(id)) {
        return patchWorkItem(id, payload)
      }

      const draftRow = findRow(treeRef.current, id)
      if (!draftRow) {
        return null
      }

      const nextTitle =
        typeof payload.title === "string" ? payload.title : draftRow.title
      if (nextTitle.trim().length === 0) {
        return null
      }

      const nextObject = Object.prototype.hasOwnProperty.call(payload, "object")
        ? ((payload.object as string | null) ?? null)
        : draftRow.object
      const nextPossiblyRemovable =
        typeof payload.possiblyRemovable === "boolean"
          ? payload.possiblyRemovable
          : draftRow.possiblyRemovable

      const created = await createWorkItem({
        workspaceId: draftRow.workspaceId,
        title: nextTitle,
        object: nextObject,
        parentId: draftRow.parentId,
        siblingOrder: draftRow.siblingOrder,
        possiblyRemovable: nextPossiblyRemovable,
      })

      if (!isObjectLike(created)) {
        return created
      }
      return finalizeCreatedDraftRow(created, payload, patchWorkItem)
    },
    [],
  )

  const moveRow = useCallback(
    async (id: string, targetParentId: string | null, targetIndex: number) => {
      const previousTree = treeRef.current
      const optimisticTree = applyOptimisticMove(
        previousTree,
        id,
        targetParentId,
        targetIndex,
      )
      if (optimisticTree === previousTree) {
        return
      }

      if (isLocalDraftRowId(id)) {
        commitTree(optimisticTree)
        return
      }

      const previousPlacement = getRowPlacement(previousTree, id)
      if (!previousPlacement) {
        return
      }

      commitTree(optimisticTree)
      try {
        await moveWorkItem(id, {
          targetParentId,
          targetIndex,
        })
        pushHistoryEntry(
          {
            type: "move",
            rowId: id,
            fromParentId: previousPlacement.parentId,
            fromIndex: previousPlacement.index,
            toParentId: targetParentId,
            toIndex: targetIndex,
          },
          optimisticTree,
        )
        setErrorText("")
      } catch (error) {
        commitTree(previousTree)
        void refreshTree({ silent: true })
        setErrorText(toErrorText(error))
      }
    },
    [commitTree, pushHistoryEntry, refreshTree, toErrorText],
  )

  const recordPersistedChange = useCallback(
    (
      change:
        | { kind: "patch"; before: WorkTreeNode; after: WorkTreeNode }
        | { kind: "create"; before: WorkTreeNode; after: WorkTreeNode },
    ) => {
      if (change.kind === "patch") {
        pushHistoryEntry(
          {
            type: "patch",
            before: toHistoryBranchSnapshot(change.before),
            after: toHistoryBranchSnapshot(change.after),
          },
          treeRef.current,
        )
        return
      }

      pushHistoryEntry(
        {
          type: "createBranch",
          targetParentId: change.after.parentId,
          targetIndex: change.after.siblingOrder,
          branch: toHistoryBranchSnapshot(change.after),
        },
        treeRef.current,
      )
    },
    [pushHistoryEntry],
  )

  const createMetricInCurrentWorkspace = useCallback(
    async (
      input: { shortName: string; description: string | null },
      workspaceIdOverride?: string,
    ) => {
      const workspaceId = workspaceIdOverride ?? currentWorkspaceId
      if (!workspaceId) {
        throw new Error("Рабочее пространство не выбрано.")
      }

      const beforeMetrics =
        workspaceId === currentWorkspaceId ? workspaceMetricsRef.current : []
      const nextMetrics = await createWorkspaceMetric(workspaceId, input)
      onWorkspaceMetricsChange(workspaceId, nextMetrics)

      if (workspaceId !== currentWorkspaceId) {
        setErrorText("")
        return nextMetrics
      }

      const createdMetric = nextMetrics.find(
        (metric) => !beforeMetrics.some((before) => before.id === metric.id),
      )
      if (createdMetric) {
        const targetIndex = nextMetrics.findIndex(
          (metric) => metric.id === createdMetric.id,
        )
        pushHistoryEntry(
          {
            type: "metricCatalogCreate",
            metric: createdMetric,
            targetIndex: targetIndex < 0 ? nextMetrics.length : targetIndex,
          },
          treeRef.current,
        )
      }

      setErrorText("")
      return nextMetrics
    },
    [currentWorkspaceId, onWorkspaceMetricsChange, pushHistoryEntry],
  )

  const updateMetricInCurrentWorkspace = useCallback(
    async (
      metricId: string,
      input: { shortName: string; description: string | null },
      workspaceIdOverride?: string,
    ) => {
      const workspaceId = workspaceIdOverride ?? currentWorkspaceId
      if (!workspaceId) {
        throw new Error("Рабочее пространство не выбрано.")
      }

      const beforeMetric = workspaceMetricsRef.current.find(
        (metric) => metric.id === metricId,
      )
      const nextMetrics = await updateWorkspaceMetric(
        workspaceId,
        metricId,
        input,
      )
      onWorkspaceMetricsChange(workspaceId, nextMetrics)

      if (workspaceId !== currentWorkspaceId) {
        setErrorText("")
        return nextMetrics
      }

      const afterMetric = nextMetrics.find((metric) => metric.id === metricId)
      if (
        beforeMetric &&
        afterMetric &&
        (beforeMetric.shortName !== afterMetric.shortName ||
          beforeMetric.description !== afterMetric.description)
      ) {
        pushHistoryEntry(
          {
            type: "metricCatalogUpdate",
            before: beforeMetric,
            after: afterMetric,
          },
          treeRef.current,
        )
      }

      setErrorText("")
      return nextMetrics
    },
    [currentWorkspaceId, onWorkspaceMetricsChange, pushHistoryEntry],
  )

  const deleteMetricInCurrentWorkspace = useCallback(
    async (metricId: string, workspaceIdOverride?: string) => {
      const workspaceId = workspaceIdOverride ?? currentWorkspaceId
      if (!workspaceId) {
        throw new Error("Рабочее пространство не выбрано.")
      }

      const response = await deleteWorkspaceMetric(workspaceId, metricId)
      if (!response.deletedMetricSnapshot) {
        throw new Error("Сервер не вернул snapshot удалённой метрики.")
      }

      onWorkspaceMetricsChange(workspaceId, response.metrics)
      if (workspaceId !== currentWorkspaceId) {
        setErrorText("")
        return response.metrics
      }

      const nextTree = removeMetricFromNodeMaps(treeRef.current, metricId)
      commitTree(nextTree)
      pushHistoryEntry(
        {
          type: "metricCatalogDelete",
          snapshot: response.deletedMetricSnapshot,
        },
        nextTree,
      )
      setErrorText("")
      return response.metrics
    },
    [
      commitTree,
      currentWorkspaceId,
      onWorkspaceMetricsChange,
      pushHistoryEntry,
    ],
  )

  const applyHistoryDirection = useCallback(
    async (direction: "undo" | "redo") => {
      if (isApplyingHistory || !currentWorkspaceId) {
        return
      }

      const currentHistory = historyRef.current
      if (!currentHistory) {
        return
      }

      const entry =
        direction === "undo"
          ? currentHistory.past.at(-1)
          : currentHistory.future[0]
      if (!entry) {
        return
      }

      setIsApplyingHistory(true)
      try {
        let workingHistory = currentHistory
        let nextPresent = currentHistory.present

        if (entry.type === "patch") {
          const snapshot = direction === "undo" ? entry.before : entry.after
          const currentRow = findRow(currentHistory.present, snapshot.id)
          await patchWorkItem(
            snapshot.id,
            buildPatchPayloadFromSnapshot(snapshot, currentRow),
          )
          nextPresent = patchTreeRow(
            currentHistory.present,
            snapshot.id,
            toTreePatch(snapshot),
          )
        } else if (entry.type === "move") {
          const targetParentId =
            direction === "undo" ? entry.fromParentId : entry.toParentId
          const targetIndex =
            direction === "undo" ? entry.fromIndex : entry.toIndex
          await moveWorkItem(entry.rowId, {
            targetParentId,
            targetIndex,
          })
          nextPresent = applyOptimisticMove(
            currentHistory.present,
            entry.rowId,
            targetParentId,
            targetIndex,
          )
        } else if (entry.type === "metricCatalogCreate") {
          if (direction === "undo") {
            const response = await deleteWorkspaceMetric(
              currentWorkspaceId,
              entry.metric.id,
            )
            onWorkspaceMetricsChange(currentWorkspaceId, response.metrics)
            nextPresent = removeMetricFromNodeMaps(
              workingHistory.present,
              entry.metric.id,
            )
          } else {
            const nextMetrics = await restoreWorkspaceMetric(
              currentWorkspaceId,
              {
                metric: {
                  ...entry.metric,
                },
                targetIndex: entry.targetIndex,
                removedValues: [],
              },
            )
            onWorkspaceMetricsChange(currentWorkspaceId, nextMetrics)
            nextPresent = workingHistory.present
          }
        } else if (entry.type === "metricCatalogUpdate") {
          const metric = direction === "undo" ? entry.before : entry.after
          const nextMetrics = await updateWorkspaceMetric(
            currentWorkspaceId,
            metric.id,
            {
              shortName: metric.shortName,
              description: metric.description,
            },
          )
          onWorkspaceMetricsChange(currentWorkspaceId, nextMetrics)
          nextPresent = workingHistory.present
        } else if (entry.type === "metricCatalogDelete") {
          if (direction === "undo") {
            const nextMetrics = await restoreWorkspaceMetric(
              currentWorkspaceId,
              entry.snapshot,
            )
            onWorkspaceMetricsChange(currentWorkspaceId, nextMetrics)
            nextPresent = restoreMetricValuesIntoTree(
              workingHistory.present,
              entry.snapshot,
            )
          } else {
            const response = await deleteWorkspaceMetric(
              currentWorkspaceId,
              entry.snapshot.metric.id,
            )
            onWorkspaceMetricsChange(currentWorkspaceId, response.metrics)
            nextPresent = removeMetricFromNodeMaps(
              workingHistory.present,
              entry.snapshot.metric.id,
            )
          }
        } else if (entry.type === "deleteBranch") {
          if (direction === "undo") {
            const response = await restoreWorkItemBranch({
              workspaceId: currentWorkspaceId,
              targetParentId: entry.targetParentId,
              targetIndex: entry.targetIndex,
              root: entry.branch,
            })
            workingHistory = remapHistoryIds(workingHistory, response.idMap)
            const remappedEntry = workingHistory.past.at(-1)
            if (!remappedEntry || remappedEntry.type !== "deleteBranch") {
              return
            }
            nextPresent = restoreBranchIntoTree(
              workingHistory.present,
              remappedEntry.branch,
              remappedEntry.targetParentId,
              remappedEntry.targetIndex,
            )
          } else {
            await deleteWorkItem(entry.branch.id)
            nextPresent = removeBranchFromTree(
              workingHistory.present,
              entry.branch.id,
            )
          }
        } else if (direction === "undo") {
          await deleteWorkItem(entry.branch.id)
          nextPresent = removeBranchFromTree(
            workingHistory.present,
            entry.branch.id,
          )
        } else {
          const response = await restoreWorkItemBranch({
            workspaceId: currentWorkspaceId,
            targetParentId: entry.targetParentId,
            targetIndex: entry.targetIndex,
            root: entry.branch,
          })
          workingHistory = remapHistoryIds(workingHistory, response.idMap)
          const remappedEntry = workingHistory.future[0]
          if (!remappedEntry || remappedEntry.type !== "createBranch") {
            return
          }
          nextPresent = restoreBranchIntoTree(
            workingHistory.present,
            remappedEntry.branch,
            remappedEntry.targetParentId,
            remappedEntry.targetIndex,
          )
        }

        const nextHistory = applyHistoryStateTransition(
          workingHistory,
          nextPresent,
          direction,
        )
        if (!nextHistory) {
          return
        }
        commitTree(nextPresent)
        commitHistory(nextHistory)
        setErrorText("")
      } catch (error) {
        setErrorText(toErrorText(error))
      } finally {
        setIsApplyingHistory(false)
      }
    },
    [
      commitHistory,
      commitTree,
      currentWorkspaceId,
      isApplyingHistory,
      onWorkspaceMetricsChange,
      toErrorText,
    ],
  )

  return {
    tree,
    setTree: updateTree,
    isLoading,
    errorText,
    setErrorText,
    refreshTree,
    createRowAtPosition,
    deleteRow,
    saveRow,
    moveRow,
    toErrorText,
    refreshCount,
    canUndo: (historyState?.past.length ?? 0) > 0,
    canRedo: (historyState?.future.length ?? 0) > 0,
    isApplyingHistory,
    recordPersistedChange,
    createMetricInCurrentWorkspace,
    updateMetricInCurrentWorkspace,
    deleteMetricInCurrentWorkspace,
    undo: () => applyHistoryDirection("undo"),
    redo: () => applyHistoryDirection("redo"),
  }
}
