import { describe, expect, it } from 'vitest'

import { StderrBuffer } from './stderr-buffer.server'

describe('StderrBuffer', () => {
  describe('write', () => {
    it('splits input by newline and stores complete lines', () => {
      const buf = new StderrBuffer()
      buf.write('line one\nline two\n')

      expect(buf.getLines()).toEqual(['line one', 'line two'])
    })

    it('buffers partial lines across consecutive calls', () => {
      const buf = new StderrBuffer()
      buf.write('partial')
      expect(buf.getLines()).toEqual([])

      buf.write(' continued\n')
      expect(buf.getLines()).toEqual(['partial continued'])
    })

    it('completes partial line when next chunk starts with continuation', () => {
      const buf = new StderrBuffer()
      buf.write('start')
      buf.write(' middle')
      buf.write(' end\n')

      expect(buf.getLines()).toEqual(['start middle end'])
    })

    it('evicts oldest lines when maxLines cap is exceeded', () => {
      const buf = new StderrBuffer(3)
      buf.write('a\nb\nc\nd\ne\n')

      expect(buf.getLines()).toEqual(['c', 'd', 'e'])
    })

    it('skips empty lines between newlines', () => {
      const buf = new StderrBuffer()
      buf.write('first\n\n\nsecond\n')

      expect(buf.getLines()).toEqual(['first', 'second'])
    })
  })

  describe('getLines', () => {
    it('returns all captured complete lines', () => {
      const buf = new StderrBuffer()
      buf.write('alpha\nbeta\ngamma\n')

      expect(buf.getLines()).toEqual(['alpha', 'beta', 'gamma'])
    })

    it('returns empty array for empty buffer', () => {
      const buf = new StderrBuffer()
      expect(buf.getLines()).toEqual([])
    })
  })

  describe('getTail', () => {
    it('returns last n lines joined by newline', () => {
      const buf = new StderrBuffer()
      buf.write('a\nb\nc\nd\ne\nf\n')

      expect(buf.getTail(3)).toBe('d\ne\nf')
    })

    it('defaults to 5 lines', () => {
      const buf = new StderrBuffer()
      buf.write('1\n2\n3\n4\n5\n6\n7\n')

      expect(buf.getTail()).toBe('3\n4\n5\n6\n7')
    })

    it('returns empty string for empty buffer', () => {
      const buf = new StderrBuffer()
      expect(buf.getTail()).toBe('')
    })
  })
})
