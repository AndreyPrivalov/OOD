export const DEFAULT_WORKSPACE_ID = "default-workspace"

export function readWorkspaceId(request: Request): string {
  const url = new URL(request.url)
  return url.searchParams.get("workspaceId") ?? DEFAULT_WORKSPACE_ID
}
