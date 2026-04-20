export const ratingValues = [0, 1, 2, 3, 4, 5] as const

export type Rating = (typeof ratingValues)[number]

export const ratingFieldKeys = ["overcomplication", "importance"] as const

export type RatingFieldKey = (typeof ratingFieldKeys)[number]

export const ratingAggregateKeyByField = {
  overcomplication: "overcomplicationSum",
  importance: "importanceSum",
} as const satisfies Record<RatingFieldKey, string>

export type RatingAggregateKey =
  (typeof ratingAggregateKeyByField)[RatingFieldKey]

export const ratingFieldDefinitions = [
  {
    key: "overcomplication",
    aggregateKey: ratingAggregateKeyByField.overcomplication,
  },
  {
    key: "importance",
    aggregateKey: ratingAggregateKeyByField.importance,
  },
] as const satisfies readonly {
  key: RatingFieldKey
  aggregateKey: RatingAggregateKey
}[]

export interface WorkItemRatings {
  overcomplication: Rating | null
  importance: Rating | null
}

export interface RatingTotals {
  overcomplicationSum: number
  importanceSum: number
}

export function emptyRatingTotals(): RatingTotals {
  return {
    overcomplicationSum: 0,
    importanceSum: 0,
  }
}

export function ratingTotalsFromOwnRatings(
  ratings: WorkItemRatings,
): RatingTotals {
  const totals = emptyRatingTotals()

  for (const field of ratingFieldKeys) {
    totals[getRatingAggregateKey(field)] = getLeafRatingValue(ratings, field)
  }

  return totals
}

export function addRatingTotals(
  left: RatingTotals,
  right: RatingTotals,
): RatingTotals {
  const totals = emptyRatingTotals()

  for (const field of ratingFieldKeys) {
    const aggregateKey = getRatingAggregateKey(field)
    totals[aggregateKey] = left[aggregateKey] + right[aggregateKey]
  }

  return totals
}

export function getRatingAggregateKey(
  field: RatingFieldKey,
): RatingAggregateKey {
  return ratingAggregateKeyByField[field]
}

export function getLeafRatingValue(
  ratings: WorkItemRatings,
  field: RatingFieldKey,
): number {
  return ratings[field] ?? 0
}

export function getParentAggregateValue(
  totals: RatingTotals,
  field: RatingFieldKey,
): number {
  return totals[getRatingAggregateKey(field)]
}
