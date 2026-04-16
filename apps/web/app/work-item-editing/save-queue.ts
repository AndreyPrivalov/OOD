export type RevisionedValue<T> = {
  revision: number
  value: T
}

export type AcknowledgeResult<T> = {
  stale: boolean
  acknowledged: boolean
  shouldApply: boolean
  nextRequest: RevisionedValue<T> | null
}

export class LocalFirstRowQueue<T> {
  private nextRevision = 1
  private latestRevision = 0
  private inFlight: RevisionedValue<T> | null = null
  private queued: RevisionedValue<T> | null = null

  enqueue(value: T): RevisionedValue<T> {
    const revisioned = {
      revision: this.nextRevision++,
      value,
    }
    this.latestRevision = revisioned.revision
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
        acknowledged: false,
        shouldApply: false,
        nextRequest: null,
      }
    }

    this.inFlight = null
    const nextRequest = this.startNext()

    return {
      stale: false,
      acknowledged: true,
      shouldApply: revision === this.latestRevision,
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
