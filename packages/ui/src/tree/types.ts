export type TreeRowModel = {
  id: string
  title: string
  object: string | null
  depth: number
  hasChildren: boolean
  overcomplication?: number | null
  importance?: number | null
  blocksMoney?: number | null
}

export type TreeColumnLabels = {
  work: string
  object: string
  overcomplication: string
  importance: string
  blocksMoney: string
}

export const defaultTreeColumnLabels: TreeColumnLabels = {
  work: "Работа",
  object: "Объект",
  overcomplication: "Переусл.",
  importance: "Важность",
  blocksMoney: "Деньги",
}
