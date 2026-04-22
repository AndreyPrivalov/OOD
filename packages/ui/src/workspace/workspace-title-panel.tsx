import type { WorkspaceViewMode } from "./types"

type WorkspaceTitlePanelProps = {
  title: string
  errorText?: string
  className?: string
  viewMode: WorkspaceViewMode
  onViewModeChange: (viewMode: WorkspaceViewMode) => void
}

export function WorkspaceTitlePanel(props: WorkspaceTitlePanelProps) {
  const isMindmapVisible = props.viewMode === "split"

  return (
    <section className={props.className ?? "section"}>
      <header className="section-head">
        <div className="workspace-title-row">
          <h1 className="works-title">{props.title}</h1>
          <div className="workspace-title-actions">
            <button
              type="button"
              className={`workspace-view-toggle${isMindmapVisible ? " is-active" : ""}`}
              aria-label="Показывать дерево"
              title="Показывать дерево"
              aria-pressed={isMindmapVisible}
              onClick={() =>
                props.onViewModeChange(
                  isMindmapVisible ? "table-only" : "split",
                )
              }
            >
              <span
                className={`workspace-view-toggle-switch${isMindmapVisible ? " is-active" : ""}`}
                aria-hidden
              >
                <span className="workspace-view-toggle-thumb" />
              </span>
              <span className="workspace-view-toggle-label">
                Показывать дерево
              </span>
            </button>
          </div>
        </div>
      </header>
      {props.errorText ? <p className="error-text">{props.errorText}</p> : null}
    </section>
  )
}
