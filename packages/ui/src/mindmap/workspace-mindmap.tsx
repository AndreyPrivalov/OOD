import {
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { buildMindmapNodeClassName } from "./model"
import type {
  MindmapEdge,
  MindmapNode,
  MindmapViewport,
  MindmapViewportChangeMeta,
} from "./types"

const DEFAULT_NODE_WIDTH = 220
const DEFAULT_NODE_HEIGHT = 44
const DEFAULT_MIN_ZOOM = 0.4
const DEFAULT_MAX_ZOOM = 2.2
const DEFAULT_ZOOM_STEP = 0.12

type WorkspaceMindmapProps = {
  nodes: MindmapNode[]
  edges: MindmapEdge[]
  viewport: MindmapViewport
  onViewportChange: (
    next: MindmapViewport,
    meta: MindmapViewportChangeMeta,
  ) => void
  activeNodeIds?: readonly string[]
  editingNodeIds?: readonly string[]
  className?: string
  emptyMessage?: string
  minZoom?: number
  maxZoom?: number
  zoomStep?: number
  ariaLabel?: string
  viewportFrameRef?: MutableRefObject<HTMLDivElement | null>
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function WorkspaceMindmap(props: WorkspaceMindmapProps) {
  const [isPanning, setIsPanning] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    clientX: number
    clientY: number
  } | null>(null)
  const internalFrameRef = useRef<HTMLDivElement | null>(null)

  const nodesById = useMemo(() => {
    const map = new Map<string, MindmapNode>()
    for (const node of props.nodes) {
      map.set(node.id, node)
    }
    return map
  }, [props.nodes])

  const activeNodeIds = useMemo(
    () => new Set(props.activeNodeIds ?? []),
    [props.activeNodeIds],
  )
  const editingNodeIds = useMemo(
    () => new Set(props.editingNodeIds ?? []),
    [props.editingNodeIds],
  )

  const minZoom = props.minZoom ?? DEFAULT_MIN_ZOOM
  const maxZoom = props.maxZoom ?? DEFAULT_MAX_ZOOM
  const zoomStep = props.zoomStep ?? DEFAULT_ZOOM_STEP

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return
    }
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    }
    setIsPanning(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    const deltaX = event.clientX - drag.clientX
    const deltaY = event.clientY - drag.clientY
    if (deltaX === 0 && deltaY === 0) {
      return
    }
    dragRef.current = {
      ...drag,
      clientX: event.clientX,
      clientY: event.clientY,
    }
    props.onViewportChange(
      {
        x: props.viewport.x + deltaX,
        y: props.viewport.y + deltaY,
        zoom: props.viewport.zoom,
      },
      { reason: "pan" },
    )
  }

  const stopPanning = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    dragRef.current = null
    setIsPanning(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handleWheel = (event: WheelEvent) => {
    const frameElement =
      props.viewportFrameRef?.current ?? internalFrameRef.current
    if (!frameElement) {
      return
    }
    event.preventDefault()
    event.stopPropagation()

    const direction = event.deltaY < 0 ? 1 : -1
    const zoomFactor = 1 + zoomStep * direction
    const currentZoom = props.viewport.zoom
    const nextZoom = clamp(currentZoom * zoomFactor, minZoom, maxZoom)

    if (nextZoom === currentZoom) {
      return
    }

    const rect = frameElement.getBoundingClientRect()
    const localX = event.clientX - rect.left
    const localY = event.clientY - rect.top
    const worldX = (localX - props.viewport.x) / currentZoom
    const worldY = (localY - props.viewport.y) / currentZoom

    props.onViewportChange(
      {
        x: localX - worldX * nextZoom,
        y: localY - worldY * nextZoom,
        zoom: nextZoom,
      },
      { reason: "zoom" },
    )
  }

  useEffect(() => {
    const frameElement = internalFrameRef.current
    if (!frameElement) {
      return
    }

    frameElement.addEventListener("wheel", handleWheel, { passive: false })
    return () => {
      frameElement.removeEventListener("wheel", handleWheel)
    }
  })

  const className = [props.className, "workspace-mindmap"]
    .filter(Boolean)
    .join(" ")

  return (
    <div
      ref={(node) => {
        internalFrameRef.current = node
        if (props.viewportFrameRef) {
          props.viewportFrameRef.current = node
        }
      }}
      className={className}
      style={{
        ...frameStyle,
        cursor: isPanning ? "grabbing" : "grab",
      }}
      role="img"
      aria-label={props.ariaLabel ?? "Mindmap рабочей структуры"}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopPanning}
      onPointerCancel={stopPanning}
    >
      {props.nodes.length === 0 ? (
        <div style={emptyStyle}>
          {props.emptyMessage ?? "Нет узлов для отображения"}
        </div>
      ) : null}
      <svg width="100%" height="100%" style={svgStyle}>
        <title>{props.ariaLabel ?? "Mindmap рабочей структуры"}</title>
        <g transform={`translate(${props.viewport.x} ${props.viewport.y})`}>
          <g transform={`scale(${props.viewport.zoom})`}>
            {props.edges.map((edge, index) => {
              const fromNode = nodesById.get(edge.fromId)
              const toNode = nodesById.get(edge.toId)
              if (!fromNode || !toNode) {
                return null
              }
              const fromWidth = fromNode.width ?? DEFAULT_NODE_WIDTH
              const fromHeight = fromNode.height ?? DEFAULT_NODE_HEIGHT
              const toHeight = toNode.height ?? DEFAULT_NODE_HEIGHT
              const x1 = fromNode.x + fromWidth
              const y1 = fromNode.y + fromHeight / 2
              const x2 = toNode.x
              const y2 = toNode.y + toHeight / 2

              return (
                <line
                  key={edge.id ?? `${edge.fromId}-${edge.toId}-${index}`}
                  className="workspace-mindmap-edge"
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  style={edgeStyle}
                />
              )
            })}
            {props.nodes.map((node) => {
              const width = node.width ?? DEFAULT_NODE_WIDTH
              const height = node.height ?? DEFAULT_NODE_HEIGHT
              const isEditing = editingNodeIds.has(node.id)
              const isActive = activeNodeIds.has(node.id)

              return (
                <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
                  <rect
                    className={buildMindmapNodeClassName({
                      nodeId: node.id,
                      activeNodeIds,
                      editingNodeIds,
                    })}
                    rx={8}
                    width={width}
                    height={height}
                    style={{
                      ...nodeStyle,
                      ...(isActive ? nodeActiveStyle : null),
                      ...(isEditing ? nodeEditingStyle : null),
                    }}
                  />
                  <text
                    x={12}
                    y={height / 2 + 1}
                    style={labelStyle}
                    dominantBaseline="middle"
                  >
                    {node.label}
                  </text>
                </g>
              )
            })}
          </g>
        </g>
      </svg>
      <div
        style={hudStyle}
      >{`Zoom ${Math.round(props.viewport.zoom * 100)}%`}</div>
    </div>
  )
}

