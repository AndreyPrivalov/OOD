import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  memo,
  useEffect,
  useState,
} from "react"

type TreeRowLike = {
  id: string
  parentId: string | null
  depth: number
  siblingOrder: number
  children: unknown[]
  overcomplication: number | null
  importance: number | null
  metricValues?: Record<string, "none" | "indirect" | "direct">
  metricAggregates?: Record<string, "none" | "indirect" | "direct">
  overcomplicationSum?: number
  importanceSum?: number
}

type FieldControl = {
  value: string
  onFocus: () => void
  onBlur: (value: string) => void
}

type TitleFieldControl = FieldControl & {
  registerTextareaRef: (node: HTMLTextAreaElement | null) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onInput?: (target: HTMLTextAreaElement) => void
}

type TextareaFieldControl = FieldControl & {
  registerTextareaRef: (node: HTMLTextAreaElement | null) => void
  onInput?: (target: HTMLTextAreaElement) => void
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void
}

type CheckboxControl = {
  checked: boolean
  onFocus: () => void
  onBlur: () => void
  onChange: (checked: boolean) => void
}

export type WorkspaceTreeRowUiModel = {
  title: TitleFieldControl
  object: FieldControl
  currentProblems: TextareaFieldControl
  solutionVariants: TextareaFieldControl
  possiblyRemovable: CheckboxControl
  ratingCells: ReactNode
  renderSignature: string
}

type DropIntentLike =
  | {
      type: "between"
      rowId: string
      position: "before" | "after"
    }
  | {
      type: "nest"
      targetId: string
    }
  | {
      type: "root-start"
    }

type OverlayIndicatorLike = {
  kind: "add" | "drop"
  laneId: string
  y: number
  contentStartXPx: number
  parentId: string | null
  targetIndex: number
  showPlus: boolean
}

type TableColumnWidthsLike = {
  work: string
  object: string
  overcomplication: string
  importance: string
  currentProblems: string
  solutionVariants: string
  removable: string
}

type DragPreviewLike = {
  x: number
  y: number
  title: string
}

type OverlayNestTargetLike = {
  top: number
  height: number
}

type RatingHeader = {
  key: string
  headerLabel: string
  columnClassName: string
}

type MemoRowProps = {
  rowId: string
  parentId: string | null
  depth: number
  hasMultilineField: boolean
  className: string
  rowRenderSignature: string
  editRenderSignature: string
  registerRowElementRef: (
    rowId: string,
    node: HTMLTableRowElement | null,
  ) => void
  children: ReactNode
}

type EditableInputFieldProps = {
  className: string
  dataRowField: string
  placeholder: string
  ariaLabel: string
  control: FieldControl
}

const EditableInputField = memo(function EditableInputField(
  props: EditableInputFieldProps,
) {
  const [draftValue, setDraftValue] = useState(props.control.value)
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (!isFocused) {
      setDraftValue(props.control.value)
    }
  }, [props.control.value, isFocused])

  return (
    <input
      className={props.className}
      data-row-field={props.dataRowField}
      value={draftValue}
      placeholder={props.placeholder}
      aria-label={props.ariaLabel}
      onFocus={() => {
        setIsFocused(true)
        props.control.onFocus()
      }}
      onChange={(event) => {
        setDraftValue(event.currentTarget.value)
      }}
      onBlur={() => {
        setIsFocused(false)
        props.control.onBlur(draftValue)
      }}
    />
  )
})

type EditableTextareaFieldProps = {
  className: string
  dataRowField: string
  placeholder: string
  ariaLabel: string
  control: TextareaFieldControl
}

const EditableTextareaField = memo(function EditableTextareaField(
  props: EditableTextareaFieldProps,
) {
  const [draftValue, setDraftValue] = useState(props.control.value)
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (!isFocused) {
      setDraftValue(props.control.value)
    }
  }, [props.control.value, isFocused])

  return (
    <textarea
      className={props.className}
      data-row-field={props.dataRowField}
      ref={props.control.registerTextareaRef}
      rows={1}
      value={draftValue}
      placeholder={props.placeholder}
      aria-label={props.ariaLabel}
      onFocus={() => {
        setIsFocused(true)
        props.control.onFocus()
      }}
      onBlur={() => {
        setIsFocused(false)
        props.control.onBlur(draftValue)
      }}
      onKeyDown={props.control.onKeyDown}
      onChange={(event) => {
        setDraftValue(event.currentTarget.value)
        props.control.onInput?.(event.currentTarget)
      }}
    />
  )
})

type EditableTitleFieldProps = {
  control: TitleFieldControl
  rowDepth: number
  rowTreeIndentPx: number
  workContentIndentPx: number
}

