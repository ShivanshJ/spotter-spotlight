import fsp from 'fs/promises'
import path from 'path'
import type { DiscoveredRoute } from './analyzers/types'
import type { PageAction, Route, SpotterConfig } from '../types'
import { deriveReachableFrom } from './reachability'
import { isPlaceholderDescription } from './enrich'

export type RouteWithDescription = DiscoveredRoute & {
  description: string
  title?: string
  navigable?: boolean
  note?: string
  actions?: PageAction[]
}

async function readExisting(outputPath: string): Promise<SpotterConfig | null> {
  try {
    return JSON.parse(await fsp.readFile(outputPath, 'utf-8')) as SpotterConfig
  } catch { return null }
}

// Hand edits win. A route whose description is still a placeholder has never been reviewed by a
// person or a model, so its generated fields are refreshed; once it has a real description, its
// title, navigable flag, note, reachableFrom and actions are kept. "navigable": true is always kept,
// because analyze never writes it. Selectors always come from the latest scan.
function mergeRoute(r: RouteWithDescription, existing: Route | undefined, reachableFrom: string[] | undefined): Route {
  const reviewed = !!existing && !isPlaceholderDescription(r.path, existing.description)
  const keepFlag = existing?.navigable === true || (reviewed && existing?.navigable === false)
  const navigable = keepFlag ? existing!.navigable : (r.navigable === false ? false : undefined)
  const note = navigable === false ? (keepFlag ? existing!.note : r.note) : undefined
  return {
    path: r.path,
    navigable,
    note,
    title: reviewed ? existing!.title ?? r.title ?? r.pageTitle : r.title ?? existing?.title ?? r.pageTitle,
    description: reviewed ? existing!.description : r.description,
    reachableFrom: existing?.reachableFrom ?? reachableFrom,
    actions: existing?.actions ?? (r.actions?.length ? r.actions : undefined),
    selectors: r.selectors,
  }
}

export async function writeConfig(
  routes: RouteWithDescription[],
  options: { outputPath: string }
): Promise<SpotterConfig> {
  const prior = await readExisting(options.outputPath)
  const priorByPath = new Map(prior?.routes.map(r => [r.path, r]) ?? [])

  const derivedReachableFrom = deriveReachableFrom(routes.map(r => r.path))

  const mergedRoutes = routes.map(r => mergeRoute(r, priorByPath.get(r.path), derivedReachableFrom.get(r.path)))

  const config: SpotterConfig = {
    version: '1',
    routes: mergedRoutes,
    actions: prior?.actions ?? [],
    mcpServers: prior?.mcpServers ?? [],
  }

  await fsp.mkdir(path.dirname(options.outputPath), { recursive: true })
  await fsp.writeFile(options.outputPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
  return config
}
