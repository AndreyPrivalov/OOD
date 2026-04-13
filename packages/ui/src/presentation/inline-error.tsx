type InlineErrorProps = {
  message: string
  className?: string
}

export function InlineError(props: InlineErrorProps) {
  return <p className={props.className ?? "error-text"}>{props.message}</p>
}
