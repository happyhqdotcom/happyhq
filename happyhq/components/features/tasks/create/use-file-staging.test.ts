import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { useFileStaging } from './use-file-staging'

describe('useFileStaging', () => {
  it('snapshots files synchronously so a caller may clear the FileList immediately after addFiles', () => {
    // The change handler on a hidden <input type="file"> resets `e.target.value = ''`
    // right after calling addFiles, so the user can re-pick the same file. Per the
    // HTML spec, HTMLInputElement.files is [SameObject] — clearing the input mutates
    // the FileList that addFiles received in place. addFiles must capture the file
    // refs synchronously, not defer Array.from inside a setState updater that runs
    // after the FileList has already been emptied.
    //
    // We pair this with a sibling setState so the updater can't be eagerly bailed
    // out — that mirrors the real flow where handleBlur's setExpanded(false) is
    // already queued when the file picker fires onChange (issue #140).
    const file = new File(['x'], 'test.pdf', { type: 'application/pdf' })
    let cleared = false
    const liveList = new Proxy({} as unknown as FileList, {
      get(_target, prop) {
        if (prop === 'length') return cleared ? 0 : 1
        if (prop === '0') return cleared ? undefined : file
        if (prop === 'item') {
          return (i: number) => (cleared ? null : i === 0 ? file : null)
        }
        if (prop === Symbol.iterator) {
          return function* () {
            if (!cleared) yield file
          }
        }
        return undefined
      },
    })

    const { result } = renderHook(() => {
      const [, setTick] = useState(0)
      const staging = useFileStaging()
      return { setTick, staging }
    })

    act(() => {
      result.current.setTick(1)
      result.current.staging.addFiles(liveList)
      cleared = true
    })

    expect(result.current.staging.stagedFiles).toHaveLength(1)
    expect(result.current.staging.stagedFiles[0]?.name).toBe('test.pdf')
  })
})
