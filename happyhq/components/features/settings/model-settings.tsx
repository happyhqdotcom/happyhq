'use client'

import {
  CurrencyRow,
  ListboxRow,
  NumericRow,
} from '@/app/(settings)/settings/_components/settings-rows'
import type { ModelConfig, ModelKey, ThinkingMode } from '@/lib/config/types'
import { useConfig, useUpdateConfig } from '@/lib/config/use-config'

const MODEL_OPTIONS: { value: ModelKey; label: string }[] = [
  { value: 'haiku', label: 'Haiku' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
]

const THINKING_OPTIONS: { value: ThinkingMode; label: string }[] = [
  { value: 'adaptive', label: 'Adaptive' },
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
]

export function AgentSection({
  role,
  modelConfig,
  onModelChange,
  budget,
  onBudgetChange,
  maxIterations,
  onMaxIterationsChange,
}: {
  role: string
  modelConfig: Required<ModelConfig>
  onModelChange: (field: keyof ModelConfig, value: string) => void
  budget?: number
  onBudgetChange?: (value: string) => void
  maxIterations?: number
  onMaxIterationsChange?: (value: string) => void
}) {
  return (
    <>
      <ListboxRow
        label={`${role} model`}
        description={`Select the model to use during ${role}`}
        value={modelConfig.model}
        onChange={(val) => onModelChange('model', val)}
        options={MODEL_OPTIONS}
      />
      <ListboxRow
        label="Deep thinking"
        description="Thinking can improve quality but takes longer"
        value={modelConfig.thinking}
        onChange={(val) => onModelChange('thinking', val)}
        options={THINKING_OPTIONS}
      />
      {budget !== undefined && onBudgetChange && (
        <CurrencyRow
          label={`Max ${role.toLowerCase()} budget`}
          description={`${role} will stop if a single session hits this amount`}
          value={budget}
          onChange={onBudgetChange}
        />
      )}
      {maxIterations !== undefined && onMaxIterationsChange && (
        <NumericRow
          label={`Max ${role.toLowerCase()} turns`}
          description={`${role} will stop after taking this many turns`}
          value={maxIterations}
          onChange={onMaxIterationsChange}
        />
      )}
    </>
  )
}

export function AgentSettings() {
  const { config } = useConfig()
  const updateConfig = useUpdateConfig()

  if (!config) return null

  function handleModelChange(
    role: 'learning' | 'discovery' | 'planning' | 'working',
    field: keyof ModelConfig,
    value: string,
  ) {
    updateConfig({ models: { [role]: { [field]: value } } })
  }

  function handleLimitChange(
    field:
      | 'discoveryBudgetUsd'
      | 'planningBudgetUsd'
      | 'workingBudgetUsd'
      | 'maxIterations',
    value: string,
  ) {
    const num = parseFloat(value)
    if (isNaN(num) || num < 0) return
    updateConfig({ limits: { [field]: num } })
  }

  return { config, handleModelChange, handleLimitChange }
}
