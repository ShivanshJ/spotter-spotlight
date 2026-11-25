import path from 'path'
import { detectAnalyzer } from './analyzers/registry'
import { extractRoutes, toDiscoveredRoutes, type RouteFileSpec } from './analyzers/route-config'
import { enrichRoutes, type EnrichOptions } from './enrich'
import { inspectPages, SourceReader, type InspectedRoute } from './page-inspect'
import { nameVerdict, ruleVerdict } from './navigable'
import { writeConfig } from './config-writer'
import type { LLMConfig } from '../proxy/llm-client'
import type { RouteWithDescription } from './config-writer'
import type { DiscoveredRoute } from './analyzers/types'
import type { SpotterConfig } from '../types'

export type AnalyzeOptions = {
  rootDir: string
  outputPath: string
  llmConfig: LLMConfig | null
  routeFiles?: RouteFileSpec[]  // skip auto-discovery and read exactly these files
  exclude?: string[]            // path prefixes to leave out, e.g. "/api"
  dryRun?: boolean              // print what was found; write nothing
  json?: boolean                // with dryRun: print machine-readable JSON
  client?: EnrichOptions['client']
}

function isExcluded(routePath: string, exclude: string[]): boolean {
  return exclude.some(prefix => {
    const p = prefix.replace(/\/+$/, '') || '/'
    return routePath === p || routePath.startsWith(p === '/' ? '/' : p + '/')
  })
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

async function discover(options: AnalyzeOptions, log: (msg: string) => void) {
  const { rootDir } = options
  const analyzer = detectAnalyzer(rootDir)
  if (options.routeFiles?.length) {
    if (analyzer) log(`✓ Detected: ${analyzer.name}`)
    const specs = options.routeFiles.map(s => ({ ...s, explicit: true }))
    return { framework: analyzer?.name ?? null, routes: toDiscoveredRoutes(extractRoutes(specs, rootDir)) }
  }
  if (!analyzer) {
    throw new Error(
      `No supported framework detected in ${rootDir}.\nSupported: Next.js, React Router, Vue Router.\n` +
      'Run this from your frontend package, or pass the files that define your routes: --routes <file>'
    )
  }
  log(`✓ Detected: ${analyzer.name}`)
  return { framework: analyzer.name, routes: await analyzer.analyze(rootDir) }
}

function dryRunReport(framework: string | null, routes: InspectedRoute[], rel: (f: string) => string, json: boolean): void {
  const hiddenBy = (r: InspectedRoute) => ruleVerdict(r) ?? nameVerdict(r.path)
  if (json) {
    console.log(JSON.stringify({
      framework,
      routes: routes.map(r => ({
        path: r.path,
        sourceFile: r.sourceFile ? rel(r.sourceFile) : undefined,
        componentFile: rel(r.componentFile),
        files: r.files.map(rel),
        hidden: hiddenBy(r)?.note,
        controls: r.controls,
      })),
    }, null, 2))
    return
  }
  for (const r of routes) {
    const hidden = hiddenBy(r)
    console.log(`  ${r.path.padEnd(32)} ${rel(r.componentFile)}${hidden ? `   [hidden: ${hidden.note}]` : ''}`)
  }
  console.log('\n(dry run: nothing written)')
}

function report(config: SpotterConfig, log: (msg: string) => void): void {
  const hidden = config.routes.filter(r => r.navigable === false)
  const actionCount = config.routes.reduce((n, r) => n + (r.navigable === false ? 0 : r.actions?.length ?? 0), 0)
  const pages = config.routes.length - hidden.length
  log(`✓ ${plural(pages, 'page')}${actionCount ? `, ${plural(actionCount, 'action')}` : ''}, ${hidden.length} hidden`)
  if (hidden.length) {
    const width = Math.min(32, Math.max(...hidden.map(r => r.path.length)))
    for (const r of hidden) log(`    ${r.path.padEnd(width)}  ${r.note ?? ''}`)
    log('  Hidden routes stay in the config with "navigable": false. Set it to true to show one.')
  }
}

export async function analyze(options: AnalyzeOptions): Promise<InspectedRoute[]> {
  const { rootDir, outputPath, llmConfig } = options
  const log = options.json ? () => {} : (msg: string) => console.log(msg)
  const rel = (file: string) => path.relative(rootDir, file) || file

  const { framework, routes: found } = await discover(options, log)
  const kept: DiscoveredRoute[] = found.filter(r => !isExcluded(r.path, options.exclude ?? []))

  const sources = [...new Set(kept.map(r => r.sourceFile).filter((f): f is string => !!f))]
  const sourceText = sources.length > 3 ? `${sources.slice(0, 3).map(rel).join(', ')} and ${sources.length - 3} more` : sources.map(rel).join(', ')
  log(`✓ Found ${plural(kept.length, 'route')}` +
    (sourceText ? ` in ${sourceText}` : '') +
    (found.length !== kept.length ? ` (${found.length - kept.length} excluded)` : ''))

  if (kept.length === 0) {
    log('\nNo routes found. If your routes live somewhere unusual, name the file(s):\n' +
      '  spotter-sdk analyze --routes src/router.tsx --routes src/admin/routes.tsx@/admin')
  }

  const reader = new SourceReader()
  const routes = inspectPages(kept, rootDir, reader)

  if (options.dryRun) {
    dryRunReport(framework, routes, rel, !!options.json)
    return routes
  }

  const controlCount = routes.reduce((n, r) => n + r.controls.length, 0)
  if (controlCount > 0) log(`✓ Found ${plural(controlCount, 'control')} (buttons, tabs, menu items)`)

  if (llmConfig && routes.length) log(`  Reading pages with ${llmConfig.model ?? 'gpt-4o-mini'}...`)
  const { insights, failures } = await enrichRoutes(routes, llmConfig, { rootDir, reader, client: options.client })

  if (failures.length) {
    log(`! The model failed on ${plural(failures.length, 'page')}: ${failures[0].error}`)
    log('  Those pages got placeholder descriptions. Check your key, SPOTTER_LLM_BASE_URL and SPOTTER_LLM_MODEL, then re-run.')
  }
  const entries: RouteWithDescription[] = routes.map(r => {
    const insight = insights.get(r.path)!
    return { ...r, ...insight, selectors: r.selectors }
  })
  report(await writeConfig(entries, { outputPath }), log)
  log(`✓ Written to ${path.relative(process.cwd(), outputPath) || outputPath}`)

  if (!llmConfig) {
    log('\nDescriptions are placeholders and no actions were generated, because no LLM key is set.\n' +
      'Set OPENAI_API_KEY (or SPOTTER_LLM_API_KEY with SPOTTER_LLM_BASE_URL for other providers) and re-run;\n' +
      'placeholders are replaced and your edits are kept. Or let your coding agent write them: see the README.')
  }
  return routes
}
