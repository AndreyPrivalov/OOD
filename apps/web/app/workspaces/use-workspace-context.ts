"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { WorkspaceMetricSummary, WorkspaceSummary } from "./types"
import {
  readActiveWorkspaceId,
  writeActiveWorkspaceId,
  writeWorkspaceViewMode,
} from "./workspace-session-state"
import { parseWorkspaceSettings } from "./workspace-settings"

type WorkspaceBaseSummary = Omit<WorkspaceSummary, "metrics">

function normalizeWorkspace(value: unknown): WorkspaceBaseSummary | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const id =
    "id" in value && typeof value.id === "string" ? value.id.trim() : ""
  const name =
    "name" in value && typeof value.name === "string" ? value.name.trim() : ""

  if (id.length === 0 || name.length === 0) {
    return null
  }

  return { id, name }
}

function mapErrorMessage(payload: unknown) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    if (payload.error === "INVALID_PAYLOAD") {
      return "Некорректные данные рабочего пространства."
    }
    if (payload.error === "WORKSPACE_NOT_FOUND") {
      return "Рабочее пространство не найдено."
    }
    if (payload.error === "DEFAULT_WORKSPACE_PROTECTED") {
      return "Базовое рабочее пространство нельзя удалить."
    }
  }

  return "Не удалось загрузить рабочие пространства."
}

