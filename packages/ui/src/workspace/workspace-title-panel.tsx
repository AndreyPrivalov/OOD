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
              aria-label={
                isMindmapVisible ? "Скрыть дерево" : "Показать дерево"
              }
              title="OOD"
              aria-pressed={isMindmapVisible}
              onClick={() =>
                props.onViewModeChange(
                  isMindmapVisible ? "table-only" : "split",
                )
              }
            >
              <svg
                aria-hidden
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width="1em"
                height="1em"
              >
                <title>OOD</title>
                <path
                  fill="currentColor"
                  d="M10 2C10.5523 2 11 2.44772 11 3V7C11 7.55228 10.5523 8 10 8H8V10H13V9C13 8.44772 13.4477 8 14 8H20C20.5523 8 21 8.44772 21 9V13C21 13.5523 20.5523 14 20 14H14C13.4477 14 13 13.5523 13 13V12H8V18H13V17C13 16.4477 13.4477 16 14 16H20C20.5523 16 21 16.4477 21 17V21C21 21.5523 20.5523 22 20 22H14C13.4477 22 13 21.5513 13 21V20H7C6.44772 20 6 19.5523 6 19V8H4C3.44772 8 3 7.55228 3 7V3C3 2.44772 3.44772 2 4 2H10ZM19 18H15V20H19V18ZM19 10H15V12H19V10ZM9 4H5V6H9V4Z"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>
      {props.errorText ? <p className="error-text">{props.errorText}</p> : null}
    </section>
  )
}