const EditableTitleField = memo(function EditableTitleField(
  props: EditableTitleFieldProps,
) {
  const [draftValue, setDraftValue] = useState(props.control.value)
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (!isFocused) {
      setDraftValue(props.control.value)
    }
  }, [props.control.value, isFocused])

  return (
    <textarea
      className="input-title textarea-list"
      data-row-field="title"
      ref={props.control.registerTextareaRef}
      style={{
        paddingInlineStart: `${
          props.rowDepth * props.rowTreeIndentPx + props.workContentIndentPx
        }px`,
      }}
      rows={1}
      value={draftValue}
      placeholder="Название"
      aria-label="Название"
      onFocus={() => {
        setIsFocused(true)
        props.control.onFocus()
      }}
      onKeyDown={props.control.onKeyDown}
      onChange={(event) => {
        setDraftValue(event.currentTarget.value)
        props.control.onInput?.(event.currentTarget)
      }}
      onBlur={() => {
        setIsFocused(false)
        props.control.onBlur(draftValue)
      }}
    />
  )
})

const MemoWorkRow = memo(
  function MemoWorkRow(props: MemoRowProps) {
    return (
      <tr
        ref={(node) => props.registerRowElementRef(props.rowId, node)}
        data-row-id={props.rowId}
        data-parent-id={props.parentId ?? "root"}
        data-depth={props.depth}
        data-multiline={props.hasMultilineField ? "true" : "false"}
        className={props.className}
      >
        {props.children}
      </tr>
    )
  },
  (prev, next) =>
    prev.rowId === next.rowId &&
    prev.parentId === next.parentId &&
    prev.depth === next.depth &&
    prev.hasMultilineField === next.hasMultilineField &&
    prev.className === next.className &&
    prev.rowRenderSignature === next.rowRenderSignature &&
    prev.editRenderSignature === next.editRenderSignature,
)

export function buildRowRenderSignature(row: TreeRowLike): string {
  const metricValuesSignature = Object.entries(row.metricValues ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([metricId, value]) => `${metricId}:${value}`)
    .join("|")
  const metricAggregatesSignature = Object.entries(row.metricAggregates ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([metricId, value]) => `${metricId}:${value}`)
    .join("|")

  return [
    row.id,
    row.parentId ?? "root",
    String(row.siblingOrder),
    String(row.depth),
    String(row.overcomplication ?? ""),
    String(row.importance ?? ""),
    metricValuesSignature,
    metricAggregatesSignature,
    String(row.overcomplicationSum ?? ""),
    String(row.importanceSum ?? ""),
  ].join(":")
}

export type WorkspaceTreeTableProps = {
  rows: TreeRowLike[]
  collapsedRowIds: ReadonlySet<string>
  rowUiById: Record<string, WorkspaceTreeRowUiModel>
  numberingById: Map<string, string>
  draggedRowId: string | null
  dropIntent: DropIntentLike | null
  tableColumnWidths: TableColumnWidthsLike
  ratingHeaders: readonly RatingHeader[]
  rowTreeIndentPx: number
  workContentIndentPx: number
  contentStartXPx: number
  frameXPx: number
  leftGutterWidthPx: number
  cellInlinePadPx: number
  structureLineWidthPx: number
  overlayHeight: number
  overlayAddIndicators: OverlayIndicatorLike[]
  overlayDropY: number | null
  overlayNestTarget: OverlayNestTargetLike | null
  dragPreview: DragPreviewLike | null
  listScrollRef: React.RefObject<HTMLDivElement>
  tableWrapRef: React.RefObject<HTMLDivElement>
  tableRef: React.RefObject<HTMLTableElement>
  registerRowElementRef: (
    rowId: string,
    node: HTMLTableRowElement | null,
  ) => void
  onHandlePointerDown: (
    event: PointerEvent<HTMLButtonElement>,
    rowId: string,
  ) => void
  onHandlePointerMove: (event: PointerEvent<HTMLButtonElement>) => void
  onHandlePointerUp: (event: PointerEvent<HTMLButtonElement>) => void
  onHandlePointerCancel: (event: PointerEvent<HTMLButtonElement>) => void
  onCreateAtPosition: (parentId: string | null, targetIndex: number) => void
  onDeleteRow: (rowId: string) => void
  onToggleRowCollapse: (rowId: string) => void
}

