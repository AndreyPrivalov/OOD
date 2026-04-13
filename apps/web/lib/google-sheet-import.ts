import { createSign } from "node:crypto"
import type { WorkItemRepository } from "@ood/db"
import type { WorkTreeReadNode, WorkspaceId } from "@ood/domain"

type ImportMode = "replace" | "merge"

type ImportRequest = {
  sheetUrl?: string
  sheetId?: string
  workspaceId?: string
  mode?: ImportMode
  dryRun?: boolean
}

type Logger = Pick<Console, "info" | "warn">

type ImportError = {
  row: number | null
  code: string
  message: string
}

type ImportAction = {
  action: "create" | "update" | "skip"
  path: string
  title: string
  parentPath: string | null
  siblingOrder: number
  reason?: string
}

type ImportResult = {
  workspaceId: string
  mode: ImportMode
  dryRun: boolean
  source: "csv" | "sheets-api"
  rowCount: number
  nodeCount: number
  created: number
  updated: number
  skipped: number
  errors: ImportError[]
  actions: ImportAction[]
}

type ParsedRow = {
  rowNumber: number
  title: string
  parentTitle: string | null
  path: string | null
  order: number | null
  level: number | null
  parseError: string | null
}

type PlannedNode = {
  tempId: string
  parentTempId: string | null
  title: string
  pathSegments: string[]
  siblingOrder: number
  firstRowNumber: number
  explicitOrder: number | null
  explicit: boolean
}

type ExistingNode = {
  id: string
  title: string
  parentId: string | null
  siblingOrder: number
  pathKey: string
}

type ServiceDeps = {
  repository: WorkItemRepository
  fetchImpl?: typeof fetch
  logger?: Logger
  env?: NodeJS.ProcessEnv
}

type SheetsCredentials = {
  clientEmail: string
  privateKey: string
}

const DEFAULT_WORKSPACE_ID = "default-workspace"
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