const frameStyle: CSSProperties = {
  position: "relative",
  minHeight: "320px",
  border: "1px solid var(--line)",
  borderRadius: "12px",
  background:
    "linear-gradient(180deg, rgba(26, 32, 36, 0.02) 0%, rgba(26, 32, 36, 0.05) 100%)",
  overflow: "hidden",
  overscrollBehavior: "contain",
  touchAction: "none",
  userSelect: "none",
}

const svgStyle: CSSProperties = {
  position: "relative",
  display: "block",
}

const edgeStyle: CSSProperties = {
  stroke: "rgba(35, 44, 50, 0.34)",
  strokeWidth: 1.5,
  vectorEffect: "non-scaling-stroke",
}

const nodeStyle: CSSProperties = {
  fill: "rgba(255, 255, 255, 0.96)",
  stroke: "rgba(35, 44, 50, 0.2)",
  strokeWidth: 1,
}

const nodeActiveStyle: CSSProperties = {
  stroke: "rgba(35, 44, 50, 0.52)",
}

const nodeEditingStyle: CSSProperties = {
  fill: "rgba(246, 250, 247, 0.98)",
  stroke: "rgba(40, 82, 55, 0.52)",
  strokeWidth: 1.5,
}

const labelStyle: CSSProperties = {
  fill: "rgba(35, 44, 50, 0.94)",
  fontSize: "14px",
  fontWeight: 500,
  letterSpacing: "0.01em",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
  pointerEvents: "none",
}

const hudStyle: CSSProperties = {
  position: "absolute",
  top: "10px",
  right: "12px",
  background: "rgba(255, 255, 255, 0.84)",
  border: "1px solid rgba(35, 44, 50, 0.12)",
  borderRadius: "999px",
  padding: "2px 8px",
  fontSize: "12px",
  color: "rgba(35, 44, 50, 0.74)",
}

const emptyStyle: CSSProperties = {
  position: "absolute",
  inset: "0",
  display: "grid",
  placeItems: "center",
  color: "rgba(35, 44, 50, 0.66)",
  fontSize: "14px",
}
