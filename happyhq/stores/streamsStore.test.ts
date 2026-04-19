import { beforeEach, describe, expect, it } from 'vitest'
import { useStreamsStore } from './streamsStore'

describe('streamsStore', () => {
  beforeEach(() => {
    useStreamsStore.setState({
      activeStreamSlug: null,
    })
  })

  describe('activeStreamSlug', () => {
    it('defaults to null', () => {
      expect(useStreamsStore.getState().activeStreamSlug).toBeNull()
    })

    it('setActiveStreamSlug updates the value', () => {
      useStreamsStore.getState().setActiveStreamSlug('my-stream')

      expect(useStreamsStore.getState().activeStreamSlug).toBe('my-stream')
    })

    it('setActiveStreamSlug can clear back to null', () => {
      useStreamsStore.getState().setActiveStreamSlug('my-stream')
      useStreamsStore.getState().setActiveStreamSlug(null)

      expect(useStreamsStore.getState().activeStreamSlug).toBeNull()
    })
  })
})
