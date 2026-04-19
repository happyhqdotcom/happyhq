import { db } from '@/lib/database/instant'

export function deleteAvatar(avatarPath: string) {
  if (!db) throw new Error('InstantDB not initialized')
  db.storage.delete(avatarPath)
}