export async function importWorkItemsFromGoogleSheet(
  request: ImportRequest,
  deps: ServiceDeps,
): Promise<ImportResult> {
  const workspaceId = request.workspaceId?.trim() || DEFAULT_WORKSPACE_ID
  const mode: ImportMode = request.mode ?? "replace"
  const dryRun = request.dryRun ?? false
  const logger = deps.logger ?? console

  const sourceRows = await readGoogleSheetRows(
    request,
    deps.fetchImpl ?? fetch,
    deps.env,
  )
  const parsedRows = parseRows(sourceRows.rows)
  const planning = buildPlan(parsedRows)

  const result: ImportResult = {
    workspaceId,
    mode,
    dryRun,
    source: sourceRows.source,
    rowCount: parsedRows.length,
    nodeCount: planning.nodes.length,
    created: 0,
    updated: 0,
    skipped: planning.skipped,
    errors: [...planning.errors],
    actions: [],
  }

  if (planning.nodes.length === 0) {
    return result
  }

  if (mode === "replace") {
    for (const node of planning.nodes) {
      result.actions.push({
        action: "create",
        path: pathLabel(node.pathSegments),
        title: node.title,
        parentPath: node.parentTempId
          ? pathLabel(node.pathSegments.slice(0, -1))
          : null,
        siblingOrder: node.siblingOrder,
      })
    }

    if (dryRun) {
      return result
    }

    await deps.repository.replaceWorkspaceTree(
      workspaceId,
      planning.nodes.map((node) => ({
        tempId: node.tempId,
        parentTempId: node.parentTempId,
        title: node.title,
        siblingOrder: node.siblingOrder,
      })),
    )
    result.created = planning.nodes.length
    logger.info(
      `[import] Google Sheets replace completed: created=${result.created}, workspaceId=${workspaceId}`,
    )
    return result
  }

  const existingTree = await deps.repository.listTree(
    workspaceId as WorkspaceId,
  )
  const existingIndex = indexExistingNodes(existingTree)
  const resolvedNodeIds = new Map<string, string>()

  for (const node of planning.nodes) {
    const currentPath = node.tempId
    const parentId = node.parentTempId
      ? (resolvedNodeIds.get(node.parentTempId) ?? null)
      : null

    if (node.parentTempId && !parentId) {
      result.errors.push({
        row: node.firstRowNumber,
        code: "UNRESOLVED_PARENT",
        message: `Parent node is unresolved for ${pathLabel(node.pathSegments)}`,
      })
      result.actions.push({
        action: "skip",
        path: pathLabel(node.pathSegments),
        title: node.title,
        parentPath: pathLabel(node.pathSegments.slice(0, -1)),
        siblingOrder: node.siblingOrder,
        reason: "Parent node could not be resolved",
      })
      result.skipped += 1
      continue
    }

    const candidates = existingIndex.get(currentPath) ?? []
    if (candidates.length > 1) {
      result.errors.push({
        row: node.firstRowNumber,
        code: "AMBIGUOUS_EXISTING_PATH",
        message: `More than one existing work item matches path ${pathLabel(node.pathSegments)}`,
      })
      result.actions.push({
        action: "skip",
        path: pathLabel(node.pathSegments),
        title: node.title,
        parentPath: node.parentTempId
          ? pathLabel(node.pathSegments.slice(0, -1))
          : null,
        siblingOrder: node.siblingOrder,
        reason: "Ambiguous existing path",
      })
      result.skipped += 1
      continue
    }

    if (candidates.length === 1) {
      const existing = candidates[0]
      resolvedNodeIds.set(node.tempId, existing.id)
      const needsMove =
        existing.parentId !== parentId ||
        existing.siblingOrder !== node.siblingOrder
      if (!needsMove) {
        result.actions.push({
          action: "skip",
          path: pathLabel(node.pathSegments),
          title: node.title,
          parentPath: node.parentTempId
            ? pathLabel(node.pathSegments.slice(0, -1))
            : null,
          siblingOrder: node.siblingOrder,
          reason: "Already up to date",
        })
        result.skipped += 1
        continue
      }

      result.actions.push({
        action: "update",
        path: pathLabel(node.pathSegments),
        title: node.title,
        parentPath: node.parentTempId
          ? pathLabel(node.pathSegments.slice(0, -1))
          : null,
        siblingOrder: node.siblingOrder,
      })
      if (!dryRun) {
        await deps.repository.move(existing.id, {
          targetParentId: parentId,
          targetIndex: node.siblingOrder,
        })
      }
      result.updated += 1
      continue
    }

    result.actions.push({
      action: "create",
      path: pathLabel(node.pathSegments),
      title: node.title,
      parentPath: node.parentTempId
        ? pathLabel(node.pathSegments.slice(0, -1))
        : null,
      siblingOrder: node.siblingOrder,
    })
    if (!dryRun) {
      const created = await deps.repository.create({
        workspaceId,
        title: node.title,
        parentId,
        siblingOrder: node.siblingOrder,
        object: null,
        overcomplication: null,
        importance: null,
        blocksMoney: null,
        currentProblems: [],
        solutionVariants: [],
      })
      resolvedNodeIds.set(node.tempId, created.id)
    } else {
      resolvedNodeIds.set(node.tempId, `dry:${node.tempId}`)
    }
    result.created += 1
  }

  logger.info(
    `[import] Google Sheets merge completed: created=${result.created}, updated=${result.updated}, skipped=${result.skipped}, workspaceId=${workspaceId}`,
  )
  return result
}

function indexExistingNodes(
  tree: WorkTreeReadNode[],
): Map<string, ExistingNode[]> {
  const index = new Map<string, ExistingNode[]>()
  const visit = (nodes: WorkTreeReadNode[], parentPath: string[]) => {
    for (const node of nodes) {
      const pathSegments = [...parentPath, node.title.trim()]
      const key = pathKey(pathSegments)
      const entry: ExistingNode = {
        id: node.id,
        title: node.title,
        parentId: node.parentId,
        siblingOrder: node.siblingOrder,
        pathKey: key,
      }
      const bucket = index.get(key) ?? []
      bucket.push(entry)
      index.set(key, bucket)
      visit(node.children, pathSegments)
    }
  }
  visit(tree, [])
  return index
}

