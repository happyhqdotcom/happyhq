import { ActivityTimeline } from '@/components/features/settings/activity-timeline'
import { AuthorSettings } from '@/components/features/settings/author-settings'
import { DangerZone } from '@/components/features/settings/danger-zone'
import { getGitLog } from '@/lib/git/log.server'

import { SettingsPage, SettingsSection } from '../_components/settings-section'

const FETCH_SIZE = 200

export default function HistoryPage() {
  const entries = getGitLog(FETCH_SIZE)

  return (
    <SettingsPage title="History">
      <SettingsSection title="Author">
        <AuthorSettings />
      </SettingsSection>

      <SettingsSection title="Activity">
        <ActivityTimeline entries={entries} />
      </SettingsSection>

      <SettingsSection title="Danger Zone">
        <DangerZone />
      </SettingsSection>
    </SettingsPage>
  )
}
