import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  __resetInMemoryStoreForTests,
  InMemoryWorkItemRepository
} from "@ood/db";
import { importWorkItemsFromGoogleSheet } from "./google-sheet-import";

function mockCsvFetch(csv: string): typeof fetch {
  return vi.fn(async () =>
    new Response(csv, {
      status: 200,
      headers: { "content-type": "text/csv" }
    })
  ) as unknown as typeof fetch;
}

describe("importWorkItemsFromGoogleSheet", () => {
  beforeEach(() => {
    __resetInMemoryStoreForTests();
  });

  it("builds parent-child hierarchy and siblingOrder from CSV path+order", async () => {
    const repository = new InMemoryWorkItemRepository();
    const fetchImpl = mockCsvFetch(
      [
        "title,path,order",
        "Root,Root,0",
        "Child B,Root/Child B,1",
        "Child A,Root/Child A,0"
      ].join("\n")
    );

    const result = await importWorkItemsFromGoogleSheet(
      {
        sheetId: "sheet-1",
        workspaceId: "ws",
        mode: "replace"
      },
      { repository, fetchImpl }
    );

    const tree = await repository.listTree("ws");
    expect(result.created).toBe(3);
    expect(tree).toHaveLength(1);
    expect(tree[0].title).toBe("Root");
    expect(tree[0].children.map((child) => child.title)).toEqual(["Child A", "Child B"]);
    expect(tree[0].children.map((child) => child.siblingOrder)).toEqual([0, 1]);
  });

  it("does not write to repository in dryRun mode", async () => {
    const repository = new InMemoryWorkItemRepository();
    await repository.create({ workspaceId: "ws", title: "Existing" });

    const fetchImpl = mockCsvFetch(
      ["title,path", "Root,Root", "Child,Root/Child"].join("\n")
    );

    const result = await importWorkItemsFromGoogleSheet(
      {
        sheetId: "sheet-1",
        workspaceId: "ws",
        mode: "replace",
        dryRun: true
      },
      { repository, fetchImpl }
    );

    const tree = await repository.listTree("ws");
    expect(result.created).toBe(0);
    expect(tree.map((node) => node.title)).toEqual(["Existing"]);
  });

  it("replace mode fully replaces existing workspace tree", async () => {
    const repository = new InMemoryWorkItemRepository();
    await repository.create({ workspaceId: "ws", title: "Old Root" });

    const fetchImpl = mockCsvFetch(["title,path", "New Root,New Root"].join("\n"));

    await importWorkItemsFromGoogleSheet(
      {
        sheetId: "sheet-1",
        workspaceId: "ws",
        mode: "replace"
      },
      { repository, fetchImpl }
    );

    const tree = await repository.listTree("ws");
    expect(tree).toHaveLength(1);
    expect(tree[0].title).toBe("New Root");
  });

  it("merge mode keeps existing nodes and adds new ones", async () => {
    const repository = new InMemoryWorkItemRepository();
    await repository.create({ workspaceId: "ws", title: "Existing Root" });

    const fetchImpl = mockCsvFetch(["title,path", "Imported Root,Imported Root"].join("\n"));

    await importWorkItemsFromGoogleSheet(
      {
        sheetId: "sheet-1",
        workspaceId: "ws",
        mode: "merge"
      },
      { repository, fetchImpl }
    );

    const tree = await repository.listTree("ws");
    const titles = tree.map((node) => node.title).sort();
    expect(titles).toEqual(["Existing Root", "Imported Root"]);
  });

  it("reports parsing and hierarchy errors for invalid rows", async () => {
    const repository = new InMemoryWorkItemRepository();
    const fetchImpl = mockCsvFetch(
      [
        "title,parentTitle,order",
        "Parent,,0",
        ",Parent,1",
        "Child,Missing,2"
      ].join("\n")
    );

    const result = await importWorkItemsFromGoogleSheet(
      {
        sheetId: "sheet-1",
        workspaceId: "ws",
        mode: "replace",
        dryRun: true
      },
      { repository, fetchImpl }
    );

    const errorCodes = result.errors.map((error) => error.code);
    expect(errorCodes).toContain("EMPTY_TITLE");
    expect(errorCodes).toContain("PARENT_TITLE_NOT_FOUND");
  });
});
