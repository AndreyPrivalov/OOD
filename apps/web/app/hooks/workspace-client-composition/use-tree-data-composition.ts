"use client"

import { useMemo, useRef } from "react"
import {
  type TreeSelectorCache,
  deriveTreeSelectors,
} from "../../state/tree-selectors"
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
  const selectorCacheRef = useRef<TreeSelectorCache | null>(null)

  const selectors = useMemo(() => {
    const cache = deriveTreeSelectors(treeData.tree, selectorCacheRef.current)
    selectorCacheRef.current = cache
    return cache.snapshot
  }, [treeData.tree])

  return {
    ...treeData,
    rows: selectors.rows,
    numberingById: selectors.numberingById,
    siblingsByParent: selectors.siblingsByParent,
    rowsById: selectors.rowsById,
  }
}
