import { reportError } from '@/lib/report-error'

export class FetchError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) {
      if (res.status >= 500) {
        reportError('client.fetch.error', { url, status: res.status })
      }
      throw new FetchError(res.statusText, res.status)
    }
    return res.json()
  })
