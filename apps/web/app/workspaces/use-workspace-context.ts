"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { WorkspaceSummary } from "./types"

function normalizeWorkspace(value: unknown): WorkspaceSummary | null {
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
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
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

  const refresh = useCallback(async () => {
    setIsLoading(true)

    try {
      const response = await fetch("/api/workspaces", { cache: "no-store" })
      const json = await response.json()

      if (!response.ok) {
        throw new Error(mapErrorMessage(json))
      }

      const nextWorkspaces: WorkspaceSummary[] = Array.isArray(json?.data)
        ? json.data
            .map(normalizeWorkspace)
            .filter(
              (
                workspace: WorkspaceSummary | null,
              ): workspace is WorkspaceSummary => workspace !== null,
            )
        : []

      setWorkspaces(nextWorkspaces)
      setCurrentWorkspaceId((current) => {
        if (
          current &&
          nextWorkspaces.some((workspace) => workspace.id === current)
        ) {
          return current
        }

        return nextWorkspaces[0]?.id ?? null
      })
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
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const openWorkspace = useCallback(
    (workspaceId: string) => {
      if (!workspaces.some((workspace) => workspace.id === workspaceId)) {
        return
      }

      setCurrentWorkspaceId(workspaceId)
      setErrorText("")
    },
    [workspaces],
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

      setWorkspaces((current) => [...current, created])
      setCurrentWorkspaceId(created.id)
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
          `/api/workspaces/${encodeURIComponent(workspaceId)}`,
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

        const renamed = normalizeWorkspace(json?.data)
        if (!renamed) {
          throw new Error("Не удалось переименовать рабочее пространство.")
        }

        setWorkspaces((current) =>
          current.map((workspace) =>
            workspace.id === renamed.id ? renamed : workspace,
          ),
        )
        setErrorText("")
        return renamed
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

  const deleteWorkspace = useCallback(async (workspaceId: string) => {
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

      setWorkspaces((current) => {
        const next = current.filter((workspace) => workspace.id !== workspaceId)
        setCurrentWorkspaceId((active) => {
          if (active !== workspaceId) {
            return active
          }
          return next[0]?.id ?? null
        })
        return next
      })
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
  }, [])

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
    openWorkspace,
    refresh,
  }
}
