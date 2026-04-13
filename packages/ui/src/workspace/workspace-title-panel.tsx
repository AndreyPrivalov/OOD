type WorkspaceTitlePanelProps = {
  title?: string
  currentWorkspaceName: string
  errorText?: string
  className?: string
}

export function WorkspaceTitlePanel(props: WorkspaceTitlePanelProps) {
  return (
    <section className={props.className ?? "section"}>
      <header className="section-head">
        <h1 className="works-title">{props.title ?? "Работы"}</h1>
        <p className="workspace-context">{props.currentWorkspaceName}</p>
      </header>
      {props.errorText ? <p className="error-text">{props.errorText}</p> : null}
    </section>
  )
}
