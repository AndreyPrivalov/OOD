"use client"

import { type FormEvent, useEffect, useRef, useState } from "react"
import type { WorkspaceSummary } from "./types"
import {
  type MetricDraft,
  type WorkspaceMetricSettingsView,
  type WorkspaceSettingsView,
  createMetricDrafts,
  mapSettingsErrorMessage,
  parseWorkspaceSettings,
} from "./workspace-settings"

type WorkspaceSwitcherProps = {
  currentWorkspaceId: string | null
  isCreating: boolean
  isDeletingWorkspaceId: string | null
  isLoading: boolean
  isRenamingWorkspaceId: string | null
  onCreateMetric: (
    workspaceId: string,
    input: { shortName: string; description: string | null },
  ) => Promise<WorkspaceMetricSettingsView[]>
  onCreateWorkspace: (name: string) => Promise<void>
  onDeleteMetric: (
    workspaceId: string,
    metricId: string,
  ) => Promise<WorkspaceMetricSettingsView[]>
  onDeleteWorkspace: (workspaceId: string) => Promise<void>
  onWorkspaceMetricsChange: (
    workspaceId: string,
    metrics: WorkspaceMetricSettingsView[],
  ) => void
  onOpenWorkspace: (workspaceId: string) => void
  onRenameWorkspace: (workspaceId: string, name: string) => Promise<void>
  onSaveMetric: (
    workspaceId: string,
    metricId: string,
    input: { shortName: string; description: string | null },
  ) => Promise<WorkspaceMetricSettingsView[]>
  workspaces: WorkspaceSummary[]
}

const CREATE_DRAFT_ID = "__create-workspace__"

