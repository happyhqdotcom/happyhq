import { homedir } from 'os'
import path from 'path'

export const HAPPYHQ_ROOT =
  process.env.HAPPYHQ_ROOT || path.join(homedir(), 'HappyHQ')
