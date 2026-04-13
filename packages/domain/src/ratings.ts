export const ratingValues = [0, 1, 2, 3, 4, 5] as const

export type Rating = (typeof ratingValues)[number]

export const ratingFieldKeys = [
  "overcomplication",
  "importance",
  "blocksMoney",
] as const

export type RatingFieldKey = (typeof ratingFieldKeys)[number]

export interface WorkItemRatings {
  overcomplication: Rating | null
  importance: Rating | null
  blocksMoney: Rating | null
}

export interface RatingTotals {
  overcomplicationSum: number
  importanceSum: number
  blocksMoneySum: number
}

export function emptyRatingTotals(): RatingTotals {
  return {
    overcomplicationSum: 0,
    importanceSum: 0,
    blocksMoneySum: 0,
  }
}

export function ratingTotalsFromOwnRatings(
  ratings: WorkItemRatings,
): RatingTotals {
  return {
    overcomplicationSum: ratings.overcomplication ?? 0,
    importanceSum: ratings.importance ?? 0,
    blocksMoneySum: ratings.blocksMoney ?? 0,
  }
}

export function addRatingTotals(
  left: RatingTotals,
  right: RatingTotals,
): RatingTotals {
  return {
    overcomplicationSum: left.overcomplicationSum + right.overcomplicationSum,
    importanceSum: left.importanceSum + right.importanceSum,
    blocksMoneySum: left.blocksMoneySum + right.blocksMoneySum,
  }
}
