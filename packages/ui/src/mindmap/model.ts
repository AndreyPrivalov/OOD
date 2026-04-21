export function buildMindmapNodeClassName(options: {
  nodeId: string
  activeNodeIds: ReadonlySet<string>
  editingNodeIds: ReadonlySet<string>
}) {
  const { activeNodeIds, editingNodeIds, nodeId } = options
  const isEditing = editingNodeIds.has(nodeId)
  const isActive = activeNodeIds.has(nodeId)

  return [
    "workspace-mindmap-node",
    isActive ? "is-active" : "",
    isEditing ? "is-editing" : "",
  ]
    .filter(Boolean)
    .join(" ")
}
