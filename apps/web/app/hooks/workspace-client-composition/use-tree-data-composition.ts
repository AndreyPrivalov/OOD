"use client"

import { useMemo } from "react"
import {
  type FlatRow,
  buildTreeNumbering,
  flattenTree,
} from "../../state/workspace-tree-state"
import { useWorkspaceTreeData } from "../use-workspace-tree-data"

type UseWorkspaceTreeDataCompositionOptions = {
  currentWorkspaceId: string | null
  discardPendingSave: (id: string) => void
  isDev: boolean
  onCreateFocusRow: (rowId: string) => void
  onDeleteRow: (rowId: string) => void
}

export function useWorkspaceTreeDataComposition(
  options: UseWorkspaceTreeDataCompositionOptions,
) {
  const treeData = useWorkspaceTreeData(options)

  const rows = useMemo(() => flattenTree(treeData.tree), [treeData.tree])
  const numberingById = useMemo(
    () => buildTreeNumbering(treeData.tree),
    [treeData.tree],
  )

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

  return {
    ...treeData,
    rows,
    numberingById,
    siblingsByParent,
    rowsById,
  }
}
