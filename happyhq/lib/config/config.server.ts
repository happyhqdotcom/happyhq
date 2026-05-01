import { readFileSync } from 'node:fs'
import path from 'node:path'

import { HAPPYHQ_ROOT } from '@/lib/constants.server'
import { readTextFile } from '@/lib/fs/read.server'
import { writeTextFile } from '@/lib/fs/write.server'

import type { AppConfig } from './types'

const CONFIG_PATH = path.join(HAPPYHQ_ROOT, '.settings.json')

/** Read the workspace config file. Returns {} if the file is missing or malformed. */
export async function readConfig(): Promise<AppConfig> {
  const raw = await readTextFile(CONFIG_PATH)
  if (raw === null) return {}
  try {
    return JSON.parse(raw) as AppConfig
  } catch {
    return {}
  }
}

/**
 * Synchronous config read for contexts that can't be async (e.g. initializeGitRepo).
 * Returns {} on any error (ENOENT, malformed JSON).
 */
export function readConfigSync(): AppConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8')
    return JSON.parse(raw) as AppConfig
  } catch {
    return {}
  }
}

/**
 * Write a partial config update. Reads existing config, deep-merges the update,
 * and writes the result back to disk.
 */
export async function writeConfig(update: AppConfig): Promise<AppConfig> {
  const existing = await readConfig()
  const merged = deepMerge(existing, update)
  await writeTextFile(CONFIG_PATH, JSON.stringify(merged, null, 2))
  return merged
}

// Skipping these keys at every merge boundary keeps an attacker who controls
// the source payload from reaching Object.prototype via __proto__ or
// constructor.prototype.
function isUnsafeKey(key: PropertyKey): boolean {
  return key === '__proto__' || key === 'constructor' || key === 'prototype'
}

/** Two-level deep merge — handles the nested sections of AppConfig. */
function deepMerge(target: AppConfig, source: AppConfig): AppConfig {
  const result = { ...target }
  for (const key of Object.keys(source) as (keyof AppConfig)[]) {
    if (isUnsafeKey(key)) continue
    const sourceVal = source[key]
    if (sourceVal === undefined) continue
    const targetVal = result[key]
    if (
      targetVal &&
      typeof targetVal === 'object' &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal)
    ) {
      // Second level merge (e.g. models.learning, limits fields)
      ;(result as Record<string, unknown>)[key] = deepMergeObject(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      )
    } else {
      ;(result as Record<string, unknown>)[key] = sourceVal
    }
  }
  return result
}

function deepMergeObject(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (isUnsafeKey(key)) continue
    const sourceVal = source[key]
    if (sourceVal === undefined) continue
    const targetVal = result[key]
    if (
      targetVal &&
      typeof targetVal === 'object' &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal)
    ) {
      result[key] = {
        ...(targetVal as Record<string, unknown>),
        ...(sourceVal as Record<string, unknown>),
      }
    } else {
      result[key] = sourceVal
    }
  }
  return result
}
