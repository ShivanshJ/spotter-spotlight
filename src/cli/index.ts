import path from 'path'
import { analyze } from './analyze'
import { resolveLLMSettings } from './llm-env'
import { parseArgs, type FlagSpec } from './args'
import type { RouteFileSpec } from './analyzers/route-config'

const USAGE = `Usage: spotter-sdk <command> [options]

Commands:
  analyze   Map your app's pages into spotter.config.json
  dev       Run your app with the Spotter widget injected (no code changes)

analyze options:
  --root <dir>              Project root (default: current directory)
  --output <path>           Config file to write (default: <root>/spotter.config.json)
  --routes <file[@/mount]>  Read routes from these files instead of auto-discovery. Repeatable.
                            @/mount prefixes that file's routes, e.g. src/admin/routes.tsx@/admin
  --exclude <prefix>        Leave out routes under this path, e.g. /api. Repeatable.
  --dry-run                 Print what was found; write nothing
  --json                    Dry run with JSON output (for scripts and coding agents)
  --no-llm                  Don't call an LLM, even if a key is set
  --model <name>            Model for page descriptions and actions (default: gpt-4o-mini)

dev options:
  --target <url>            Your running dev server (default: the first of localhost:5173, :3000, :8080)
  --port <n>                Port for the Spotter dev proxy (default: 4400)
  --config <path>           spotter.config.json to serve (default: ./spotter.config.json)
  --model <name>            Model that routes user questions (default: gpt-4o-mini)

LLM settings (read from the environment, or from .env / .env.local up to the repo root):
  OPENAI_API_KEY            Key for OpenAI, or any OpenAI-compatible provider
  SPOTTER_LLM_API_KEY       Used instead of OPENAI_API_KEY when set
  SPOTTER_LLM_BASE_URL      Provider endpoint, e.g. https://openrouter.ai/api/v1
  SPOTTER_LLM_MODEL         Default model`

const ANALYZE_FLAGS: Record<string, FlagSpec> = {
  '--root': 'value', '--output': 'value', '--routes': 'list', '--exclude': 'list',
  '--dry-run': 'boolean', '--json': 'boolean', '--no-llm': 'boolean', '--model': 'value',
}

const DEV_FLAGS: Record<string, FlagSpec> = {
  '--target': 'value', '--port': 'value', '--config': 'value', '--model': 'value', '--root': 'value',
}

function parseRouteSpec(value: string): RouteFileSpec {
  const at = value.lastIndexOf('@/')
  return at > 0 ? { file: value.slice(0, at), mount: value.slice(at + 1) } : { file: value }
}

function fail(message: string): never {
  console.error(`Error: ${message}`)
  process.exit(1)
}

async function runAnalyze(argv: string[]): Promise<void> {
  const flags = parseArgs(argv, ANALYZE_FLAGS)
  const rootDir = path.resolve(flags.value('--root') ?? process.cwd())
  const outputPath = path.resolve(flags.value('--output') ?? path.join(rootDir, 'spotter.config.json'))
  const json = flags.has('--json')
  const dryRun = flags.has('--dry-run') || json
  const settings = flags.has('--no-llm') || dryRun
    ? { config: null }
    : resolveLLMSettings(rootDir, process.env, flags.value('--model'))
  if (settings.keySource && !json) console.log(`  Using ${settings.keySource}`)

  await analyze({
    rootDir,
    outputPath,
    llmConfig: settings.config,
    routeFiles: flags.list('--routes').map(parseRouteSpec),
    exclude: flags.list('--exclude'),
    dryRun,
    json,
  })
}

async function runDev(argv: string[]): Promise<void> {
  const flags = parseArgs(argv, DEV_FLAGS)
  const rootDir = path.resolve(flags.value('--root') ?? process.cwd())
  const port = flags.value('--port')
  if (port !== undefined && !/^\d+$/.test(port)) fail(`--port must be a number, got "${port}"`)
  const { startDevServer } = await import('./dev')
  await startDevServer({
    rootDir,
    target: flags.value('--target'),
    port: port ? Number(port) : undefined,
    configPath: path.resolve(rootDir, flags.value('--config') ?? 'spotter.config.json'),
    llm: resolveLLMSettings(rootDir, process.env, flags.value('--model')),
  })
}

const [command, ...rest] = process.argv.slice(2)

if (!command || command === 'help' || command === '--help' || command === '-h') {
  console.log(USAGE)
} else if (rest.includes('--help') || rest.includes('-h')) {
  console.log(USAGE)
} else if (command === 'analyze' || command === 'dev') {
  (command === 'analyze' ? runAnalyze(rest) : runDev(rest)).catch(err => fail(err instanceof Error ? err.message : String(err)))
} else {
  console.error(`Unknown command "${command}".\n`)
  console.log(USAGE)
  process.exit(1)
}
