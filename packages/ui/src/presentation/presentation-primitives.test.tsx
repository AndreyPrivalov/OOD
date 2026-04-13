import type { ReactNode } from "react"
import { isValidElement } from "react"
import { describe, expect, it } from "vitest"
import { InlineError } from "./inline-error"
import { SectionCard } from "./section-card"

function collectText(node: ReactNode): string[] {
  if (typeof node === "string" || typeof node === "number") {
    return [String(node)]
  }
  if (Array.isArray(node)) {
    return node.flatMap((entry) => collectText(entry))
  }
  if (!isValidElement(node)) {
    return []
  }
  return collectText(node.props.children)
}

describe("presentation primitives", () => {
  it("renders inline error and section content", () => {
    const rendered = SectionCard({
      title: "Заголовок секции",
      children: InlineError({ message: "Текст ошибки" }),
    })
    const text = collectText(rendered).join(" ")

    expect(text).toContain("Заголовок секции")
    expect(text).toContain("Текст ошибки")
  })
})
