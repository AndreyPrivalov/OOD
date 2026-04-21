export type TitleHotkeyAction =
  | "create-child"
  | "create-sibling"
  | "blur"
  | "cancel"

type ResolveTitleHotkeyActionOptions = {
  key: string
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
}

export function resolveTitleHotkeyAction(
  options: ResolveTitleHotkeyActionOptions,
): TitleHotkeyAction | null {
  const { ctrlKey, key, metaKey, shiftKey } = options
  if (key === "Tab" && !shiftKey) {
    return "create-child"
  }
  if (key === "Enter" && !metaKey && !ctrlKey) {
    if (shiftKey) {
      return "blur"
    }
    return "create-sibling"
  }
  if (key === "Escape") {
    return "cancel"
  }
  return null
}
