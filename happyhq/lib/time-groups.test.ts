import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { groupByTime } from './time-groups'

type Item = { id: number; time: string }

describe('property-based: groupByTime', () => {
  // Generate items with timestamps spread across various time periods
  const pastDate = fc
    .integer({ min: 0, max: 5 * 365 * 24 * 60 * 60 * 1000 }) // 0–5 years ago
    .map((ms) => new Date(Date.now() - ms).toISOString())

  const item = fc.tuple(fc.nat(), pastDate).map(([id, time]) => ({ id, time }))

  it('every input item appears in exactly one group', () => {
    fc.assert(
      fc.property(fc.array(item, { maxLength: 100 }), (items) => {
        const groups = groupByTime(items, (i) => i.time)
        const allGroupedItems = groups.flatMap((g) => g.items)

        // Total count matches
        expect(allGroupedItems.length).toBe(items.length)

        // Every original item is present
        const groupedIds = new Set(allGroupedItems.map((i) => i.id))
        for (const i of items) {
          expect(groupedIds.has(i.id)).toBe(true)
        }
      }),
    )
  })

  it('no group is ever empty', () => {
    fc.assert(
      fc.property(fc.array(item, { maxLength: 50 }), (items) => {
        const groups = groupByTime(items, (i) => i.time)
        for (const group of groups) {
          expect(group.items.length).toBeGreaterThan(0)
        }
      }),
    )
  })

  it('group labels are never empty or duplicated', () => {
    fc.assert(
      fc.property(fc.array(item, { minLength: 1, maxLength: 50 }), (items) => {
        const groups = groupByTime(items, (i) => i.time)
        const labels = groups.map((g) => g.label)

        // No empty labels
        for (const label of labels) {
          expect(label.length).toBeGreaterThan(0)
        }

        // No duplicate labels
        expect(new Set(labels).size).toBe(labels.length)
      }),
    )
  })

  it('items within a group all belong to the same time bucket', () => {
    fc.assert(
      fc.property(fc.array(item, { minLength: 1, maxLength: 50 }), (items) => {
        const groups = groupByTime(items, (i) => i.time)

        for (const group of groups) {
          if (group.label === 'Today') {
            const startOfToday = new Date()
            startOfToday.setHours(0, 0, 0, 0)
            for (const i of group.items) {
              expect(new Date(i.time).getTime()).toBeGreaterThanOrEqual(
                startOfToday.getTime(),
              )
            }
          }
        }
      }),
    )
  })

  it('empty input produces no groups', () => {
    const groups = groupByTime([], (i: Item) => i.time)
    expect(groups).toEqual([])
  })

  it('groups preserve input order within each bucket', () => {
    // Use array index as unique identifier instead of generated ids
    fc.assert(
      fc.property(
        fc.array(pastDate, { minLength: 2, maxLength: 50 }),
        (times) => {
          const items = times.map((time, i) => ({ id: i, time }))
          const groups = groupByTime(items, (i) => i.time)

          for (const group of groups) {
            // Items within each group should appear in the same relative
            // order as they did in the original array (by unique index)
            for (let j = 1; j < group.items.length; j++) {
              expect(group.items[j].id).toBeGreaterThan(group.items[j - 1].id)
            }
          }
        },
      ),
    )
  })
})