export function useWorkspaceContext() {
  const [workspaceBases, setWorkspaceBases] = useState<WorkspaceBaseSummary[]>(
    [],
  )
  const [metricsByWorkspaceId, setMetricsByWorkspaceId] = useState<
    Record<string, WorkspaceMetricSummary[]>
  >({})
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(
    null,
  )
  const [errorText, setErrorText] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [isDeletingWorkspaceId, setIsDeletingWorkspaceId] = useState<
    string | null
  >(null)
  const [isRenamingWorkspaceId, setIsRenamingWorkspaceId] = useState<
    string | null
  >(null)
  const currentWorkspaceIdRef = useRef<string | null>(currentWorkspaceId)

  useEffect(() => {
    currentWorkspaceIdRef.current = currentWorkspaceId
  }, [currentWorkspaceId])

  useEffect(() => {
    writeActiveWorkspaceId(currentWorkspaceId)
  }, [currentWorkspaceId])

  const loadWorkspaceMetrics = useCallback(async (workspaceId: string) => {
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/settings`,
        { cache: "no-store" },
      )
      const json = await response.json()
      if (!response.ok) {
        return null
      }
      const parsed = parseWorkspaceSettings(json)
      if (!parsed || parsed.workspace.id !== workspaceId) {
        return null
      }
      return parsed.metrics
    } catch {
      return null
    }
  }, [])

  const refresh = useCallback(async () => {
    setIsLoading(true)

    try {
      const response = await fetch("/api/workspaces", { cache: "no-store" })
      const json = await response.json()

      if (!response.ok) {
        throw new Error(mapErrorMessage(json))
      }

      const nextWorkspaces: WorkspaceBaseSummary[] = Array.isArray(json?.data)
        ? json.data
            .map(normalizeWorkspace)
            .filter(
              (
                workspace: WorkspaceBaseSummary | null,
              ): workspace is WorkspaceBaseSummary => workspace !== null,
            )
        : []

      const storedWorkspaceId = readActiveWorkspaceId()
      const nextCurrentWorkspaceId =
        storedWorkspaceId &&
        nextWorkspaces.some((workspace) => workspace.id === storedWorkspaceId)
          ? storedWorkspaceId
          : currentWorkspaceIdRef.current &&
              nextWorkspaces.some(
                (workspace) => workspace.id === currentWorkspaceIdRef.current,
              )
            ? currentWorkspaceIdRef.current
            : (nextWorkspaces[0]?.id ?? null)

      const currentWorkspaceMetrics =
        nextCurrentWorkspaceId === null
          ? null
          : await loadWorkspaceMetrics(nextCurrentWorkspaceId)

      setWorkspaceBases(nextWorkspaces)
      setMetricsByWorkspaceId((current) => {
        const next: Record<string, WorkspaceMetricSummary[]> = {}
        for (const workspace of nextWorkspaces) {
          next[workspace.id] = current[workspace.id] ?? []
        }
        if (nextCurrentWorkspaceId && currentWorkspaceMetrics) {
          next[nextCurrentWorkspaceId] = currentWorkspaceMetrics
        }
        return next
      })
      setCurrentWorkspaceId(nextCurrentWorkspaceId)
      writeActiveWorkspaceId(nextCurrentWorkspaceId)
      setErrorText("")
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить рабочие пространства.",
      )
    } finally {
      setIsLoading(false)
    }
  }, [loadWorkspaceMetrics])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const openWorkspace = useCallback(
    (workspaceId: string) => {
      if (!workspaceBases.some((workspace) => workspace.id === workspaceId)) {
        return
      }

      setCurrentWorkspaceId(workspaceId)
      writeActiveWorkspaceId(workspaceId)
      setErrorText("")
    },
    [workspaceBases],
  )

  const createWorkspace = useCallback(async (name: string) => {
    setIsCreating(true)

    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const json = await response.json()

      if (!response.ok) {
        throw new Error(mapErrorMessage(json))
      }

      const created = normalizeWorkspace(json?.data)
      if (!created) {
        throw new Error("Не удалось создать рабочее пространство.")
      }

      setWorkspaceBases((current) => [...current, created])
      setMetricsByWorkspaceId((current) => ({
        ...current,
        [created.id]: [],
      }))
      setCurrentWorkspaceId(created.id)
      writeActiveWorkspaceId(created.id)
      setErrorText("")
      return created
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? error.message
          : "Не удалось создать рабочее пространство.",
      )
      throw error
    } finally {
      setIsCreating(false)
    }
  }, [])

  const renameWorkspace = useCallback(
    async (workspaceId: string, name: string) => {
      setIsRenamingWorkspaceId(workspaceId)

      try {
        const response = await fetch(
          `/api/workspaces/${encodeURIComponent(workspaceId)}/settings`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          },
        )
        const json = await response.json()

        if (!response.ok) {
          throw new Error(mapErrorMessage(json))
        }

        const parsed = parseWorkspaceSettings(json)
        if (!parsed) {
          throw new Error("Не удалось переименовать рабочее пространство.")
        }

        setWorkspaceBases((current) =>
          current.map((workspace) =>
            workspace.id === parsed.workspace.id ? parsed.workspace : workspace,
          ),
        )
        setMetricsByWorkspaceId((current) => ({
          ...current,
          [parsed.workspace.id]: parsed.metrics,
        }))
        setErrorText("")
        return parsed.workspace
      } catch (error) {
        setErrorText(
          error instanceof Error
            ? error.message
            : "Не удалось переименовать рабочее пространство.",
        )
        throw error
      } finally {
        setIsRenamingWorkspaceId(null)
      }
    },
    [],
  )

  const deleteWorkspace = useCallback(
    async (workspaceId: string) => {
      setIsDeletingWorkspaceId(workspaceId)

      try {
        const response = await fetch(
          `/api/workspaces/${encodeURIComponent(workspaceId)}`,
          {
            method: "DELETE",
          },
        )
        const json = await response.json()

        if (!response.ok) {
          throw new Error(mapErrorMessage(json))
        }

        writeWorkspaceViewMode(workspaceId, null)
        const nextActiveWorkspaceId =
          currentWorkspaceIdRef.current === workspaceId
            ? null
            : currentWorkspaceIdRef.current
        setWorkspaceBases((current) => {
          const next = current.filter(
            (workspace) => workspace.id !== workspaceId,
          )
          setMetricsByWorkspaceId((metricsCurrent) => {
            const { [workspaceId]: _removed, ...rest } = metricsCurrent
            return rest
          })
          return next
        })
        if (nextActiveWorkspaceId === null) {
          const fallbackWorkspaceId =
            workspaceBases.find((workspace) => workspace.id !== workspaceId)
              ?.id ?? null
          setCurrentWorkspaceId(fallbackWorkspaceId)
          writeActiveWorkspaceId(fallbackWorkspaceId)
        }
        setErrorText("")
      } catch (error) {
        setErrorText(
          error instanceof Error
            ? error.message
            : "Не удалось удалить рабочее пространство.",
        )
        throw error
      } finally {
        setIsDeletingWorkspaceId(null)
      }
    },
    [workspaceBases],
  )

  const updateWorkspaceMetrics = useCallback(
    (workspaceId: string, metrics: WorkspaceMetricSummary[]) => {
      setMetricsByWorkspaceId((current) => ({
        ...current,
        [workspaceId]: metrics,
      }))
    },
    [],
  )

  const refreshWorkspaceMetrics = useCallback(
    async (workspaceId: string) => {
      const metrics = await loadWorkspaceMetrics(workspaceId)
      if (!metrics) {
        return
      }
      updateWorkspaceMetrics(workspaceId, metrics)
    },
    [loadWorkspaceMetrics, updateWorkspaceMetrics],
  )

  useEffect(() => {
    if (!currentWorkspaceId) {
      return
    }
    void refreshWorkspaceMetrics(currentWorkspaceId)
  }, [currentWorkspaceId, refreshWorkspaceMetrics])

  const workspaces = useMemo<WorkspaceSummary[]>(
    () =>
      workspaceBases.map((workspace) => ({
        ...workspace,
        metrics: metricsByWorkspaceId[workspace.id] ?? [],
      })),
    [metricsByWorkspaceId, workspaceBases],
  )

  const currentWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === currentWorkspaceId) ??
      null,
    [currentWorkspaceId, workspaces],
  )

  return {
    workspaces,
    currentWorkspace,
    currentWorkspaceId,
    errorText,
    isCreating,
    isLoading,
    isDeletingWorkspaceId,
    isRenamingWorkspaceId,
    createWorkspace,
    renameWorkspace,
    deleteWorkspace,
    updateWorkspaceMetrics,
    openWorkspace,
    refresh,
  }
}
