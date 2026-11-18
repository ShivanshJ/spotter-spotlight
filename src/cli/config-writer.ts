import fsp from 'fs/promises'
import path from 'path'
import type { DiscoveredRoute } from './analyzers/types'
import type { SpotterConfig } from '../types'

export type RouteWithDescription = DiscoveredRoute & { description: string }

async function readExisting(outputPath: string): Promise<SpotterConfig | null> {
  try {
    return JSON.parse(await fsp.readFile(outputPath, 'utf-8')) as SpotterConfig
  } catch { return null }
}

export async function writeConfig(
  routes: RouteWithDescription[],
  options: { outputPath: string; baseUrl: string }
): Promise<void> {
  const prior = await readExisting(options.outputPath)
  const priorByPath = new Map(prior?.routes.map(r => [r.path, r]) ?? [])

  const mergedRoutes = routes.map(r => {
    const existing = priorByPath.get(r.path)
    return {
      path: r.path,
      description: existing?.description || r.description,
      selectors: r.selectors,
    }
  })

  const config: SpotterConfig = {
    version: '1',
    baseUrl: prior?.baseUrl ?? options.baseUrl,
    routes: mergedRoutes,
    actions: prior?.actions ?? [],
    mcpServers: prior?.mcpServers ?? [],
  }

  await fsp.mkdir(path.dirname(options.outputPath), { recursive: true })
  await fsp.writeFile(options.outputPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
}
