import type { StreamContent } from '@/lib/fs/types'

/**
 * Reminder: Stream Manifest
 *
 * Conditions: Learning mode, stream has any content (playbook, specs, or samples).
 * Why: Without this, Q has to list directories and discover what exists before
 *      it can start reading — 4-6 tool calls of wandering. The manifest lets
 *      Q jump straight to the right files.
 *
 * Mutually exclusive with: New Stream.
 *
 * Example:
 *   ## Stream: apple-pies
 *   Playbook: apple-pies/playbook.md
 *   Specs: apple-pies/specs/crust-types.md, apple-pies/specs/filling-ratios.md
 *   Samples: 3 in apple-pies/samples/classic/
 */
export function streamManifest(
  streamSlug: string,
  content: StreamContent,
): string {
  const lines: string[] = [`## Stream: ${streamSlug}`]

  const hasPlaybookContent = (content.playbookBody ?? '').trim().length > 0
  if (hasPlaybookContent) {
    lines.push(`Playbook: ${streamSlug}/playbook.md`)
  }

  const specNames = content.specs
    .filter((e) => e.type === 'file' && e.name.endsWith('.md'))
    .map((e) => e.name)
  if (specNames.length > 0) {
    lines.push(
      `Specs: ${specNames.map((n) => `${streamSlug}/specs/${n}`).join(', ')}`,
    )
  }

  if (content.samples.length > 0) {
    const categories = [...new Set(content.samples.map((s) => s.category))]
    lines.push(
      `Samples: ${content.samples.length} in ${categories.map((c) => `${streamSlug}/samples/${c}/`).join(', ')}`,
    )
  }

  return lines.join('\n')
}
