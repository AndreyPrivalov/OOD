"use client"

import type { WorkspaceSummary } from "../../workspaces/types"
import { WorkspaceSwitcher } from "../../workspaces/workspace-switcher"

type WorkspaceControlPanelProps = {
  currentWorkspaceId: string | null
  isCreatingWorkspace: boolean
  isWorkspaceLoading: boolean
  workspaceErrorText: string
  workspaces: WorkspaceSummary[]
  onCreateWorkspace: (name: string) => Promise<void>
  onOpenWorkspace: (workspaceId: string) => void
}

export function WorkspaceControlPanel(props: WorkspaceControlPanelProps) {
  return (
    <section className="section">
      <WorkspaceSwitcher
        currentWorkspaceId={props.currentWorkspaceId}
        isCreating={props.isCreatingWorkspace}
        isLoading={props.isWorkspaceLoading}
        onCreateWorkspace={props.onCreateWorkspace}
        onOpenWorkspace={props.onOpenWorkspace}
        workspaces={props.workspaces}
      />
      {props.workspaceErrorText ? (
        <p className="error-text">{props.workspaceErrorText}</p>
      ) : null}
    </section>
  )
}

type WorkspaceTitlePanelProps = {
  currentWorkspaceName: string
  errorText: string
}

export function WorkspaceTitlePanel(props: WorkspaceTitlePanelProps) {
  return (
    <section className="section">
      <header className="section-head">
        <h1 className="works-title">Работы</h1>
        <p className="workspace-context">{props.currentWorkspaceName}</p>
      </header>
      {props.errorText ? <p className="error-text">{props.errorText}</p> : null}
    </section>
  )
}
