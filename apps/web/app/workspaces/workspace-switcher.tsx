"use client"

import { type FormEvent, useState } from "react"
import type { WorkspaceSummary } from "./types"

type WorkspaceSwitcherProps = {
  currentWorkspaceId: string | null
  isCreating: boolean
  isLoading: boolean
  onCreateWorkspace: (name: string) => Promise<void>
  onOpenWorkspace: (workspaceId: string) => void
  workspaces: WorkspaceSummary[]
}

export function WorkspaceSwitcher(props: WorkspaceSwitcherProps) {
  const [draftName, setDraftName] = useState("")

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextName = draftName.trim()
    if (nextName.length === 0) {
      return
    }

    try {
      await props.onCreateWorkspace(nextName)
      setDraftName("")
    } catch {
      return
    }
  }

  return (
    <section className="workspace-panel" aria-label="Рабочие пространства">
      <div className="workspace-panel-head">
        <div className="workspace-panel-copy">
          <h2 className="workspace-panel-title">Рабочие пространства</h2>
          <p className="workspace-panel-text">
            Выберите контекст дерева или создайте новое shared workspace.
          </p>
        </div>

        <form className="workspace-create-form" onSubmit={handleSubmit}>
          <input
            aria-label="Название рабочего пространства"
            className="workspace-create-input"
            disabled={props.isCreating}
            onChange={(event) => setDraftName(event.target.value)}
            placeholder="Новое пространство"
            value={draftName}
          />
          <button
            className="workspace-create-button"
            disabled={props.isCreating || draftName.trim().length === 0}
            type="submit"
          >
            {props.isCreating ? "Создание..." : "Создать"}
          </button>
        </form>
      </div>

      {props.isLoading ? (
        <p className="workspace-panel-empty">Загрузка пространств</p>
      ) : null}

      {!props.isLoading && props.workspaces.length === 0 ? (
        <p className="workspace-panel-empty">Рабочие пространства не найдены</p>
      ) : null}

      <div
        aria-label="Список workspace"
        className="workspace-tabs"
        role="tablist"
      >
        {props.workspaces.map((workspace) => {
          const isActive = workspace.id === props.currentWorkspaceId

          return (
            <button
              aria-selected={isActive}
              className={["workspace-tab", isActive ? "is-active" : ""]
                .filter(Boolean)
                .join(" ")}
              key={workspace.id}
              onClick={() => props.onOpenWorkspace(workspace.id)}
              role="tab"
              type="button"
            >
              <span className="workspace-tab-name">{workspace.name}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
