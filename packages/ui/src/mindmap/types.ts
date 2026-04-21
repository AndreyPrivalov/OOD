export type MindmapViewport = {
  x: number
  y: number
  zoom: number
}

export type MindmapNode = {
  id: string
  label: string
  x: number
  y: number
  width?: number
  height?: number
}

export type MindmapEdge = {
  id?: string
  fromId: string
  toId: string
}

export type MindmapViewportChangeReason = "pan" | "zoom"

export type MindmapViewportChangeMeta = {
  reason: MindmapViewportChangeReason
}
