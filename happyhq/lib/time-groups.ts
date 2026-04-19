export type TimeGroup<T> = { label: string; items: T[] }

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/**
 * Groups items into time-based buckets, most recent first.
 * Buckets: Today, Yesterday, Past week, Past 2 weeks, Past month,
 * then month names for the current year, then year labels.
 */
export function groupByTime<T>(
  items: T[],
  getTime: (item: T) => string,
): TimeGroup<T>[] {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  const startOfToday = new Date(year, month, now.getDate())
  const daysAgo = (n: number) => {
    const d = new Date(startOfToday)
    d.setDate(d.getDate() - n)
    return d
  }

  const buckets = new Map<string, T[]>()
  const bucketOrder: string[] = []

  function push(label: string, item: T) {
    if (!buckets.has(label)) {
      buckets.set(label, [])
      bucketOrder.push(label)
    }
    buckets.get(label)!.push(item)
  }

  for (const item of items) {
    const t = new Date(getTime(item))

    if (t >= startOfToday) {
      push('Today', item)
    } else if (t >= daysAgo(1)) {
      push('Yesterday', item)
    } else if (t >= daysAgo(7)) {
      push('Past week', item)
    } else if (t >= daysAgo(14)) {
      push('Past 2 weeks', item)
    } else if (t >= daysAgo(30)) {
      push('Past month', item)
    } else if (t.getFullYear() === year) {
      push(MONTH_NAMES[t.getMonth()], item)
    } else {
      push(String(t.getFullYear()), item)
    }
  }

  return bucketOrder.map((label) => ({ label, items: buckets.get(label)! }))
}
