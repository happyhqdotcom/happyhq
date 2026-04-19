// User type matching the $users entity in the InstantDB schema.
// createdAt is a number (epoch milliseconds from Date.now()).

export type User = {
  id: string
  email: string
  name?: string
  createdAt: number
}
