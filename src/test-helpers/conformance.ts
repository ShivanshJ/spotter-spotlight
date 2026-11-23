import fs from 'fs'
import { fileURLToPath } from 'url'
import { SpotterConfigSchema } from '../types'
import type { SpotterConfig } from '../types'

const conformanceDir = fileURLToPath(new URL('../../conformance/', import.meta.url))

export function readConformanceText(name: string): string {
  return fs.readFileSync(conformanceDir + name, 'utf-8').trim()
}

export function readConformanceJson<T>(name: string): T {
  return JSON.parse(readConformanceText(name)) as T
}

export function loadConformanceConfig(): SpotterConfig {
  return SpotterConfigSchema.parse(readConformanceJson('config.json'))
}