function buildPlan(rows: ParsedRow[]): {
  nodes: PlannedNode[]
  errors: ImportError[]
  skipped: number
} {
  const errors: ImportError[] = []
  const validRows: ParsedRow[] = []

  for (const row of rows) {
    if (row.parseError) {
      errors.push({
        row: row.rowNumber,
        code: "INVALID_ROW",
        message: row.parseError,
      })
      continue
    }
    if (row.title.trim().length === 0) {
      errors.push({
        row: row.rowNumber,
        code: "EMPTY_TITLE",
        message: "Row skipped because title is empty",
      })
      continue
    }
    validRows.push(row)
  }

  const explicitNodes = new Map<
    string,
    { rowNumber: number; order: number | null }
  >()
  const titleByKey = new Map<string, string>()

  const rowsWithPath = validRows.filter(
    (row) => row.path && row.path.trim().length > 0,
  )
  const rowsWithoutPath = validRows.filter(
    (row) => !row.path || row.path.trim().length === 0,
  )

  for (const row of rowsWithPath) {
    const parsedSegments = splitPath(row.path ?? "")
    if (parsedSegments.length === 0) {
      errors.push({
        row: row.rowNumber,
        code: "INVALID_PATH",
        message: "path is empty after parsing",
      })
      continue
    }

    const normalizedTitle = normalizeKey(row.title)
    const pathLast = normalizeKey(parsedSegments[parsedSegments.length - 1])
    const fullSegments =
      pathLast === normalizedTitle
        ? parsedSegments
        : [...parsedSegments, row.title]

    let parentSegments: string[] = []
    for (const segment of fullSegments) {
      const currentSegments = [...parentSegments, segment]
      const key = pathKey(currentSegments)
      if (!titleByKey.has(key)) {
        titleByKey.set(key, segment.trim())
      }
      parentSegments = currentSegments
    }

    const key = pathKey(fullSegments)
    if (explicitNodes.has(key)) {
      errors.push({
        row: row.rowNumber,
        code: "DUPLICATE_PATH",
        message: `Duplicate row for path ${pathLabel(fullSegments)}`,
      })
      continue
    }
    explicitNodes.set(key, { rowNumber: row.rowNumber, order: row.order })
    titleByKey.set(key, row.title)
  }

  const parentRowsValidation = validateParentTitleRows(rowsWithoutPath)
  errors.push(...parentRowsValidation.errors)

  for (const resolved of parentRowsValidation.rows) {
    const key = pathKey(resolved.pathSegments)
    if (explicitNodes.has(key)) {
      errors.push({
        row: resolved.rowNumber,
        code: "DUPLICATE_PATH",
        message: `Duplicate row for path ${pathLabel(resolved.pathSegments)}`,
      })
      continue
    }
    explicitNodes.set(key, {
      rowNumber: resolved.rowNumber,
      order: resolved.order,
    })
    titleByKey.set(key, resolved.title)
  }

  const nodeByKey = new Map<string, PlannedNode>()

  for (const [key, title] of titleByKey.entries()) {
    const parts = key.split("/")
    const parentParts = parts.slice(0, -1)
    const parentKey = parentParts.length > 0 ? pathKey(parentParts) : null
    const explicit = explicitNodes.get(key)
    nodeByKey.set(key, {
      tempId: key,
      parentTempId: parentKey,
      title,
      pathSegments: parts,
      siblingOrder: 0,
      firstRowNumber: explicit?.rowNumber ?? 0,
      explicitOrder: explicit?.order ?? null,
      explicit: Boolean(explicit),
    })
  }

  const childrenByParent = new Map<string | null, PlannedNode[]>()
  for (const node of nodeByKey.values()) {
    const bucket = childrenByParent.get(node.parentTempId) ?? []
    bucket.push(node)
    childrenByParent.set(node.parentTempId, bucket)
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) => {
      const aOrder = a.explicitOrder ?? Number.MAX_SAFE_INTEGER
      const bOrder = b.explicitOrder ?? Number.MAX_SAFE_INTEGER
      if (aOrder !== bOrder) return aOrder - bOrder
      if (a.firstRowNumber !== b.firstRowNumber) {
        return a.firstRowNumber - b.firstRowNumber
      }
      return normalizeKey(a.title).localeCompare(normalizeKey(b.title))
    })
    siblings.forEach((node, index) => {
      node.siblingOrder = index
    })
  }

  const ordered: PlannedNode[] = []
  const visit = (parentKey: string | null) => {
    const siblings = childrenByParent.get(parentKey) ?? []
    for (const node of siblings) {
      ordered.push(node)
      visit(node.tempId)
    }
  }
  visit(null)

  return {
    nodes: ordered,
    errors,
    skipped: errors.length,
  }
}

