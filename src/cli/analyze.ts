import path from 'path'
import { detectAnalyzer } from './analyzers/registry'
import { describeRoutes } from './llm-describe'
import { writeConfig } from './config-writer'
import type { LLMConfig } from '../proxy/llm-client'
import type { RouteWithDescription } from './config-writer'

export type AnalyzeOptions = {
  rootDir: string
  outputPath: string
  llmConfig: LLMConfig | null
}

export async function analyze(options: AnalyzeOptions): Promise<void> {
  const { rootDir, outputPath, llmConfig } = options

  const analyzer = detectAnalyzer(rootDir)
  if (!analyzer) {
    throw new Error(
      `No supported framework detected in ${rootDir}.\nSupported: Next.js, React Router, Vue Router.`
    )
  }

  console.log(`✓ Detected: ${analyzer.name}`)

  const routes = await analyzer.analyze(rootDir)
  console.log(`✓ Found ${routes.length} route${routes.length !== 1 ? 's' : ''}`)

  const selectorCount = routes.reduce((n, r) => n + Object.keys(r.selectors).length, 0)
  if (selectorCount > 0) console.log(`✓ Extracted ${selectorCount} selector${selectorCount !== 1 ? 's' : ''}`)

  const apiCount = routes.reduce((n, r) => n + r.apiCalls.length, 0)
  if (apiCount > 0) console.log(`✓ Detected ${apiCount} API pattern${apiCount !== 1 ? 's' : ''}`)

  const descriptions = await describeRoutes(routes, llmConfig)

  const routesWithDescriptions: RouteWithDescription[] = routes.map(r => ({
    ...r,
    description: descriptions.get(r.path) ?? r.path,
  }))

  await writeConfig(routesWithDescriptions, { outputPath })
  console.log(`✓ Written to ${path.relative(process.cwd(), outputPath)}`)
  console.log('\nNext steps: mount the proxy on your server, then add the widget script tag.')
}
