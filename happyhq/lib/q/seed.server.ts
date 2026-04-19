import { readFileSync } from 'node:fs'
import path from 'node:path'

import { qPath } from '@/lib/fs/paths'
import { ensureDirectory, writeTextFile } from '@/lib/fs/write.server'

/**
 * Seed Q's memory at ~/HappyHQ/.q/.
 * Always overwrites — these are framework files from the source repo,
 * not user content. Ensures dev changes propagate on restart.
 */
export async function seedQMemory(): Promise<void> {
  const root = qPath()
  await Promise.all([
    ensureDirectory(path.join(root, 'specs')),
    ensureDirectory(path.join(root, 'samples', 'playbooks', 'weekly-updates')),
    ensureDirectory(path.join(root, 'samples', 'specs', 'weekly-updates')),
  ])

  const seedDir = path.join(process.cwd(), 'q')
  const seeds = [
    { src: 'playbook.md', dest: path.join(root, 'playbook.md') },
    {
      src: path.join('specs', 'playbook.md'),
      dest: path.join(root, 'specs', 'playbook.md'),
    },
    {
      src: path.join('specs', 'spec.md'),
      dest: path.join(root, 'specs', 'spec.md'),
    },
    {
      src: path.join('samples', 'playbooks', 'weekly-updates', 'playbook.md'),
      dest: path.join(
        root,
        'samples',
        'playbooks',
        'weekly-updates',
        'playbook.md',
      ),
    },
    {
      src: path.join('samples', 'specs', 'weekly-updates', 'spec.md'),
      dest: path.join(root, 'samples', 'specs', 'weekly-updates', 'spec.md'),
    },
  ]

  for (const { src, dest } of seeds) {
    const content = readFileSync(path.join(seedDir, src), 'utf-8')
    await writeTextFile(dest, content)
  }
}
