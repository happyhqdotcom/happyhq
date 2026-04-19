'use client'

import { useCallback } from 'react'
import useSWR from 'swr'

import { fetcher } from '@/lib/swr'

import type { AppConfig, ResolvedConfig } from './types'

const CONFIG_KEY = '/api/config'

/** SWR hook for the workspace config. Returns resolved config with all defaults filled in. */
export function useConfig() {
  const { data, error, isLoading, mutate } = useSWR<ResolvedConfig>(
    CONFIG_KEY,
    fetcher,
  )
  return { config: data, error, isLoading, mutate }
}

/** Returns a function that sends a partial config update and refreshes the SWR cache. */
export function useUpdateConfig() {
  const { mutate } = useConfig()

  const updateConfig = useCallback(
    async (partial: Partial<AppConfig>) => {
      const res = await fetch(CONFIG_KEY, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      })
      if (!res.ok) throw new Error('Failed to update config')
      const updated = await res.json()
      mutate(updated, false)
      return updated as ResolvedConfig
    },
    [mutate],
  )

  return updateConfig
}
