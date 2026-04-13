export interface TreeRowModel {
  id: string;
  title: string;
  object: string | null;
  depth: number;
  hasChildren: boolean;
}

export function WorkTreeTable({ rows }: { rows: TreeRowModel[] }) {
  return (
    <div style={{ display: "grid", gap: "6px" }}>
      <header
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 2fr 120px 120px 120px",
          fontWeight: 700,
          borderBottom: "1px solid #d8d4cf",
          paddingBottom: "6px"
        }}
      >
        <span>Работа</span>
        <span>Объект</span>
        <span>Переусл.</span>
        <span>Важность</span>
        <span>Деньги</span>
      </header>
      {rows.map((row) => (
        <article
          key={row.id}
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 2fr 120px 120px 120px",
            alignItems: "center",
            gap: "8px",
            borderBottom: "1px solid #d8d4cf",
            padding: "6px 0"
          }}
        >
          <span style={{ paddingLeft: `${row.depth * 20}px` }}>
            {row.hasChildren ? "▾ " : "• "} {row.title}
          </span>
          <span>{row.object ?? "Пусто"}</span>
          <span>-</span>
          <span>-</span>
          <span>-</span>
        </article>
      ))}
    </div>
  );
}
