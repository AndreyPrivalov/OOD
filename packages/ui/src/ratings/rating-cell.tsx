import type { RatingValue } from "./types"

type RatingCellProps = {
  value: RatingValue
  disabled?: boolean
  className?: string
  onChange?: (value: RatingValue) => void
}

const ratingOptions: RatingValue[] = [null, 0, 1, 2, 3, 4, 5]

export function RatingCell(props: RatingCellProps) {
  return (
    <div className={props.className ?? "rating-cell"}>
      {ratingOptions.map((option) => {
        const isSelected = option === props.value
        const label = option === null ? "—" : `${option}`
        return (
          <button
            key={option ?? "none"}
            type="button"
            className={isSelected ? "is-selected" : ""}
            disabled={props.disabled}
            aria-pressed={isSelected}
            aria-label={`Оценка ${label}`}
            onClick={() => props.onChange?.(option)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
