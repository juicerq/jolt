export function createQueue<T>(initial: T[] = []) {
  const items = initial
  let wake: (() => void) | undefined
  let closed = false

  function notify() {
    wake?.()
    wake = undefined
  }

  return {
    get size() {
      return items.length
    },
    push(item: T) {
      items.push(item)
      notify()
    },
    close() {
      closed = true
      notify()
    },
    async next() {
      if (items.length === 0 && !closed) {
        await new Promise<void>((resolve) => {
          wake = resolve
        })
      }

      return items.shift()
    },
  }
}