function validateParentTitleRows(rows: ParsedRow[]): {
  rows: Array<{
    title: string
    rowNumber: number
    order: number | null
    pathSegments: string[]
  }>
  errors: ImportError[]
} {
  const errors: ImportError[] = []
  if (rows.length === 0) {
    return { rows: [], errors }
  }

  const normalizedTitleCount = new Map<string, number>()
  for (const row of rows) {
    normalizedTitleCount.set(
      normalizeKey(row.title),
      (normalizedTitleCount.get(normalizeKey(row.title)) ?? 0) + 1,
    )
  }

  const duplicateTitles = new Set<string>()
  for (const [title, count] of normalizedTitleCount.entries()) {
    if (count > 1) duplicateTitles.add(title)
  }

  const uniqueRows = rows.filter((row) => {
    const key = normalizeKey(row.title)
    if (!duplicateTitles.has(key)) {
      return true
    }
    errors.push({
      row: row.rowNumber,
      code: "DUPLICATE_TITLE",
      message: `Duplicate title "${row.title}" without path. Provide path to disambiguate.`,
    })
    return false
  })

  const byTitle = new Map<string, ParsedRow>()
  for (const row of uniqueRows) {
    byTitle.set(normalizeKey(row.title), row)
  }

  for (const row of uniqueRows) {
    if (!row.parentTitle) continue
    const parentKey = normalizeKey(row.parentTitle)
    if (!byTitle.has(parentKey)) {
      errors.push({
        row: row.rowNumber,
        code: "PARENT_TITLE_NOT_FOUND",
        message: `Parent title "${row.parentTitle}" was not found in sheet rows without path`,
      })
    }
  }

  const graph = new Map<string, string | null>()
  for (const row of uniqueRows) {
    graph.set(
      normalizeKey(row.title),
      row.parentTitle ? normalizeKey(row.parentTitle) : null,
    )
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()

  function hasCycle(node: string): boolean {
    if (visited.has(node)) return false
    if (visiting.has(node)) return true
    visiting.add(node)
    const parent = graph.get(node)
    if (parent && graph.has(parent) && hasCycle(parent)) {
      return true
    }
    visiting.delete(node)
    visited.add(node)
    return false
  }

  for (const node of graph.keys()) {
    if (hasCycle(node)) {
      errors.push({
        row: byTitle.get(node)?.rowNumber ?? null,
        code: "CYCLE_DETECTED",
        message: `Cycle detected in parentTitle chain for title "${byTitle.get(node)?.title ?? node}"`,
      })
    }
  }

  const invalidRows = new Set<number>()
  for (const error of errors) {
    if (error.row !== null) invalidRows.add(error.row)
  }

  const resolved = uniqueRows
    .filter((row) => !invalidRows.has(row.rowNumber))
    .map((row) => ({
      title: row.title,
      rowNumber: row.rowNumber,
      order: row.order,
      pathSegments: resolvePathFromParentChain(row, byTitle),
    }))

  return { rows: resolved, errors }
}

function resolvePathFromParentChain(
  row: ParsedRow,
  byTitle: Map<string, ParsedRow>,
): string[] {
  const segments: string[] = []
  let current: ParsedRow | undefined = row
  const guard = new Set<number>()
  while (current) {
    if (guard.has(current.rowNumber)) {
      break
    }
    guard.add(current.rowNumber)
    segments.push(current.title)
    if (!current.parentTitle) {
      break
    }
    current = byTitle.get(normalizeKey(current.parentTitle))
  }
  return segments.reverse()
}

function parseRows(rows: string[][]): ParsedRow[] {
  if (rows.length === 0) {
    throw new Error("Sheet is empty")
  }

  const headerRow = rows[0].map((cell) => normalizeKey(cell))
  const titleIndex = findHeaderIndex(headerRow, ["title", "работа"])
  if (titleIndex < 0) {
    throw new Error('Sheet must include "title" column (or localized alias)')
  }

  const parentTitleIndex = findHeaderIndex(headerRow, [
    "parenttitle",
    "parent_title",
    "для чего (родительская работа)",
    "родительская работа",
  ])
  const pathIndex = findHeaderIndex(headerRow, ["path"])
  const orderIndex = findHeaderIndex(headerRow, [
    "order",
    "siblingorder",
    "sibling_order",
  ])
  const levelIndex = findHeaderIndex(headerRow, ["level", "уровень"])

  if (parentTitleIndex < 0 && pathIndex < 0 && levelIndex < 0) {
    throw new Error(
      'Sheet must include either "parentTitle", "path" or "level" column',
    )
  }

  const parsed: ParsedRow[] = []
  const levelStack: string[] = []
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i] ?? []
    const rowNumber = i + 1
    const title = (row[titleIndex] ?? "").trim()
    if (title.length === 0) {
      parsed.push({
        rowNumber,
        title: "",
        parentTitle: null,
        path: null,
        order: null,
        level: null,
        parseError: null,
      })
      continue
    }

    const parentTitle =
      parentTitleIndex >= 0
        ? (row[parentTitleIndex] ?? "").trim() || null
        : null
    let path = pathIndex >= 0 ? (row[pathIndex] ?? "").trim() || null : null
    let level: number | null = null

    if (levelIndex >= 0) {
      const rawLevel = (row[levelIndex] ?? "").trim()
      if (rawLevel.length > 0) {
        const parsedLevel = Number(rawLevel)
        if (!Number.isInteger(parsedLevel) || parsedLevel < 1) {
          parsed.push({
            rowNumber,
            title,
            parentTitle,
            path,
            order: null,
            level: null,
            parseError: `Invalid level value \"${rawLevel}\"`,
          })
          continue
        }

        if (parsedLevel > levelStack.length + 1) {
          parsed.push({
            rowNumber,
            title,
            parentTitle,
            path,
            order: null,
            level: parsedLevel,
            parseError: `Invalid nesting jump at level ${parsedLevel}`,
          })
          continue
        }

        level = parsedLevel
        const parentSegments = levelStack.slice(0, parsedLevel - 1)
        path = [...parentSegments, title].join("/")
        levelStack.length = parsedLevel - 1
        levelStack.push(title)
      }
    }

    let order: number | null = null
    if (orderIndex >= 0) {
      const value = (row[orderIndex] ?? "").trim()
      if (value.length > 0) {
        const parsedOrder = Number(value)
        if (!Number.isInteger(parsedOrder) || parsedOrder < 0) {
          parsed.push({
            rowNumber,
            title,
            parentTitle,
            path,
            order: null,
            level,
            parseError: `Invalid order value \"${value}\"`,
          })
          continue
        }
        order = parsedOrder
      }
    }

    parsed.push({
      rowNumber,
      title,
      parentTitle,
      path,
      order,
      level,
      parseError: null,
    })
  }

  return parsed
}

