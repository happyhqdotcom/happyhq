'use client'

import { SettingsRow } from '@/app/(settings)/settings/_components/settings-row'
import { SettingsSection } from '@/app/(settings)/settings/_components/settings-section'
import { Avatar } from '@/components/common/catalyst/avatar'
import { Button } from '@/components/common/catalyst/button'
import { Input } from '@/components/common/catalyst/input'
import { DeleteAlert } from '@/components/common/shared/delete-alert'
import { useCurrentUser } from '@/lib/accounts/hooks'
import { uploadAvatar } from '@/lib/database/files/upload-avatar'
import { db } from '@/lib/database/instant'
import { Pencil } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useRef, useState } from 'react'

const MAX_AVATAR_SIZE = 5 * 1024 * 1024 // 5MB

function getInitials(email: string, name?: string): string {
  if (name) {
    return name
      .split(' ')
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase()
  }
  return email[0]?.toUpperCase() ?? '?'
}

/**
 * Account settings: display name (editable), email (read-only), avatar (uploadable).
 * Profile data is fetched via InstantDB reactive query for real-time updates.
 * Sign-out lives in the settings sidebar; billing has its own sidebar link.
 */
export function AccountSettings() {
  const { user, isLoading, token } = useCurrentUser()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // Fetch the full user profile from InstantDB (name, avatar, etc.).
  // useAuth() only returns id and email — $users query gets custom fields.
  const profileQuery = db?.useQuery(
    user ? { $users: { $: { where: { id: user.id } }, avatar: {} } } : null,
  )
  const profile = profileQuery?.data?.$users?.[0]

  // Derive display values from the profile query (real-time) with auth fallbacks
  const displayName = profile?.name ?? ''
  const displayEmail = profile?.email ?? user?.email ?? ''
  const displayAvatar = profile?.avatar?.url ?? null

  const [nameInput, setNameInput] = useState<string | null>(null)
  // Show the input value if the user has edited it, otherwise show the profile value
  const nameValue = nameInput ?? displayName

  const handleSave = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const name = (nameInput ?? displayName).trim()
      if (!name || !db || !user) return

      setSaveError(null)

      // Client-side fire-and-forget — permissions allow self-update
      db.transact(db.tx.$users[user.id].update({ name }))
      setSaveSuccess(true)
      setNameInput(null) // Reset to track from profile query
      // Clear success message after 2 seconds
      setTimeout(() => setSaveSuccess(false), 2000)
    },
    [nameInput, displayName, user],
  )

  const handleAvatarChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !user) return

      if (file.size > MAX_AVATAR_SIZE) {
        setSaveError('Avatar must be under 5MB')
        return
      }

      setUploadingAvatar(true)
      setSaveError(null)

      try {
        await uploadAvatar(file, user.id)
      } catch {
        setSaveError('Failed to upload avatar')
      } finally {
        setUploadingAvatar(false)
        // Reset input so re-selecting the same file triggers onChange
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [user],
  )

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    setDeleteError(null)

    try {
      const res = await fetch('/api/accounts/delete', {
        method: 'POST',
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        setDeleteError(data.error ?? 'Failed to delete account')
        setDeleting(false)
        return
      }

      // Sign out client-side after server-side deletion
      if (db) {
        db.auth.signOut()
      }
      router.push('/login')
    } catch {
      setDeleteError('Failed to delete account. Please try again.')
      setDeleting(false)
    }
  }, [router])

  if (isLoading) {
    return <p className="text-sm text-zinc-500">Loading...</p>
  }

  if (!user) {
    return null
  }

  const hasChanges = nameInput !== null && nameInput.trim() !== displayName

  return (
    <>
      <SettingsSection title="Profile">
        <form onSubmit={handleSave}>
          <SettingsRow label="Photo">
            <>
              <button
                type="button"
                className="group relative cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
              >
                <Avatar
                  src={displayAvatar}
                  initials={getInitials(
                    displayEmail,
                    profile?.name as string | undefined,
                  )}
                  avatarDimensions={32}
                  className="h-8 w-8"
                />
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <Pencil className="h-3 w-3 text-white" />
                </div>
                {uploadingAvatar && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  </div>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </>
          </SettingsRow>

          <SettingsRow label="Display name">
            <Input
              id="settings-name"
              type="text"
              value={nameValue}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Your name"
              className="max-w-[200px] text-right"
            />
          </SettingsRow>

          <SettingsRow label="Email">
            <p className="text-sm text-zinc-500">{displayEmail}</p>
          </SettingsRow>

          {(hasChanges || saveSuccess) && (
            <div className="flex items-center gap-3 border-t border-zinc-950/5 py-3">
              {hasChanges && <Button type="submit">Save changes</Button>}
              {saveSuccess && (
                <span className="text-sm text-green-600" role="status">
                  Saved
                </span>
              )}
            </div>
          )}

          {saveError && (
            <p className="py-2 text-sm text-red-600" role="alert">
              {saveError}
            </p>
          )}
        </form>
      </SettingsSection>

      <SettingsSection title="Danger Zone">
        <SettingsRow
          label="Delete account"
          description="Permanently delete your account and all associated data"
        >
          <Button
            plain
            className="text-red-600! hover:text-red-700!"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete account'}
          </Button>
        </SettingsRow>
        {deleteError && (
          <p className="px-1 py-2 text-sm text-red-600" role="alert">
            {deleteError}
          </p>
        )}
      </SettingsSection>

      <DeleteAlert
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete account"
        description="This will permanently delete your account and all associated data. This action cannot be undone."
        onDelete={handleDelete}
      />
    </>
  )
}
