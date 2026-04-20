type WorkspaceTitlePanelProps = {
  title: string
  errorText?: string
  className?: string
}

export function WorkspaceTitlePanel(props: WorkspaceTitlePanelProps) {
  return (
    <section className={props.className ?? "section"}>
      <header className="section-head">
        <h1 className="works-title">{props.title}</h1>
      </header>
      {props.errorText ? <p className="error-text">{props.errorText}</p> : null}
    </section>
  )
}