function splitPath(path: string): string[] {
  return path
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
}

function findHeaderIndex(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const index = headers.findIndex((value) => value === alias)
    if (index >= 0) {
      return index
    }
  }
  return -1
}

function normalizeKey(input: string): string {
  return input.trim().toLowerCase()
}

function pathKey(segments: string[]): string {
  return segments.map((segment) => normalizeKey(segment)).join("/")
}

function pathLabel(segments: string[]): string {
  return segments.join("/")
}

async function readGoogleSheetRows(
  request: ImportRequest,
  fetchImpl: typeof fetch,
  env: NodeJS.ProcessEnv | undefined,
): Promise<{ source: "csv" | "sheets-api"; rows: string[][] }> {
  const sheetId = resolveSheetId(request)

  const csvUrl = buildCsvExportUrl(request.sheetUrl, sheetId)
  try {
    const response = await fetchImpl(csvUrl, {
      headers: {
        accept: "text/csv",
      },
    })
    if (response.ok) {
      const csv = await response.text()
      return {
        source: "csv",
        rows: parseCsv(csv),
      }
    }
  } catch {
    // ignore and fallback to Sheets API if credentials are available
  }

  const credentials = readSheetsCredentials(env ?? process.env)
  if (!credentials) {
    throw new Error(
      "Unable to read sheet via public CSV export and Google Sheets credentials are not configured",
    )
  }

  const accessToken = await getGoogleAccessToken(fetchImpl, credentials)
  const title = await readFirstSheetTitle(fetchImpl, sheetId, accessToken)
  const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(title)}?majorDimension=ROWS`
  const valuesResponse = await fetchImpl(valuesUrl, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  })
  if (!valuesResponse.ok) {
    throw new Error(
      `Failed to read sheet values: HTTP ${valuesResponse.status}`,
    )
  }
  const payload = (await valuesResponse.json()) as { values?: unknown }
  const rows = Array.isArray(payload.values)
    ? payload.values.map((row) =>
        Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : [],
      )
    : []

  return {
    source: "sheets-api",
    rows,
  }
}

function resolveSheetId(request: ImportRequest): string {
  if (request.sheetId?.trim()) {
    return request.sheetId.trim()
  }
  if (!request.sheetUrl) {
    throw new Error("Either sheetUrl or sheetId is required")
  }
  const match = request.sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!match?.[1]) {
    throw new Error("Invalid Google Sheets URL")
  }
  return match[1]
}

function buildCsvExportUrl(
  sheetUrl: string | undefined,
  sheetId: string,
): string {
  if (!sheetUrl) {
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`
  }
  try {
    const url = new URL(sheetUrl)
    const gid = url.searchParams.get("gid")
    if (gid && gid.length > 0) {
      return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${encodeURIComponent(gid)}`
    }
  } catch {
    // fallback to default gid
  }
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`
}

function readSheetsCredentials(
  env: NodeJS.ProcessEnv,
): SheetsCredentials | null {
  const clientEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim()
  const privateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n",
  )
  if (!clientEmail || !privateKey) {
    return null
  }
  return {
    clientEmail,
    privateKey,
  }
}

