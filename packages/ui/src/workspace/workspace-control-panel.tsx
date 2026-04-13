import type { ReactNode } from "react"
import type { WorkspaceSummary } from "./types"

type WorkspaceControlPanelProps = {
  currentWorkspaceId: string | null
  isCreatingWorkspace: boolean
  isWorkspaceLoading: boolean
  workspaceErrorText?: string
  workspaces: WorkspaceSummary[]
  className?: string
  renderSwitcher: (params: {
    currentWorkspaceId: string | null
    isCreatingWorkspace: boolean
    isWorkspaceLoading: boolean
    workspaces: WorkspaceSummary[]
  }) => ReactNode
}

export function WorkspaceControlPanel(props: WorkspaceControlPanelProps) {
  return (
    <section className={props.className ?? "section"}>
      {props.renderSwitcher({
        currentWorkspaceId: props.currentWorkspaceId,
        isCreatingWorkspace: props.isCreatingWorkspace,
        isWorkspaceLoading: props.isWorkspaceLoading,
        workspaces: props.workspaces,
      })}
      {props.workspaceErrorText ? (
        <p className="error-text">{props.workspaceErrorText}</p>
      ) : null}
    </section>
  )
}
