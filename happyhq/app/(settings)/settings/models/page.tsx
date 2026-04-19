// Consider converting to a server component if this page grows heavier.
// Config is a small file read so there's no real latency win today, but
// server-fetching would eliminate the brief client-side loading state.
// See history/page.tsx for the pattern.
'use client'

import {
  AgentSection,
  AgentSettings,
} from '@/components/features/settings/model-settings'
import { SettingsPage, SettingsSection } from '../_components/settings-section'

export default function ModelsPage() {
  const result = AgentSettings()
  if (!result) return null
  const { config, handleModelChange, handleLimitChange } = result

  return (
    <SettingsPage title="Models & Limits">
      <SettingsSection title="Learning">
        <AgentSection
          role="Learning"
          modelConfig={config.models.learning}
          onModelChange={(field, val) =>
            handleModelChange('learning', field, val)
          }
        />
      </SettingsSection>

      <SettingsSection title="Planning">
        <AgentSection
          role="Planning"
          modelConfig={config.models.planning}
          onModelChange={(field, val) =>
            handleModelChange('planning', field, val)
          }
          budget={config.limits.planningBudgetUsd}
          onBudgetChange={(val) => handleLimitChange('planningBudgetUsd', val)}
        />
      </SettingsSection>

      <SettingsSection title="Working">
        <AgentSection
          role="Working"
          modelConfig={config.models.working}
          onModelChange={(field, val) =>
            handleModelChange('working', field, val)
          }
          budget={config.limits.workingBudgetUsd}
          onBudgetChange={(val) => handleLimitChange('workingBudgetUsd', val)}
          maxIterations={config.limits.maxIterations}
          onMaxIterationsChange={(val) =>
            handleLimitChange('maxIterations', val)
          }
        />
      </SettingsSection>
    </SettingsPage>
  )
}