export function WorkspaceSwitcher(props: WorkspaceSwitcherProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState("")
  const [settingsWorkspaceId, setSettingsWorkspaceId] = useState<string | null>(
    null,
  )
  const [settingsData, setSettingsData] =
    useState<WorkspaceSettingsView | null>(null)
  const [isSettingsLoading, setIsSettingsLoading] = useState(false)
  const [settingsErrorText, setSettingsErrorText] = useState("")
  const [renameDraft, setRenameDraft] = useState("")
  const [renameErrorText, setRenameErrorText] = useState("")
  const [isSavingRename, setIsSavingRename] = useState(false)
  const [createMetricDraft, setCreateMetricDraft] = useState<MetricDraft>({
    shortName: "",
    description: "",
  })
  const [createMetricErrorText, setCreateMetricErrorText] = useState("")
  const [isCreatingMetric, setIsCreatingMetric] = useState(false)
  const [isCreateMetricOpen, setIsCreateMetricOpen] = useState(false)
  const [metricDrafts, setMetricDrafts] = useState<Record<string, MetricDraft>>(
    {},
  )
  const [metricErrors, setMetricErrors] = useState<Record<string, string>>({})
  const [activeMetricSaveId, setActiveMetricSaveId] = useState<string | null>(
    null,
  )
  const [activeMetricDeleteId, setActiveMetricDeleteId] = useState<
    string | null
  >(null)
  const [isDeleteWorkspaceConfirm, setIsDeleteWorkspaceConfirm] =
    useState(false)
  const [deleteWorkspaceErrorText, setDeleteWorkspaceErrorText] = useState("")
  const inputRef = useRef<HTMLInputElement | null>(null)
  const settingsRequestRef = useRef(0)

  useEffect(() => {
    if (!editingId) {
      return
    }
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editingId])

  useEffect(() => {
    if (!settingsWorkspaceId) {
      return
    }
    if (
      !props.workspaces.some(
        (workspace) => workspace.id === settingsWorkspaceId,
      )
    ) {
      setSettingsWorkspaceId(null)
      setSettingsData(null)
      setSettingsErrorText("")
      setRenameErrorText("")
      setCreateMetricErrorText("")
      setMetricErrors({})
      setDeleteWorkspaceErrorText("")
      setIsDeleteWorkspaceConfirm(false)
    }
  }, [props.workspaces, settingsWorkspaceId])

  async function submitEdit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (!editingId) {
      return
    }

    const nextName = draftName.trim()
    if (nextName.length === 0) {
      setEditingId(null)
      setDraftName("")
      return
    }

    try {
      if (editingId === CREATE_DRAFT_ID) {
        await props.onCreateWorkspace(nextName)
      }
      setEditingId(null)
      setDraftName("")
    } catch {
      return
    }
  }

  function beginCreate() {
    setEditingId(CREATE_DRAFT_ID)
    setDraftName("")
  }

  function resetSettingsState() {
    setSettingsData(null)
    setSettingsErrorText("")
    setRenameDraft("")
    setRenameErrorText("")
    setCreateMetricDraft({ shortName: "", description: "" })
    setCreateMetricErrorText("")
    setIsCreateMetricOpen(false)
    setMetricDrafts({})
    setMetricErrors({})
    setActiveMetricSaveId(null)
    setActiveMetricDeleteId(null)
    setIsDeleteWorkspaceConfirm(false)
    setDeleteWorkspaceErrorText("")
  }

  function applySettings(nextSettings: WorkspaceSettingsView) {
    setSettingsData(nextSettings)
    props.onWorkspaceMetricsChange(
      nextSettings.workspace.id,
      nextSettings.metrics,
    )
    setRenameDraft(nextSettings.workspace.name)
    setRenameErrorText("")
    setCreateMetricDraft({ shortName: "", description: "" })
    setCreateMetricErrorText("")
    setMetricDrafts(createMetricDrafts(nextSettings.metrics))
    setMetricErrors({})
    setDeleteWorkspaceErrorText("")
  }

  async function loadWorkspaceSettings(workspaceId: string) {
    const requestId = settingsRequestRef.current + 1
    settingsRequestRef.current = requestId
    setIsSettingsLoading(true)
    setSettingsErrorText("")

    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/settings`,
        { cache: "no-store" },
      )
      const payload = await response.json()
      const parsed = parseWorkspaceSettings(payload)
      if (!response.ok) {
        throw new Error(
          mapSettingsErrorMessage(payload, "Не удалось загрузить настройки."),
        )
      }
      if (!parsed) {
        throw new Error("Не удалось прочитать настройки рабочего пространства.")
      }
      if (settingsRequestRef.current !== requestId) {
        return
      }
      applySettings(parsed)
    } catch (error) {
      if (settingsRequestRef.current !== requestId) {
        return
      }
      setSettingsErrorText(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить настройки.",
      )
    } finally {
      if (settingsRequestRef.current === requestId) {
        setIsSettingsLoading(false)
      }
    }
  }

  function toggleSettings(workspaceId: string) {
    if (settingsWorkspaceId === workspaceId) {
      setSettingsWorkspaceId(null)
      resetSettingsState()
      return
    }

    setSettingsWorkspaceId(workspaceId)
    resetSettingsState()
    void loadWorkspaceSettings(workspaceId)
  }

  async function handleRenameWorkspace() {
    if (!settingsData) {
      return
    }

    const nextName = renameDraft.trim()
    if (nextName.length === 0) {
      setRenameErrorText("Название рабочего пространства не может быть пустым.")
      return
    }
    if (nextName === settingsData.workspace.name.trim()) {
      setRenameErrorText("")
      return
    }

    setIsSavingRename(true)
    setRenameErrorText("")

    try {
      await props.onRenameWorkspace(settingsData.workspace.id, nextName)
      setSettingsData((current) =>
        current
          ? {
              ...current,
              workspace: {
                ...current.workspace,
                name: nextName,
              },
            }
          : current,
      )
      setRenameDraft(nextName)
    } catch (error) {
      setRenameErrorText(
        error instanceof Error
          ? error.message
          : "Не удалось переименовать рабочее пространство.",
      )
    } finally {
      setIsSavingRename(false)
    }
  }

  async function handleCreateMetric(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!settingsData) {
      return
    }

    const shortName = createMetricDraft.shortName.trim()
    if (shortName.length === 0) {
      setCreateMetricErrorText("Короткое имя метрики не может быть пустым.")
      return
    }

    const description = createMetricDraft.description.trim()
    setIsCreatingMetric(true)
    setCreateMetricErrorText("")

    try {
      const nextMetrics = await props.onCreateMetric(
        settingsData.workspace.id,
        {
          shortName,
          description: description.length > 0 ? description : null,
        },
      )
      applySettings({
        workspace: settingsData.workspace,
        metrics: nextMetrics,
      })
      setIsCreateMetricOpen(false)
    } catch (error) {
      setCreateMetricErrorText(
        error instanceof Error ? error.message : "Не удалось добавить метрику.",
      )
    } finally {
      setIsCreatingMetric(false)
    }
  }

  async function handleSaveMetric(metricId: string) {
    if (!settingsData) {
      return
    }
    const draft = metricDrafts[metricId]
    if (!draft) {
      return
    }

    const shortName = draft.shortName.trim()
    if (shortName.length === 0) {
      setMetricErrors((current) => ({
        ...current,
        [metricId]: "Короткое имя метрики не может быть пустым.",
      }))
      return
    }

    const description = draft.description.trim()
    const originalMetric = settingsData.metrics.find(
      (metric) => metric.id === metricId,
    )
    if (!originalMetric) {
      return
    }
    const originalDescription = (originalMetric.description ?? "").trim()
    if (
      shortName === originalMetric.shortName.trim() &&
      description === originalDescription
    ) {
      setMetricErrors((current) => ({ ...current, [metricId]: "" }))
      return
    }
    setActiveMetricSaveId(metricId)
    setMetricErrors((current) => ({ ...current, [metricId]: "" }))

    try {
      const nextMetrics = await props.onSaveMetric(
        settingsData.workspace.id,
        metricId,
        {
          shortName,
          description: description.length > 0 ? description : null,
        },
      )
      applySettings({
        workspace: settingsData.workspace,
        metrics: nextMetrics,
      })
    } catch (error) {
      setMetricErrors((current) => ({
        ...current,
        [metricId]:
          error instanceof Error
            ? error.message
            : "Не удалось сохранить метрику.",
      }))
    } finally {
      setActiveMetricSaveId(null)
    }
  }

  async function handleDeleteMetric(metricId: string) {
    if (!settingsData) {
      return
    }
    setActiveMetricDeleteId(metricId)
    setMetricErrors((current) => ({ ...current, [metricId]: "" }))

    try {
      const nextMetrics = await props.onDeleteMetric(
        settingsData.workspace.id,
        metricId,
      )
      applySettings({
        workspace: settingsData.workspace,
        metrics: nextMetrics,
      })
    } catch (error) {
      setMetricErrors((current) => ({
        ...current,
        [metricId]:
          error instanceof Error
            ? error.message
            : "Не удалось удалить метрику.",
      }))
    } finally {
      setActiveMetricDeleteId(null)
    }
  }

  async function confirmDeleteWorkspace() {
    if (!settingsData) {
      return
    }
    setDeleteWorkspaceErrorText("")

    try {
      await props.onDeleteWorkspace(settingsData.workspace.id)
      setSettingsWorkspaceId(null)
      resetSettingsState()
    } catch (error) {
      setDeleteWorkspaceErrorText(
        error instanceof Error
          ? error.message
          : "Не удалось удалить рабочее пространство.",
      )
    }
  }

  return (
    <div
      className="workspace-inline-switcher"
      aria-label="Рабочие пространства"
    >
      {props.isLoading ? (
        <p className="workspace-inline-empty">Загрузка пространств</p>
      ) : null}

      {!props.isLoading && props.workspaces.length === 0 ? (
        <p className="workspace-inline-empty">
          Рабочие пространства не найдены
        </p>
      ) : null}

      <div
        aria-label="Список workspace"
        className="workspace-inline-list"
        role="tablist"
      >
        {props.workspaces.map((workspace) => {
          const isActive = workspace.id === props.currentWorkspaceId
          const isSettingsOpen = settingsWorkspaceId === workspace.id
          const isRenaming =
            props.isRenamingWorkspaceId === workspace.id || isSavingRename
          const isDeleting = props.isDeletingWorkspaceId === workspace.id

          return (
            <div className="workspace-inline-item" key={workspace.id}>
              <button
                aria-selected={isActive}
                className={[
                  "workspace-inline-trigger",
                  isActive ? "is-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => props.onOpenWorkspace(workspace.id)}
                role="tab"
                type="button"
              >
                {workspace.name}
              </button>

              <div className="workspace-inline-actions">
                <button
                  aria-expanded={isSettingsOpen}
                  aria-haspopup="dialog"
                  aria-label={`Настройки пространства ${workspace.name}`}
                  className="workspace-inline-action"
                  disabled={isDeleting || props.isCreating}
                  onClick={() => toggleSettings(workspace.id)}
                  type="button"
                >
                  <i aria-hidden className="ri-settings-3-line" />
                </button>
              </div>

              {isSettingsOpen ? (
                <dialog
                  aria-label={`Настройки workspace ${workspace.name}`}
                  className="workspace-settings-popup"
                  open
                >
                  <div className="workspace-settings-head">
                    <div className="workspace-settings-row workspace-settings-row-head">
                      <input
                        aria-label="Название рабочего пространства"
                        className="workspace-settings-input"
                        disabled={isRenaming || isDeleting}
                        onBlur={() => {
                          void handleRenameWorkspace()
                        }}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        value={renameDraft}
                      />
                    </div>
                    <button
                      aria-label="Закрыть настройки"
                      className="workspace-settings-close"
                      onClick={() => {
                        setSettingsWorkspaceId(null)
                        resetSettingsState()
                      }}
                      type="button"
                    >
                      <i aria-hidden className="ri-close-line" />
                    </button>
                  </div>

                  {isSettingsLoading ? (
                    <p className="workspace-settings-hint">
                      Загрузка настроек…
                    </p>
                  ) : null}
                  {settingsErrorText ? (
                    <p className="workspace-settings-error">
                      {settingsErrorText}
                    </p>
                  ) : null}

                  {settingsData && !isSettingsLoading ? (
                    <div className="workspace-settings-body">
                      <div className="workspace-settings-form">
                        {renameErrorText ? (
                          <p className="workspace-settings-error">
                            {renameErrorText}
                          </p>
                        ) : null}
                      </div>

                      <div className="workspace-settings-form">
                        {settingsData.metrics.length === 0 ? null : (
                          <ul className="workspace-settings-metric-list">
                            {settingsData.metrics.map((metric) => {
                              const draft = metricDrafts[metric.id] ?? {
                                shortName: metric.shortName,
                                description: metric.description ?? "",
                              }
                              const isSavingMetric =
                                activeMetricSaveId === metric.id
                              const isDeletingMetric =
                                activeMetricDeleteId === metric.id
                              const metricBusy =
                                isSavingMetric || isDeletingMetric

                              return (
                                <li
                                  className="workspace-settings-metric-item"
                                  key={metric.id}
                                >
                                  <div
                                    className="workspace-settings-metric-row"
                                    onBlur={(event) => {
                                      const nextFocused =
                                        event.relatedTarget as Node | null
                                      if (
                                        nextFocused &&
                                        event.currentTarget.contains(
                                          nextFocused,
                                        )
                                      ) {
                                        return
                                      }
                                      void handleSaveMetric(metric.id)
                                    }}
                                  >
                                    <input
                                      aria-label={`Имя метрики ${metric.shortName}`}
                                      className="workspace-settings-input"
                                      disabled={metricBusy || isDeleting}
                                      onChange={(event) =>
                                        setMetricDrafts((current) => ({
                                          ...current,
                                          [metric.id]: {
                                            ...(current[metric.id] ?? {
                                              shortName: metric.shortName,
                                              description:
                                                metric.description ?? "",
                                            }),
                                            shortName: event.target.value,
                                          },
                                        }))
                                      }
                                      value={draft.shortName}
                                    />
                                    <input
                                      aria-label={`Описание метрики ${metric.shortName}`}
                                      className="workspace-settings-input"
                                      disabled={metricBusy || isDeleting}
                                      onChange={(event) =>
                                        setMetricDrafts((current) => ({
                                          ...current,
                                          [metric.id]: {
                                            ...(current[metric.id] ?? {
                                              shortName: metric.shortName,
                                              description:
                                                metric.description ?? "",
                                            }),
                                            description: event.target.value,
                                          },
                                        }))
                                      }
                                      value={draft.description}
                                    />
                                    <button
                                      aria-label={`Удалить метрику ${metric.shortName}`}
                                      className="workspace-settings-button workspace-settings-button-danger workspace-settings-button-icon"
                                      disabled={metricBusy || isDeleting}
                                      onClick={() => {
                                        void handleDeleteMetric(metric.id)
                                      }}
                                      type="button"
                                    >
                                      <i
                                        aria-hidden
                                        className="ri-delete-bin-line"
                                      />
                                    </button>
                                  </div>
                                  {metricErrors[metric.id] ? (
                                    <p className="workspace-settings-error">
                                      {metricErrors[metric.id]}
                                    </p>
                                  ) : null}
                                </li>
                              )
                            })}
                          </ul>
                        )}

                        {isCreateMetricOpen ? (
                          <form
                            className="workspace-settings-metric-create"
                            onSubmit={(event) => {
                              void handleCreateMetric(event)
                            }}
                          >
                            <input
                              aria-label="Короткое имя новой метрики"
                              className="workspace-settings-input"
                              disabled={isCreatingMetric || isDeleting}
                              onChange={(event) =>
                                setCreateMetricDraft((current) => ({
                                  ...current,
                                  shortName: event.target.value,
                                }))
                              }
                              placeholder="Короткое имя"
                              value={createMetricDraft.shortName}
                            />
                            <input
                              aria-label="Описание новой метрики"
                              className="workspace-settings-input"
                              disabled={isCreatingMetric || isDeleting}
                              onChange={(event) =>
                                setCreateMetricDraft((current) => ({
                                  ...current,
                                  description: event.target.value,
                                }))
                              }
                              placeholder="Описание (опционально)"
                              value={createMetricDraft.description}
                            />
                            <button
                              aria-label="Добавить метрику"
                              className="workspace-settings-button workspace-settings-button-icon"
                              disabled={isCreatingMetric || isDeleting}
                              type="submit"
                            >
                              <i aria-hidden className="ri-add-line" />
                            </button>
                          </form>
                        ) : (
                          <button
                            aria-label="Создать новую метрику"
                            className="workspace-settings-button workspace-settings-button-icon"
                            disabled={isDeleting}
                            onClick={() => setIsCreateMetricOpen(true)}
                            type="button"
                          >
                            <i aria-hidden className="ri-add-line" />
                          </button>
                        )}
                        {createMetricErrorText ? (
                          <p className="workspace-settings-error">
                            {createMetricErrorText}
                          </p>
                        ) : null}
                      </div>

                      <div className="workspace-settings-form workspace-settings-delete">
                        {!isDeleteWorkspaceConfirm ? (
                          <button
                            aria-label="Удалить workspace"
                            className="workspace-settings-button workspace-settings-button-danger workspace-settings-delete-trigger"
                            disabled={isDeleting}
                            onClick={() => setIsDeleteWorkspaceConfirm(true)}
                            type="button"
                          >
                            Удалить workspace
                          </button>
                        ) : (
                          <div className="workspace-settings-delete-confirm">
                            <p className="workspace-settings-error">
                              Подтвердите удаление workspace «
                              {settingsData.workspace.name}».
                            </p>
                            <div className="workspace-settings-delete-actions">
                              <button
                                className="workspace-settings-button"
                                disabled={isDeleting}
                                onClick={() =>
                                  setIsDeleteWorkspaceConfirm(false)
                                }
                                type="button"
                              >
                                Отмена
                              </button>
                              <button
                                aria-label="Подтвердить удаление workspace"
                                className="workspace-settings-button workspace-settings-button-danger workspace-settings-button-icon"
                                disabled={isDeleting}
                                onClick={() => {
                                  void confirmDeleteWorkspace()
                                }}
                                type="button"
                              >
                                <i
                                  aria-hidden
                                  className={
                                    isDeleting
                                      ? "ri-loader-4-line"
                                      : "ri-check-line"
                                  }
                                />
                              </button>
                            </div>
                          </div>
                        )}
                        {deleteWorkspaceErrorText ? (
                          <p className="workspace-settings-error">
                            {deleteWorkspaceErrorText}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </dialog>
              ) : null}
            </div>
          )
        })}

        {editingId === CREATE_DRAFT_ID ? (
          <div className="workspace-inline-item workspace-inline-item-create">
            <form className="workspace-inline-edit" onSubmit={submitEdit}>
              <input
                aria-label="Название нового рабочего пространства"
                className="workspace-inline-input"
                disabled={props.isCreating}
                onBlur={() => {
                  void submitEdit()
                }}
                onChange={(event) => setDraftName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault()
                    setEditingId(null)
                    setDraftName("")
                  }
                }}
                placeholder="Новое пространство"
                ref={inputRef}
                value={draftName}
              />
            </form>
          </div>
        ) : (
          <button
            aria-label="Добавить рабочее пространство"
            className="workspace-inline-add"
            disabled={props.isCreating || props.isRenamingWorkspaceId !== null}
            onClick={beginCreate}
            type="button"
          >
            <i aria-hidden className="ri-add-line" />
          </button>
        )}
      </div>
    </div>
  )
}
