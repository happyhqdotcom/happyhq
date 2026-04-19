export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
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
