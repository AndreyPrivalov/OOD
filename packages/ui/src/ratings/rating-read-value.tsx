import type { RatingValue } from "./types"

type RatingReadValueProps = {
  value: RatingValue
  className?: string
}

export function RatingReadValue(props: RatingReadValueProps) {
  return (
    <span className={props.className ?? "rating-read-value"}>
      {props.value === null ? "—" : props.value}
    </span>
  )
}
