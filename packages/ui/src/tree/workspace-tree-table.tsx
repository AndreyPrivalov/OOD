import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  memo,
} from "react"

type TreeRowLike = {
  id: string
  parentId: string | null
  depth: number
  siblingOrder: number
  children: unknown[]
  overcomplication: number | null
  importance: number | null
  blocksMoney: number | null
  overcomplicationTotal?: number
  importanceTotal?: number
  blocksMoneyTotal?: number
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
  parentId: string | null
  targetIndex: number
  showPlus: boolean
}

type TableColumnWidthsLike = {
  work: string
  object: string
  overcomplication: string
  importance: string
  blocksMoney: string
  currentProblems: string
  solutionVariants: string
  removable: string
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

export type WorkspaceTreeTableProps = {
  rows: TreeRowLike[]
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
}

export function WorkspaceTreeTable(props: WorkspaceTreeTableProps) {
  const ratingColumnWidthByKey: Record<string, string> = {
    overcomplication: props.tableColumnWidths.overcomplication,
    importance: props.tableColumnWidths.importance,
    blocksMoney: props.tableColumnWidths.blocksMoney,
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
              "--blocks-money-col-width": props.tableColumnWidths.blocksMoney,
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
                  width: ratingColumnWidthByKey[field.key] ?? "15ch",
                }}
              />
            ))}
            <col style={{ width: props.tableColumnWidths.currentProblems }} />
            <col style={{ width: props.tableColumnWidths.solutionVariants }} />
            <col style={{ width: props.tableColumnWidths.removable }} />
            <col style={{ width: "44px" }} />
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
              <th className="actions-col" aria-label="Удаление" />
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
              const rowRenderSignature = `${row.id}:${row.parentId ?? "root"}:${row.siblingOrder}:${row.depth}`
              const editRenderSignature = rowUi.renderSignature
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
                      <textarea
                        className="input-title textarea-list"
                        data-row-field="title"
                        key={`title:${row.id}:${rowUi.title.value}`}
                        ref={rowUi.title.registerTextareaRef}
                        style={{
                          paddingInlineStart: `${
                            row.depth * props.rowTreeIndentPx +
                            props.workContentIndentPx
                          }px`,
                        }}
                        rows={1}
                        defaultValue={rowUi.title.value}
                        placeholder="Название"
                        aria-label="Название"
                        onFocus={rowUi.title.onFocus}
                        onKeyDown={rowUi.title.onKeyDown}
                        onInput={(event: FormEvent<HTMLTextAreaElement>) =>
                          rowUi.title.onInput?.(event.currentTarget)
                        }
                        onBlur={(event) =>
                          rowUi.title.onBlur(event.currentTarget.value)
                        }
                      />
                    </div>
                  </td>
                  <td className="object-col">
                    <input
                      className="input-object"
                      data-row-field="object"
                      key={`object:${row.id}:${rowUi.object.value}`}
                      defaultValue={rowUi.object.value}
                      placeholder="Объект"
                      aria-label="Объект"
                      onFocus={rowUi.object.onFocus}
                      onBlur={(event) =>
                        rowUi.object.onBlur(event.currentTarget.value)
                      }
                    />
                  </td>
                  {rowUi.ratingCells}
                  <td className="problems-col">
                    <textarea
                      className="textarea-list"
                      data-row-field="currentProblems"
                      ref={rowUi.currentProblems.registerTextareaRef}
                      key={`currentProblems:${row.id}:${rowUi.currentProblems.value}`}
                      rows={1}
                      defaultValue={rowUi.currentProblems.value}
                      placeholder="Проблемы"
                      aria-label="Проблемы по строкам"
                      onFocus={rowUi.currentProblems.onFocus}
                      onBlur={(event) =>
                        rowUi.currentProblems.onBlur(event.currentTarget.value)
                      }
                      onKeyDown={rowUi.currentProblems.onKeyDown}
                      onInput={(event: FormEvent<HTMLTextAreaElement>) =>
                        rowUi.currentProblems.onInput?.(event.currentTarget)
                      }
                    />
                  </td>
                  <td className="solutions-col">
                    <textarea
                      className="textarea-list"
                      data-row-field="solutionVariants"
                      ref={rowUi.solutionVariants.registerTextareaRef}
                      key={`solutionVariants:${row.id}:${rowUi.solutionVariants.value}`}
                      rows={1}
                      defaultValue={rowUi.solutionVariants.value}
                      placeholder="Решения"
                      aria-label="Решения по строкам"
                      onFocus={rowUi.solutionVariants.onFocus}
                      onBlur={(event) =>
                        rowUi.solutionVariants.onBlur(event.currentTarget.value)
                      }
                      onKeyDown={rowUi.solutionVariants.onKeyDown}
                      onInput={(event: FormEvent<HTMLTextAreaElement>) =>
                        rowUi.solutionVariants.onInput?.(event.currentTarget)
                      }
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
                  <td className="actions-col">
                    <div className="cell-actions">
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
              style={{ top: `${indicator.y}px` }}
            >
              <div className="overlay-add-hotspot" aria-hidden>
                <button
                  type="button"
                  className="overlay-add-plus"
                  aria-label="Добавить работу между строками"
                  title="Добавить работу"
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
        </div>
      </div>
    </div>
  )
}
