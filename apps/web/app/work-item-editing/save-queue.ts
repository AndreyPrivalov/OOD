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
  private idleWaiters: Set<() => void> = new Set()

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

    const result = {
      stale: false,
      acknowledged: true,
      shouldApply: revision === this.latestRevision,
      nextRequest,
    }
    this.notifyIdleIfSettled()
    return result
  }

  fail(revision: number): RevisionedValue<T> | null {
    if (!this.inFlight || this.inFlight.revision !== revision) {
      return null
    }
    this.inFlight = null
    const nextRequest = this.startNext()
    this.notifyIdleIfSettled()
    return nextRequest
  }

  clearQueued() {
    this.queued = null
    this.notifyIdleIfSettled()
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

  waitUntilIdle(): Promise<void> {
    if (!this.hasPending()) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      this.idleWaiters.add(resolve)
    })
  }

  private notifyIdleIfSettled() {
    if (this.hasPending() || this.idleWaiters.size === 0) {
      return
    }
    for (const resolve of this.idleWaiters) {
      resolve()
    }
    this.idleWaiters.clear()
  }
}
