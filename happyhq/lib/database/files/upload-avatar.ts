import { db } from '@/lib/database/instant'

export async function uploadAvatar(file: File, userId: string) {
  if (!db) throw new Error('InstantDB not initialized')

  const path = `${userId}/avatar`
  const { data } = await db.storage.uploadFile(path, file, {
    contentType: file.type,
    contentDisposition: 'inline',
  })

  // Fire-and-forget: link the uploaded file to the user
  db.transact(db.tx.$users[userId].link({ avatar: data.id }))
}