async function getGoogleAccessToken(
  fetchImpl: typeof fetch,
  credentials: SheetsCredentials,
): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000)
  const jwtHeader = base64UrlEncode(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  )
  const jwtPayload = base64UrlEncode(
    JSON.stringify({
      iss: credentials.clientEmail,
      scope: GOOGLE_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      exp: nowSeconds + 3600,
      iat: nowSeconds,
    }),
  )
  const unsigned = `${jwtHeader}.${jwtPayload}`
  const signer = createSign("RSA-SHA256")
  signer.update(unsigned)
  signer.end()
  const signature = signer.sign(credentials.privateKey)
  const assertion = `${unsigned}.${toBase64Url(signature)}`

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  })

  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  })

  if (!response.ok) {
    throw new Error(
      `Failed to obtain Google access token: HTTP ${response.status}`,
    )
  }

  const payload = (await response.json()) as { access_token?: unknown }
  if (
    typeof payload.access_token !== "string" ||
    payload.access_token.length === 0
  ) {
    throw new Error("Google access token response is missing access_token")
  }
  return payload.access_token
}

async function readFirstSheetTitle(
  fetchImpl: typeof fetch,
  sheetId: string,
  accessToken: string,
): Promise<string> {
  const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}?fields=sheets.properties.title`
  const response = await fetchImpl(metadataUrl, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  })
  if (!response.ok) {
    throw new Error(
      `Failed to read spreadsheet metadata: HTTP ${response.status}`,
    )
  }
  const payload = (await response.json()) as {
    sheets?: Array<{ properties?: { title?: unknown } }>
  }
  const title = payload.sheets?.[0]?.properties?.title
  if (typeof title !== "string" || title.trim().length === 0) {
    throw new Error("Spreadsheet has no readable sheet title")
  }
  return title
}

function base64UrlEncode(value: string): string {
  return toBase64Url(Buffer.from(value, "utf8"))
}

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i]
    const next = csv[i + 1]

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"'
        i += 1
      } else if (char === '"') {
        inQuotes = false
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }

    if (char === ",") {
      row.push(field)
      field = ""
      continue
    }

    if (char === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
      continue
    }

    if (char === "\r") {
      continue
    }

    field += char
  }

  row.push(field)
  if (row.length > 1 || row[0] !== "") {
    rows.push(row)
  }

  return rows
}
