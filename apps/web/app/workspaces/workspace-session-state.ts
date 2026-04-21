"use client"

import type { WorkspaceViewMode } from "@ood/ui"

const ACTIVE_WORKSPACE_KEY = "ood:workspace-ui:v1:active-workspace"
const WORKSPACE_VIEW_MODE_KEY_PREFIX = "ood:workspace-ui:v1:view-mode:"
const WORKSPACE_VIEW_MODE_VALUES: WorkspaceViewMode[] = ["table-only", "split"]

function getSessionStorage() {
  if (typeof window === "undefined") {
    return null
  }

  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function normalizeSessionValue(value: string | null): string | null {
  const trimmed = value?.trim() ?? ""
  return trimmed.length > 0 ? trimmed : null
}

function isWorkspaceViewMode(value: string): value is WorkspaceViewMode {
  return WORKSPACE_VIEW_MODE_VALUES.includes(value as WorkspaceViewMode)
}

export function readActiveWorkspaceId(): string | null {
  const storage = getSessionStorage()
  if (!storage) {
    return null
  }

  return normalizeSessionValue(storage.getItem(ACTIVE_WORKSPACE_KEY))
}

export function writeActiveWorkspaceId(workspaceId: string | null) {
  const storage = getSessionStorage()
  if (!storage) {
    return
  }

  if (!workspaceId) {
    storage.removeItem(ACTIVE_WORKSPACE_KEY)
    return
  }

  storage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId)
}

export function readWorkspaceViewMode(
  workspaceId: string | null,
): WorkspaceViewMode | null {
  const storage = getSessionStorage()
  if (!storage || !workspaceId) {
    return null
  }

  const value = normalizeSessionValue(
    storage.getItem(`${WORKSPACE_VIEW_MODE_KEY_PREFIX}${workspaceId}`),
  )
  if (!value || !isWorkspaceViewMode(value)) {
    return null
  }

  return value
}

export function writeWorkspaceViewMode(
  workspaceId: string | null,
  viewMode: WorkspaceViewMode | null,
) {
  const storage = getSessionStorage()
  if (!storage || !workspaceId) {
    return
  }

  const key = `${WORKSPACE_VIEW_MODE_KEY_PREFIX}${workspaceId}`

  if (!viewMode) {
    storage.removeItem(key)
    return
  }

  storage.setItem(key, viewMode)
}
