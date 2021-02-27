const hasNativePerformanceNow = typeof performance === 'object' && typeof performance.now === 'function'

const now = hasNativePerformanceNow ? () => performance.now() : () => Date.now()

export type TimeoutID = {
  id: any
}

export function cancelTimeout(timeoutID: TimeoutID): void {
  cancelAnimationFrame(timeoutID.id)
}

export function requestTimeout(callback: () => void, delay: number): TimeoutID {
  const start = now()
  let timeoutID = {
    id: -1,
  }

  function tick() {
    if (now() - start >= delay) {
      callback.call(null)
    } else {
      timeoutID.id = requestAnimationFrame(tick)
    }
  }

  timeoutID = {
    id: requestAnimationFrame(tick),
  }

  return timeoutID
}
