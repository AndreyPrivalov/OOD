import { DomainError, DomainErrorCode } from "@ood/domain"
import { NextResponse } from "next/server"

export function jsonData<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init)
}

export function jsonInvalidPayload(details: unknown) {
  return jsonErrorCode("INVALID_PAYLOAD", 400, { details })
}

export function jsonErrorCode(
  error: string,
  status: number,
  extras?: { details?: unknown; message?: string },
) {
  return NextResponse.json(
    {
      error,
      ...(extras?.message ? { message: extras.message } : {}),
      ...(extras?.details === undefined ? {} : { details: extras.details }),
    },
    { status },
  )
}

export function jsonError(error: unknown) {
  if (error instanceof DomainError) {
    return jsonErrorCode(error.code, mapDomainErrorToStatus(error.code), {
      message: error.message,
    })
  }

  const message =
    error instanceof Error && error.message.trim().length > 0
      ? error.message
      : "Unexpected error"
  return jsonErrorCode("INTERNAL_ERROR", 500, { message })
}

function mapDomainErrorToStatus(code: DomainErrorCode): number {
  if (code === DomainErrorCode.PARENT_NOT_FOUND) {
    return 404
  }
  if (code === DomainErrorCode.CYCLE_DETECTED) {
    return 409
  }
  return 400
}
