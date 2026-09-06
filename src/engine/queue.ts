export function createQueue<T extends object>({ initial = [], signal, onClose }: { initial?: T[]; signal?: AbortSignal; onClose: () => void }) {
  const items = [...initial]
  const waiting: ((result: IteratorResult<T, void>) => void)[] = []
  let closed = false

  function close() {
    if (closed) {
      return
    }

    closed = true
    signal?.removeEventListener("abort", cancel)

    for (const resolve of waiting.splice(0)) {
      resolve({ done: true, value: undefined })
    }

    onClose()
  }

  function cancel() {
    items.length = 0
    close()
  }

  signal?.throwIfAborted()
  signal?.addEventListener("abort", cancel, { once: true })

  return {
    push(item: T) {
      if (closed) {
        return
      }

      const resolve = waiting.shift()

      if (resolve) {
        resolve({ done: false, value: item })
        return
      }

      items.push(item)
    },
    close,
    [Symbol.asyncIterator](): AsyncIterableIterator<T, void> {
      return {
        [Symbol.asyncIterator]() {
          return this
        },
        async next() {
          const item = items.shift()

          if (item) {
            return { done: false, value: item }
          }

          if (closed) {
            return { done: true, value: undefined }
          }

          return new Promise<IteratorResult<T, void>>((resolve) => waiting.push(resolve))
        },
        async return() {
          cancel()

          return { done: true, value: undefined }
        },
      }
    },
  }
}
