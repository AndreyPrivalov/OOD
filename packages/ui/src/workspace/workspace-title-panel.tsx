import type { WorkspaceViewMode } from "./types"

type WorkspaceTitlePanelProps = {
  title: string
  errorText?: string
  className?: string
  viewMode: WorkspaceViewMode
  onViewModeChange: (viewMode: WorkspaceViewMode) => void
}

export function WorkspaceTitlePanel(props: WorkspaceTitlePanelProps) {
  return (
    <section className={props.className ?? "section"}>
      <header className="section-head">
        <div className="workspace-title-row">
          <h1 className="works-title">{props.title}</h1>
          <div className="workspace-title-actions">
            <fieldset
              aria-label="Режим workspace view"
              className="workspace-view-mode-toggle"
            >
              <button
                type="button"
                className={`workspace-view-mode-button${
                  props.viewMode === "table-only" ? " is-active" : ""
                }`}
                aria-pressed={props.viewMode === "table-only"}
                onClick={() => props.onViewModeChange("table-only")}
              >
                Table-only
              </button>
              <button
                type="button"
                className={`workspace-view-mode-button${
                  props.viewMode === "split" ? " is-active" : ""
                }`}
                aria-pressed={props.viewMode === "split"}
                onClick={() => props.onViewModeChange("split")}
              >
                Split
              </button>
            </fieldset>
          </div>
        </div>
      </header>
      {props.errorText ? <p className="error-text">{props.errorText}</p> : null}
    </section>
  )
}
