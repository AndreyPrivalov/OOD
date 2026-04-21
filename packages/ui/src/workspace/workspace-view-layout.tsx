import type { ReactNode } from "react"
import type { WorkspaceViewMode } from "./types"

type WorkspaceViewLayoutProps = {
  viewMode: WorkspaceViewMode
  primary: ReactNode
  secondary?: ReactNode
  className?: string
}

export function WorkspaceViewLayout(props: WorkspaceViewLayoutProps) {
  const isSplit = props.viewMode === "split"
  const className = [
    props.className ?? "workspace-view-layout",
    isSplit
      ? "workspace-view-layout-split"
      : "workspace-view-layout-table-only",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div className={className}>
      {isSplit ? (
        <aside className="workspace-view-secondary">{props.secondary}</aside>
      ) : null}
      <div className="workspace-view-primary">{props.primary}</div>
    </div>
  )
}
