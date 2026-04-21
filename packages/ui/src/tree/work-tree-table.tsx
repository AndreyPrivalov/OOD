import type { CSSProperties } from "react"
import {
  type TreeColumnLabels,
  type TreeRowModel,
  defaultTreeColumnLabels,
} from "./types"

type WorkTreeTableProps = {
  rows: TreeRowModel[]
  className?: string
  labels?: Partial<TreeColumnLabels>
  emptyObjectLabel?: string
  renderRating?: (value: number | null | undefined) => string
}

function defaultRenderRating(value: number | null | undefined) {
  return typeof value === "number" ? `${value}` : "-"
}

export function WorkTreeTable(props: WorkTreeTableProps) {
  const labels: TreeColumnLabels = {
    ...defaultTreeColumnLabels,
    ...props.labels,
  }

  return (
    <div className={props.className} style={{ display: "grid", gap: "9px" }}>
      <header
        style={headerGridStyle}
        aria-label="Заголовок таблицы дерева работ"
      >
        <span>{labels.work}</span>
        <span>{labels.object}</span>
        <span>{labels.overcomplication}</span>
        <span>{labels.importance}</span>
      </header>
      {props.rows.map((row) => (
        <article key={row.id} style={rowGridStyle}>
          <span style={{ paddingLeft: `${row.depth * 20}px` }}>
            {row.hasChildren ? "▾ " : "• "}
            {row.title}
          </span>
          <span>{row.object ?? props.emptyObjectLabel ?? "Пусто"}</span>
          <span>
            {(props.renderRating ?? defaultRenderRating)(row.overcomplication)}
          </span>
          <span>
            {(props.renderRating ?? defaultRenderRating)(row.importance)}
          </span>
        </article>
      ))}
    </div>
  )
}

const headerGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2fr 2fr 120px 120px",
  fontWeight: 700,
  borderBottom: "1px solid var(--line)",
  paddingBottom: "6px",
}

const rowGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2fr 2fr 120px 120px",
  alignItems: "center",
  gap: "8px",
  borderBottom: "1px solid var(--line)",
  padding: "6px 0",
}
