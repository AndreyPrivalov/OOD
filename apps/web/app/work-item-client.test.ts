import { afterEach, describe, expect, it, vi } from "vitest"
import {
  WorkItemRequestError,
  fetchWorkItems,
  patchWorkItem,
} from "./work-item-client"

describe("work-item-client", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("encodes workspace id when loading tree", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "row-1" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )

    const data = await fetchWorkItems("space/with?chars")

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/work-items?workspaceId=space%2Fwith%3Fchars",
      { cache: "no-store" },
    )
    expect(data).toEqual([{ id: "row-1" }])
  })

  it("surfaces API payload through WorkItemRequestError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "EMPTY_TITLE",
          message: "Заголовок не может быть пустым.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )

    await expect(patchWorkItem("row-1", { title: "" })).rejects.toMatchObject({
      constructor: WorkItemRequestError,
      payload: {
        error: "EMPTY_TITLE",
        message: "Заголовок не может быть пустым.",
      },
    })
  })

  it("keeps error stable when response body is not json", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Internal Server Error", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      }),
    )

    await expect(patchWorkItem("row-1", { title: "ok" })).rejects.toMatchObject(
      {
        constructor: WorkItemRequestError,
        payload: null,
        message: "Work item request failed",
      },
    )
  })
})