export function WorkspaceTreeTable(props: WorkspaceTreeTableProps) {
  const metricColumnWidth = "calc(10ch + 20px)"
  const ratingColumnWidthByKey: Record<string, string> = {
    overcomplication: props.tableColumnWidths.overcomplication,
    importance: props.tableColumnWidths.importance,
  }

  return (
    <div className="list" ref={props.listScrollRef}>
      <div className="work-table-wrap" ref={props.tableWrapRef}>
        <table
          data-tree-table
          ref={props.tableRef}
          data-drop-intent={props.dropIntent?.type ?? "none"}
          data-drop-position={
            props.dropIntent?.type === "between"
              ? props.dropIntent.position
              : "none"
          }
          style={
            {
              "--work-col-width": props.tableColumnWidths.work,
              "--object-col-width": props.tableColumnWidths.object,
              "--overcomplication-col-width":
                props.tableColumnWidths.overcomplication,
              "--importance-col-width": props.tableColumnWidths.importance,
              "--workspace-metric-col-width": metricColumnWidth,
              "--problems-col-width": props.tableColumnWidths.currentProblems,
              "--solutions-col-width": props.tableColumnWidths.solutionVariants,
              "--removable-col-width": props.tableColumnWidths.removable,
              "--frame-x": `${props.frameXPx}px`,
              "--left-gutter-width": `${props.leftGutterWidthPx}px`,
              "--work-content-indent": `${props.workContentIndentPx}px`,
              "--cell-inline-pad": `${props.cellInlinePadPx}px`,
              "--content-start-x": `${props.contentStartXPx}px`,
              "--structure-line-width": `${props.structureLineWidthPx}px`,
            } as CSSProperties
          }
          className={[
            "work-table",
            props.dropIntent?.type === "root-start" ? "root-start-active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <colgroup>
            <col style={{ width: props.tableColumnWidths.work }} />
            <col style={{ width: props.tableColumnWidths.object }} />
            {props.ratingHeaders.map((field) => (
              <col
                key={field.key}
                style={{
                  width: ratingColumnWidthByKey[field.key] ?? metricColumnWidth,
                }}
              />
            ))}
            <col style={{ width: props.tableColumnWidths.currentProblems }} />
            <col style={{ width: props.tableColumnWidths.solutionVariants }} />
            <col style={{ width: props.tableColumnWidths.removable }} />
          </colgroup>
          <thead>
            <tr>
              <th className="work-col">Работа</th>
              <th className="object-col">Объект</th>
              {props.ratingHeaders.map((field) => (
                <th
                  key={field.key}
                  className={`score-col ${field.columnClassName}`}
                >
                  {field.headerLabel}
                </th>
              ))}
              <th className="problems-col">Проблемы</th>
              <th className="solutions-col">Решения</th>
              <th className="removable-col">Возможно убрать</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row) => {
              const rowUi = props.rowUiById[row.id]
              if (!rowUi) {
                return null
              }
              const hasMultilineField =
                rowUi.title.value.includes("\n") ||
                rowUi.currentProblems.value.includes("\n") ||
                rowUi.solutionVariants.value.includes("\n")
              const rowClassName = [
                props.draggedRowId === row.id ? "drag-source" : "",
                props.collapsedRowIds.has(row.id) ? "is-collapsed" : "",
                props.dropIntent?.type === "between" &&
                props.dropIntent.rowId === row.id
                  ? `drop-between-target-${props.dropIntent.position}`
                  : "",
                props.dropIntent?.type === "nest" &&
                props.dropIntent.targetId === row.id
                  ? "drop-nest-target"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")
              const rowRenderSignature = buildRowRenderSignature(row)
              const editRenderSignature = rowUi.renderSignature
              const isCollapsible = row.children.length > 0
              const isCollapsed = props.collapsedRowIds.has(row.id)
              return (
                <MemoWorkRow
                  key={row.id}
                  rowId={row.id}
                  parentId={row.parentId}
                  depth={row.depth}
                  hasMultilineField={hasMultilineField}
                  className={rowClassName}
                  rowRenderSignature={rowRenderSignature}
                  editRenderSignature={editRenderSignature}
                  registerRowElementRef={props.registerRowElementRef}
                >
                  <td className="work-col">
                    <div
                      className="cell-tree"
                      style={{ "--row-depth": row.depth } as CSSProperties}
                    >
                      <span className="work-number" aria-hidden>
                        {props.numberingById.get(row.id) ?? ""}
                      </span>
                      <button
                        type="button"
                        className="drag-handle"
                        aria-label="Перетащить задачу"
                        title="Перетащить задачу"
                        onPointerDown={(event) =>
                          props.onHandlePointerDown(event, row.id)
                        }
                        onPointerMove={props.onHandlePointerMove}
                        onPointerUp={props.onHandlePointerUp}
                        onPointerCancel={props.onHandlePointerCancel}
                      >
                        <i className="ri-draggable" aria-hidden />
                      </button>
                      <EditableTitleField
                        control={rowUi.title}
                        rowDepth={row.depth}
                        rowTreeIndentPx={props.rowTreeIndentPx}
                        workContentIndentPx={props.workContentIndentPx}
                      />
                      <div className="work-col-actions">
                        {isCollapsible ? (
                          <button
                            type="button"
                            className={[
                              "btn btn-secondary btn-icon collapse-handle",
                              isCollapsed ? "is-collapsed" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            onClick={() => props.onToggleRowCollapse(row.id)}
                            aria-label={
                              isCollapsed
                                ? "Показать вложенные работы"
                                : "Скрыть вложенные работы"
                            }
                            title={
                              isCollapsed
                                ? "Показать вложенные работы"
                                : "Скрыть вложенные работы"
                            }
                          >
                            <i
                              className={
                                isCollapsed
                                  ? "ri-arrow-right-s-line"
                                  : "ri-arrow-down-s-line"
                              }
                              aria-hidden
                            />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-secondary btn-icon delete-handle"
                          onClick={() => props.onDeleteRow(row.id)}
                          aria-label="Удалить"
                          title="Удалить"
                        >
                          <i className="ri-delete-bin-line" aria-hidden />
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="object-col">
                    <EditableInputField
                      className="input-object"
                      dataRowField="object"
                      control={rowUi.object}
                      placeholder="Объект"
                      ariaLabel="Объект"
                    />
                  </td>
                  {rowUi.ratingCells}
                  <td className="problems-col">
                    <EditableTextareaField
                      className="textarea-list"
                      dataRowField="currentProblems"
                      control={rowUi.currentProblems}
                      placeholder="Проблемы"
                      ariaLabel="Проблемы по строкам"
                    />
                  </td>
                  <td className="solutions-col">
                    <EditableTextareaField
                      className="textarea-list"
                      dataRowField="solutionVariants"
                      control={rowUi.solutionVariants}
                      placeholder="Решения"
                      ariaLabel="Решения по строкам"
                    />
                  </td>
                  <td className="removable-col">
                    <label className="possibly-removable-control">
                      <input
                        type="checkbox"
                        checked={rowUi.possiblyRemovable.checked}
                        aria-label="Возможно убрать"
                        onChange={(event) =>
                          rowUi.possiblyRemovable.onChange(event.target.checked)
                        }
                        onFocus={rowUi.possiblyRemovable.onFocus}
                        onBlur={rowUi.possiblyRemovable.onBlur}
                      />
                    </label>
                  </td>
                </MemoWorkRow>
              )
            })}
          </tbody>
        </table>
        <div
          className="work-table-overlay"
          style={
            {
              height: `${props.overlayHeight}px`,
              "--work-col-width": props.tableColumnWidths.work,
              "--content-start-x": `${props.contentStartXPx}px`,
            } as CSSProperties
          }
        >
          {props.overlayAddIndicators.map((indicator) => (
            <div
              key={indicator.laneId}
              className="overlay-add-lane"
              style={
                {
                  top: `${indicator.y}px`,
                  "--lane-content-start-x": `${indicator.contentStartXPx}px`,
                } as CSSProperties
              }
            >
              <div className="overlay-add-hotspot" aria-hidden>
                <button
                  type="button"
                  className="overlay-add-plus"
                  aria-label="Добавить работу между строками"
                  title="Добавить работу"
                  onPointerDown={(event) => {
                    event.preventDefault()
                  }}
                  onClick={() =>
                    props.onCreateAtPosition(
                      indicator.parentId,
                      indicator.targetIndex,
                    )
                  }
                >
                  <i className="ri-add-line" aria-hidden />
                </button>
              </div>
              <span className="overlay-add-line" aria-hidden />
            </div>
          ))}
          {props.overlayDropY !== null ? (
            <div
              className="overlay-drop-line"
              aria-hidden
              style={{
                top: `${Math.round(props.overlayDropY)}px`,
              }}
            />
          ) : null}
          {props.overlayNestTarget ? (
            <div
              className="overlay-drop-nest"
              aria-hidden
              style={{
                top: `${Math.round(props.overlayNestTarget.top)}px`,
                height: `${Math.round(props.overlayNestTarget.height)}px`,
              }}
            />
          ) : null}
        </div>
        {props.dragPreview ? (
          <div
            className="drag-preview"
            aria-hidden
            style={{
              left: `${Math.round(props.dragPreview.x)}px`,
              top: `${Math.round(props.dragPreview.y)}px`,
            }}
          >
            <span className="drag-preview-title">
              {props.dragPreview.title.trim() || "Без названия"}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
