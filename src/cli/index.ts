import path from 'path'
import { analyze } from './analyze'
import type { LLMConfig } from '../proxy/llm-client'

const args = process.argv.slice(2)
const command = args[0]

function flag(name: string): string | undefined {
  const idx = args.indexOf(name)
  return idx !== -1 ? args[idx + 1] : undefined
}

if (command === 'analyze') {
  const rootDir = path.resolve(flag('--root') ?? process.cwd())
  const outputPath = path.resolve(flag('--output') ?? path.join(rootDir, 'spotter.config.json'))

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.log('tip: set OPENAI_API_KEY for richer route descriptions\n')
  }

  const llmConfig: LLMConfig | null = apiKey
    ? { apiKey, baseURL: process.env.SPOTTER_LLM_BASE_URL, model: process.env.SPOTTER_LLM_MODEL }
    : null

  analyze({ rootDir, outputPath, llmConfig }).catch(err => {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
} else {
  console.log(
    'Usage: spotter analyze [--root <dir>] [--output <path>]\n\n' +
    'Environment:\n' +
    '  OPENAI_API_KEY       LLM key for description generation\n' +
    '  SPOTTER_LLM_BASE_URL Override LLM endpoint (e.g. OpenRouter)\n' +
    '  SPOTTER_LLM_MODEL    Override model (default: gpt-4o-mini)'
  )
  process.exit(command ? 1 : 0)
}
