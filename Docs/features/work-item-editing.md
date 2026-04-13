# Work Item Editing

## Purpose

This document defines business rules for inline editing of work items.

## Editable Fields

- `title`
- `object`
- `possiblyRemovable`
- `currentProblems`
- `solutionVariants`
- leaf ratings

## Edit Model

Editing is inline and should feel direct, but the system must optimize for reliability over constant background activity.

The cleanup phase should use end-of-edit persistence, not aggressive continuous autosave.

## Save Triggers

Primary save triggers:

- `blur` for text inputs and textareas;
- equivalent completion triggers for toggles or discrete inputs.

The user should not need to click a save button for routine field edits.

## Rules

- `title` cannot be saved empty;
- `object` may be temporarily empty during editing;
- text lists are edited as ordered sets of user-entered text lines;
- editing business fields must not change tree structure;
- failed saves must be recoverable and understandable.

## UX Expectations

- the user always knows which field is being edited;
- validation errors are field-specific and understandable;
- a failed save should not silently discard user intent;
- one row’s local editing state should not unexpectedly overwrite another row.

## Negative Scenarios

- blur-triggered save with empty title;
- failed save that leaves the row appearing saved when it is not;
- server response applying outdated data over newer local edits;
- editing a field and accidentally moving the item in the tree.
