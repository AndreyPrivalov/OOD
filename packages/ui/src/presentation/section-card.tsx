import type { ReactNode } from "react"

type SectionCardProps = {
  title?: string
  subtitle?: string
  className?: string
  children: ReactNode
}

export function SectionCard(props: SectionCardProps) {
  return (
    <section className={props.className ?? "section"}>
      {props.title || props.subtitle ? (
        <header className="section-head">
          {props.title ? <h2>{props.title}</h2> : null}
          {props.subtitle ? <p>{props.subtitle}</p> : null}
        </header>
      ) : null}
      {props.children}
    </section>
  )
}
