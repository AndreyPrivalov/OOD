export type RatingValue = 0 | 1 | 2 | 3 | 4 | 5 | null

export type RatingFieldKey = "overcomplication" | "importance"

export type RatingFieldConfig = {
  key: RatingFieldKey
  headerLabel: string
  columnClassName: string
}

export const ratingFieldConfigs: RatingFieldConfig[] = [
  {
    key: "overcomplication",
    headerLabel: "Переусл.",
    columnClassName: "overcomplication-col",
  },
  {
    key: "importance",
    headerLabel: "Важность",
    columnClassName: "importance-col",
  },
]
