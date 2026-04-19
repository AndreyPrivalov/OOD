"use client"

import { type FormEvent, useEffect, useRef, useState } from "react"
import type { WorkspaceSummary } from "./types"

type WorkspaceSwitcherProps = {
  currentWorkspaceId: string | null
  isCreating: boolean
  isDeletingWorkspaceId: string | null
  isLoading: boolean
  isRenamingWorkspaceId: string | null
  onCreateWorkspace: (name: string) => Promise<void>
  onDeleteWorkspace: (workspaceId: string) => Promise<void>
  onOpenWorkspace: (workspaceId: string) => void
  onRenameWorkspace: (workspaceId: string, name: string) => Promise<void>
  workspaces: WorkspaceSummary[]
}

const CREATE_DRAFT_ID = "__create-workspace__"

export function WorkspaceSwitcher(props: WorkspaceSwitcherProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState("")
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!editingId) {
      return
    }
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editingId])

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
      } else {
        await props.onRenameWorkspace(editingId, nextName)
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

  function beginRename(workspace: WorkspaceSummary) {
    setEditingId(workspace.id)
    setDraftName(workspace.name)
  }

  async function handleDelete(workspace: WorkspaceSummary) {
    const isConfirmed = window.confirm(
      `Удалить пространство "${workspace.name}"? Все связанные работы будут удалены без возможности восстановления.`,
    )
    if (!isConfirmed) {
      return
    }

    await props.onDeleteWorkspace(workspace.id)
    if (editingId === workspace.id) {
      setEditingId(null)
      setDraftName("")
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
          const isEditing = editingId === workspace.id
          const isRenaming = props.isRenamingWorkspaceId === workspace.id
          const isDeleting = props.isDeletingWorkspaceId === workspace.id
          const isBusy = isRenaming || isDeleting

          return (
            <div className="workspace-inline-item" key={workspace.id}>
              {isEditing ? (
                <form className="workspace-inline-edit" onSubmit={submitEdit}>
                  <input
                    aria-label="Переименовать рабочее пространство"
                    className="workspace-inline-input"
                    disabled={isBusy}
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
                    ref={inputRef}
                    value={draftName}
                  />
                </form>
              ) : (
                <>
                  <button
                    aria-selected={isActive}
                    className={[
                      "workspace-inline-trigger",
                      isActive ? "is-active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onDoubleClick={() => {
                      if (isDeleting || isRenaming || props.isCreating) {
                        return
                      }
                      beginRename(workspace)
                    }}
                    onClick={() => props.onOpenWorkspace(workspace.id)}
                    role="tab"
                    type="button"
                  >
                    {workspace.name}
                  </button>

                  <div className="workspace-inline-actions">
                    <button
                      aria-label={`Удалить пространство ${workspace.name}`}
                      className="workspace-inline-action"
                      disabled={isDeleting || isRenaming || props.isCreating}
                      onClick={() => {
                        void handleDelete(workspace)
                      }}
                      type="button"
                    >
                      <i aria-hidden className="ri-delete-bin-line" />
                    </button>
                  </div>
                </>
              )}
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
