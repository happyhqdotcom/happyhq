export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureDataRoot, DataRootError } =
      await import('@/lib/fs/data-root.server')
    try {
      ensureDataRoot()
    } catch (error) {
      if (error instanceof DataRootError) {
        // Print and stop further startup work. Downstream fs entry points
        // (e.g. readStreams) re-call ensureDataRoot and throw the cached
        // error, so the app surfaces the same message to anyone who hits it.
        console.error(error.message)
        return
      }
      throw error
    }
    const { initializeGitRepo } = await import('@/lib/git/init.server')
    const { seedQMemory } = await import('@/lib/q/seed.server')
    try {
      initializeGitRepo()
    } catch (error) {
      console.error('[HappyHQ] Git initialization failed:', error)
      // Non-fatal — app continues. Git is invisible infrastructure.
    }
    try {
      await seedQMemory()
    } catch (error) {
      console.error('[HappyHQ] Q memory seeding failed:', error)
      // Non-fatal — Q can still run, just without quality specs.
    }
  }
}
