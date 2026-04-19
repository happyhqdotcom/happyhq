import { describe, expect, it } from 'vitest'
import schema from './schema'

describe('InstantDB schema', () => {
  describe('$users entity', () => {
    it('has all expected attributes including stripeCustomerId', () => {
      const attrs = schema.entities.$users.attrs
      expect(Object.keys(attrs)).toEqual(
        expect.arrayContaining([
          'email',
          'name',
          'createdAt',
          'stripeCustomerId',
        ]),
      )
    })

    it('email is a required, unique, indexed string', () => {
      const email = schema.entities.$users.attrs.email
      expect(email.valueType).toBe('string')
      expect(email.required).toBe(true)
      expect(email.config.unique).toBe(true)
      expect(email.config.indexed).toBe(true)
    })

    it('name is an optional string', () => {
      const name = schema.entities.$users.attrs.name
      expect(name.valueType).toBe('string')
      expect(name.required).toBe(false)
    })

    it('createdAt is an optional date', () => {
      const createdAt = schema.entities.$users.attrs.createdAt
      expect(createdAt.valueType).toBe('date')
      expect(createdAt.required).toBe(false)
    })

    it('stripeCustomerId is an optional string', () => {
      const stripeCustomerId = schema.entities.$users.attrs.stripeCustomerId
      expect(stripeCustomerId.valueType).toBe('string')
      expect(stripeCustomerId.required).toBe(false)
    })

    it('has links to subscriptions, usage, and avatar', () => {
      const links = schema.entities.$users.links
      expect(links.subscriptions).toMatchObject({
        entityName: 'subscriptions',
      })
      expect(links.usage).toMatchObject({ entityName: 'usage' })
      expect(links.avatar).toMatchObject({ entityName: '$files' })
    })
  })

  describe('subscriptions entity', () => {
    it('has all expected attributes', () => {
      const attrs = schema.entities.subscriptions.attrs
      expect(Object.keys(attrs)).toEqual(
        expect.arrayContaining([
          'stripeSubscriptionId',
          'tier',
          'status',
          'currentPeriodStart',
          'currentPeriodEnd',
        ]),
      )
    })

    it('stripeSubscriptionId is a required indexed string', () => {
      const attr = schema.entities.subscriptions.attrs.stripeSubscriptionId
      expect(attr.valueType).toBe('string')
      expect(attr.required).toBe(true)
      expect(attr.config.indexed).toBe(true)
    })

    it('tier and status are required strings', () => {
      const tier = schema.entities.subscriptions.attrs.tier
      expect(tier.valueType).toBe('string')
      expect(tier.required).toBe(true)

      const status = schema.entities.subscriptions.attrs.status
      expect(status.valueType).toBe('string')
      expect(status.required).toBe(true)
    })

    it('period dates are required', () => {
      const start = schema.entities.subscriptions.attrs.currentPeriodStart
      expect(start.valueType).toBe('date')
      expect(start.required).toBe(true)

      const end = schema.entities.subscriptions.attrs.currentPeriodEnd
      expect(end.valueType).toBe('date')
      expect(end.required).toBe(true)
    })

    it('links to $users via user label', () => {
      expect(schema.entities.subscriptions.links.user).toMatchObject({
        entityName: '$users',
      })
    })
  })

  describe('usage entity', () => {
    it('has all expected attributes', () => {
      const attrs = schema.entities.usage.attrs
      expect(Object.keys(attrs)).toEqual(
        expect.arrayContaining([
          'periodStart',
          'periodEnd',
          'usedMinutes',
          'includedMinutes',
        ]),
      )
    })

    it('period dates are required', () => {
      expect(schema.entities.usage.attrs.periodStart.valueType).toBe('date')
      expect(schema.entities.usage.attrs.periodStart.required).toBe(true)
      expect(schema.entities.usage.attrs.periodEnd.valueType).toBe('date')
      expect(schema.entities.usage.attrs.periodEnd.required).toBe(true)
    })

    it('minute counters are required numbers', () => {
      expect(schema.entities.usage.attrs.usedMinutes.valueType).toBe('number')
      expect(schema.entities.usage.attrs.usedMinutes.required).toBe(true)
      expect(schema.entities.usage.attrs.includedMinutes.valueType).toBe(
        'number',
      )
      expect(schema.entities.usage.attrs.includedMinutes.required).toBe(true)
    })

    it('links to $users and taskRuns', () => {
      expect(schema.entities.usage.links.user).toMatchObject({
        entityName: '$users',
      })
      expect(schema.entities.usage.links.taskRuns).toMatchObject({
        entityName: 'taskRuns',
      })
    })
  })

  describe('taskRuns entity', () => {
    it('has all expected attributes', () => {
      const attrs = schema.entities.taskRuns.attrs
      expect(Object.keys(attrs)).toEqual(
        expect.arrayContaining([
          'stream',
          'task',
          'startedAt',
          'endedAt',
          'minutes',
          'status',
        ]),
      )
    })

    it('stream and task are required strings', () => {
      expect(schema.entities.taskRuns.attrs.stream.valueType).toBe('string')
      expect(schema.entities.taskRuns.attrs.stream.required).toBe(true)
      expect(schema.entities.taskRuns.attrs.task.valueType).toBe('string')
      expect(schema.entities.taskRuns.attrs.task.required).toBe(true)
    })

    it('startedAt is required, endedAt is optional', () => {
      expect(schema.entities.taskRuns.attrs.startedAt.valueType).toBe('date')
      expect(schema.entities.taskRuns.attrs.startedAt.required).toBe(true)
      expect(schema.entities.taskRuns.attrs.endedAt.valueType).toBe('date')
      expect(schema.entities.taskRuns.attrs.endedAt.required).toBe(false)
    })

    it('minutes is a required number', () => {
      expect(schema.entities.taskRuns.attrs.minutes.valueType).toBe('number')
      expect(schema.entities.taskRuns.attrs.minutes.required).toBe(true)
    })

    it('status is a required string', () => {
      expect(schema.entities.taskRuns.attrs.status.valueType).toBe('string')
      expect(schema.entities.taskRuns.attrs.status.required).toBe(true)
    })

    it('links to usage via usagePeriod label', () => {
      expect(schema.entities.taskRuns.links.usagePeriod).toMatchObject({
        entityName: 'usage',
      })
    })
  })

  describe('links', () => {
    it('userSubscriptions connects subscriptions to $users', () => {
      const link = schema.links.userSubscriptions
      expect(link.forward).toMatchObject({
        on: 'subscriptions',
        has: 'one',
        label: 'user',
      })
      expect(link.reverse).toMatchObject({
        on: '$users',
        has: 'many',
        label: 'subscriptions',
      })
    })

    it('userUsage connects usage to $users', () => {
      const link = schema.links.userUsage
      expect(link.forward).toMatchObject({
        on: 'usage',
        has: 'one',
        label: 'user',
      })
      expect(link.reverse).toMatchObject({
        on: '$users',
        has: 'many',
        label: 'usage',
      })
    })

    it('usageTaskRuns connects taskRuns to usage', () => {
      const link = schema.links.usageTaskRuns
      expect(link.forward).toMatchObject({
        on: 'taskRuns',
        has: 'one',
        label: 'usagePeriod',
      })
      expect(link.reverse).toMatchObject({
        on: 'usage',
        has: 'many',
        label: 'taskRuns',
      })
    })

    it('userAvatar connects $users to $files', () => {
      const link = schema.links.userAvatar
      expect(link.forward).toMatchObject({
        on: '$users',
        has: 'one',
        label: 'avatar',
      })
      expect(link.reverse).toMatchObject({
        on: '$files',
        has: 'one',
        label: 'user',
      })
    })
  })
})
