# Ratings

## Purpose

This document defines the business logic for the three core work-item ratings.

## Rating Set

- `overcomplication`
- `importance`
- `blocksMoney`

## Allowed Values

- integers from `0` to `5`;
- `null` when not rated.

## Meaning

- ratings belong to the concrete work item;
- ratings are optional;
- ratings are used to compare work items and understand branch weight.

## Read Rules

- leaf items display their own stored ratings;
- parent items display aggregated sums from descendants in the primary tree view;
- parent items should not behave like directly editable leaf-rating rows in the primary tree representation.

## Write Rules

- valid writes must respect the `0..5` range;
- invalid numeric values must be rejected;
- ratings edits must not change structure;
- rating persistence must preserve `null` when the user intentionally leaves a value empty.

## Negative Scenarios

- saving `-1`, `6`, fractional, or non-numeric values;
- double-counting ratings in aggregates;
- treating parent aggregate values as editable stored ratings;
- losing leaf ratings after move or delete of unrelated nodes.
