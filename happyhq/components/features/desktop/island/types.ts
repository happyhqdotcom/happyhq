import type { RunStatus } from '../types'

export function taskSentence(name: string, status: RunStatus): string {
  switch (status) {
    case 'planning':
      return `Planning the ${name} task...`
    case 'plan_ready':
      return `Plan ready for ${name}`
    case 'working':
      return `Working on the ${name} task...`
    case 'completed':
      return `Finished the ${name} task`
    case 'stopped':
      return `Stopped the ${name} task`
    default:
      return `Viewing the ${name} task`
  }
}
