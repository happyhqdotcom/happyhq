import { SettingsPanel } from './settings-panel'

/** Page-level wrapper: renders the page title and wraps children. */
export function SettingsPage({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h1 className="text-lg font-semibold text-zinc-950">{title}</h1>
      {children}
    </div>
  )
}

/**
 * A titled section: renders a small heading above a SettingsPanel card.
 * Replaces the repeated `<h2>` + `<SettingsPanel className="mt-2">` pair.
 */
export function SettingsSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <>
      <h2 className="mt-8 text-xs font-medium text-zinc-500">{title}</h2>
      <SettingsPanel className="mt-2">{children}</SettingsPanel>
    </>
  )
}
