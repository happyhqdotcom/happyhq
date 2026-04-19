// Consider converting to a server component if this page grows heavier.
// Config is a small file read so there's no real latency win today, but
// server-fetching would eliminate the brief client-side loading state.
// See history/page.tsx for the pattern.
'use client'

import { HomeBrandingPicker } from '@/components/features/settings/home-branding-picker'
import { useConfig, useUpdateConfig } from '@/lib/config/use-config'
import { SettingsRow } from '../_components/settings-row'
import { ListboxRow } from '../_components/settings-rows'
import { SettingsPage, SettingsSection } from '../_components/settings-section'

const ENTER_OPTIONS = [
  { value: 'send', label: 'Send message' },
  { value: 'newline', label: 'New line' },
]

export default function GeneralPage() {
  const { config } = useConfig()
  const updateConfig = useUpdateConfig()

  if (!config) return null

  const enterValue = config.general.sendWithEnter ? 'send' : 'newline'

  return (
    <SettingsPage title="General">
      <SettingsSection title="Preferences">
        <ListboxRow
          label="What does Enter do in chat"
          description="Choose whether Enter sends your message or adds a new line"
          value={enterValue}
          onChange={(val) =>
            updateConfig({ general: { sendWithEnter: val === 'send' } })
          }
          options={ENTER_OPTIONS}
        />
      </SettingsSection>

      <SettingsSection title="Appearance">
        <SettingsRow
          label="Home experience"
          description="Choose the vibe for your home screen"
          className="flex-col items-start"
        >
          <HomeBrandingPicker
            value={config.appearance.homeBranding}
            onChange={(value) =>
              updateConfig({ appearance: { homeBranding: value } })
            }
          />
        </SettingsRow>
      </SettingsSection>
    </SettingsPage>
  )
}
