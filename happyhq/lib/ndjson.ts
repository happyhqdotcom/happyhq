/**
 * Parse an NDJSON response body into an async generator of typed events.
 * Each line of the response is a JSON object separated by newlines.
 *
 * Generic so it can be used for ChatStreamEvent (chat) and
 * ChatStreamEvent (task run stream) without duplication.
 */
export async function* readNDJSON<T = unknown>(
  response: Response,
): AsyncGenerator<T> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()! // Keep incomplete line in buffer
    for (const line of lines) {
      if (line.trim()) yield JSON.parse(line)
    }
  }
  if (buffer.trim()) yield JSON.parse(buffer)
}
