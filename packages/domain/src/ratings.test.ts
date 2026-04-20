import { describe, expect, it } from "vitest"
import {
  addRatingTotals,
  getLeafRatingValue,
  getParentAggregateValue,
  ratingFieldDefinitions,
  ratingTotalsFromOwnRatings,
} from "./ratings"

describe("ratings", () => {
  it("maps every rating field to matching leaf and aggregate values", () => {
    const ownRatings = {
      overcomplication: 2,
      importance: null,
    } as const
    const totals = ratingTotalsFromOwnRatings(ownRatings)

    expect(ratingFieldDefinitions).toEqual([
      { key: "overcomplication", aggregateKey: "overcomplicationSum" },
      { key: "importance", aggregateKey: "importanceSum" },
    ])

    for (const field of ratingFieldDefinitions) {
      expect(getLeafRatingValue(ownRatings, field.key)).toBe(
        ownRatings[field.key] ?? 0,
      )
      expect(getParentAggregateValue(totals, field.key)).toBe(
        totals[field.aggregateKey],
      )
    }
  })

  it("adds aggregate totals field-by-field", () => {
    expect(
      addRatingTotals(
        {
          overcomplicationSum: 2,
          importanceSum: 1,
        },
        {
          overcomplicationSum: 1,
          importanceSum: 0,
        },
      ),
    ).toEqual({
      overcomplicationSum: 3,
      importanceSum: 1,
    })
  })
})
