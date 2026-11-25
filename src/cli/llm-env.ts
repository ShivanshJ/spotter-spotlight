// Finds the LLM settings for the CLI: process env first, then .env.local / .env files in the
// project and its parent folders up to the repo root, so a key the app already has is reused.
// Only the Spotter and OpenAI variables below are read from those files.
import fs from 'fs'
import path from 'path'
import type { LLMConfig } from '../proxy/llm-client'

const KEYS = ['SPOTTER_LLM_API_KEY', 'OPENAI_API_KEY', 'SPOTTER_LLM_BASE_URL', 'SPOTTER_LLM_MODEL'] as const
type Key = typeof KEYS[number]

export type LLMSettings = { config: LLMConfig | null; keySource?: string }

export function parseDotenv(content: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    const quoted = m[2].match(/^(['"])(.*)\1$/)
    out[m[1]] = quoted ? quoted[2] : m[2].replace(/\s+#.*$/, '')
  }
  return out
}

function envFiles(rootDir: string): string[] {
  const files: string[] = []
  let dir = path.resolve(rootDir)
  for (;;) {
    for (const name of ['.env.local', '.env']) {
      const file = path.join(dir, name)
      if (fs.existsSync(file)) files.push(file)
    }
    const parent = path.dirname(dir)
    if (fs.existsSync(path.join(dir, '.git')) || parent === dir) return files
    dir = parent
  }
}

export function resolveLLMSettings(rootDir: string, env: NodeJS.ProcessEnv = process.env, model?: string): LLMSettings {
  const values: Partial<Record<Key, { value: string; source: string }>> = {}
  for (const key of KEYS) if (env[key]) values[key] = { value: env[key]!, source: `$${key}` }
  for (const file of envFiles(rootDir)) {
    let parsed: Record<string, string> = {}
    try { parsed = parseDotenv(fs.readFileSync(file, 'utf-8')) } catch { parsed = {} }
    for (const key of KEYS) {
      if (!values[key] && parsed[key]) {
        values[key] = { value: parsed[key], source: `${key} in ${path.relative(process.cwd(), file) || file}` }
      }
    }
  }
  const key = values.SPOTTER_LLM_API_KEY ?? values.OPENAI_API_KEY
  if (!key) return { config: null }
  return {
    config: {
      apiKey: key.value,
      baseURL: values.SPOTTER_LLM_BASE_URL?.value,
      model: model ?? values.SPOTTER_LLM_MODEL?.value,
    },
    keySource: key.source,
  }
}
