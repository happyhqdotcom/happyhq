import { describe, expect, it } from 'vitest'

import { readNDJSON } from './ndjson'

// --- Helpers ---

/** Build a Response whose body streams the given string chunks. */
function streamResponse(...chunks: string[]): Response {
  const encoder = new TextEncoder()
  let index = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index++]))
      } else {
        controller.close()
      }
    },
  })
  return new Response(stream)
}

/** Collect all items from an async generator into an array. */
async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = []
  for await (const item of gen) items.push(item)
  return items
}

// --- Tests ---

describe('readNDJSON', () => {
  it('parses multiple complete lines from a single chunk', async () => {
    const response = streamResponse('{"type":"a","n":1}\n{"type":"b","n":2}\n')
    const items = await collect(
      readNDJSON<{ type: string; n: number }>(response),
    )

    expect(items).toEqual([
      { type: 'a', n: 1 },
      { type: 'b', n: 2 },
    ])
  })

  it('buffers partial lines across chunks', async () => {
    // Split a JSON object across two chunks
    const response = streamResponse('{"type":"sp', 'lit"}\n')
    const items = await collect(readNDJSON(response))

    expect(items).toEqual([{ type: 'split' }])
  })

  it('handles multiple chunks each containing complete lines', async () => {
    const response = streamResponse('{"id":1}\n', '{"id":2}\n', '{"id":3}\n')
    const items = await collect(readNDJSON(response))

    expect(items).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
  })

  it('skips empty and whitespace-only lines', async () => {
    const response = streamResponse('{"a":1}\n\n  \n{"b":2}\n')
    const items = await collect(readNDJSON(response))

    expect(items).toEqual([{ a: 1 }, { b: 2 }])
  })

  it('flushes trailing data without a final newline', async () => {
    const response = streamResponse('{"trailing":true}')
    const items = await collect(readNDJSON(response))

    expect(items).toEqual([{ trailing: true }])
  })

  it('yields nothing for an empty response body', async () => {
    const response = streamResponse('')
    const items = await collect(readNDJSON(response))

    expect(items).toEqual([])
  })

  it('yields nothing for a response with only whitespace', async () => {
    const response = streamResponse('\n  \n\n')
    const items = await collect(readNDJSON(response))

    expect(items).toEqual([])
  })

  it('handles a chunk boundary splitting a multi-byte character', async () => {
    // TextDecoder with { stream: true } should handle split UTF-8 sequences
    const response = streamResponse('{"emoji":"', '\u2764"}\n')
    const items = await collect(readNDJSON(response))

    expect(items).toEqual([{ emoji: '\u2764' }])
  })
})
