export type RevisionedValue<T> = {
  revision: number
  value: T
}

export type AcknowledgeResult<T> = {
  stale: boolean
  accepted: boolean
  shouldApply: boolean
  hasNewerLocal: boolean
  nextRequest: RevisionedValue<T> | null
}

export class LocalFirstRowQueue<T> {
  private nextRevision = 1
  private lastLocalRevision = 0
  private lastAckRevision = 0
  private inFlight: RevisionedValue<T> | null = null
  private queued: RevisionedValue<T> | null = null

  enqueue(value: T): RevisionedValue<T> {
    const revisioned = {
      revision: this.nextRevision++,
      value,
    }
    this.lastLocalRevision = revisioned.revision
    this.queued = revisioned
    return revisioned
  }

  startNext(): RevisionedValue<T> | null {
    if (this.inFlight || !this.queued) {
      return null
    }
    this.inFlight = this.queued
    this.queued = null
    return this.inFlight
  }

  acknowledge(revision: number): AcknowledgeResult<T> {
    if (!this.inFlight || this.inFlight.revision !== revision) {
      return {
        stale: true,
        accepted: false,
        shouldApply: false,
        hasNewerLocal: this.lastLocalRevision > revision,
        nextRequest: null,
      }
    }

    this.inFlight = null
    this.lastAckRevision = Math.max(this.lastAckRevision, revision)
    const hasNewerLocal = this.lastLocalRevision > revision
    const nextRequest = this.startNext()

    return {
      stale: false,
      accepted: true,
      shouldApply: !hasNewerLocal,
      hasNewerLocal,
      nextRequest,
    }
  }

  fail(revision: number): RevisionedValue<T> | null {
    if (!this.inFlight || this.inFlight.revision !== revision) {
      return null
    }
    this.inFlight = null
    return this.startNext()
  }

  clearQueued() {
    this.queued = null
  }

  getLastLocalRevision() {
    return this.lastLocalRevision
  }

  getLastAckRevision() {
    return this.lastAckRevision
  }

  hasInFlight() {
    return this.inFlight !== null
  }

  hasQueued() {
    return this.queued !== null
  }

  hasPending() {
    return this.hasInFlight() || this.hasQueued()
  }
}
export type RowEditPatch = {
  title?: string
  object?: string
  possiblyRemovable?: boolean
  overcomplication?: string
  importance?: string
  blocksMoney?: string
  currentProblems?: string
  solutionVariants?: string
}
