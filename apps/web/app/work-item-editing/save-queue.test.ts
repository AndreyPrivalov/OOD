import { describe, expect, it } from "vitest"
import { LocalFirstRowQueue } from "./save-queue"

describe("local-first autosave queue", () => {
  it("keeps newest draft and does not apply stale ack", () => {
    const queue = new LocalFirstRowQueue<string>()
    const first = queue.enqueue("v1")
    expect(first.revision).toBe(1)
    expect(queue.startNext()?.revision).toBe(1)

    const second = queue.enqueue("v2")
    expect(second.revision).toBe(2)

    const firstAck = queue.acknowledge(1)
    expect(firstAck.stale).toBe(false)
    expect(firstAck.shouldApply).toBe(false)
    expect(firstAck.hasNewerLocal).toBe(true)
    expect(firstAck.nextRequest?.revision).toBe(2)

    const duplicateAck = queue.acknowledge(1)
    expect(duplicateAck.stale).toBe(true)
    expect(duplicateAck.accepted).toBe(false)

    const secondAck = queue.acknowledge(2)
    expect(secondAck.stale).toBe(false)
    expect(secondAck.shouldApply).toBe(true)
    expect(secondAck.nextRequest).toBeNull()
    expect(queue.hasPending()).toBe(false)
  })

  it("coalesces bursts into one queued revision", () => {
    const queue = new LocalFirstRowQueue<string>()
    queue.enqueue("v1")
    queue.startNext()
    queue.enqueue("v2")
    const third = queue.enqueue("v3")

    const firstAck = queue.acknowledge(1)
    expect(firstAck.nextRequest?.revision).toBe(third.revision)
    expect(firstAck.nextRequest?.value).toBe("v3")
  })

  it("can drop queued revision without affecting in-flight request", () => {
    const queue = new LocalFirstRowQueue<string>()
    queue.enqueue("v1")
    expect(queue.startNext()?.revision).toBe(1)

    queue.enqueue("v2")
    queue.clearQueued()

    const firstAck = queue.acknowledge(1)
    expect(firstAck.nextRequest).toBeNull()
    expect(queue.hasPending()).toBe(false)
  })
})
