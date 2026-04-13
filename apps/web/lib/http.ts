import { DomainError, DomainErrorCode } from "@ood/domain"
import { NextResponse } from "next/server"

export function jsonError(error: unknown) {
  if (error instanceof DomainError) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: mapDomainErrorToStatus(error.code) },
    )
  }
  const message = error instanceof Error ? error.message : "Unexpected error"
  return NextResponse.json(
    { error: "INTERNAL_ERROR", message },
    { status: 500 },
  )
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
