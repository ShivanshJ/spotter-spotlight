import fs from 'fs/promises'
import { SpotterConfigSchema } from '../types'
import type { SpotterConfig, Route, Action } from '../types'

export async function loadConfig(configPath: string): Promise<SpotterConfig> {
  const raw = await fs.readFile(configPath, 'utf-8')
  return SpotterConfigSchema.parse(JSON.parse(raw))
}

function routeLines(route: Route): string[] {
  const reachable = route.reachableFrom?.length ? ` [reachable from: ${route.reachableFrom.join(', ')}]` : ''
  const role = route.role ? ` [role: ${route.role}]` : ''
  const pageActions = (route.actions ?? []).map((a) => `      action ${a.name}: ${a.description}`)
  return [`  - ${route.path}: "${route.description}"${reachable}${role}`, ...pageActions]
}

export function summarizeConfig(config: SpotterConfig): string {
  const routes = config.routes.flatMap(routeLines).join('\n')

  const actions = config.actions
    .map((a) => `  - "${a.intent}" → ${a.endpoint}${a.role ? ` [role: ${a.role}]` : ''}`)
    .join('\n')

  return `Routes:\n${routes || '  (none)'}\n\nActions:\n${actions || '  (none)'}`
}

export function findRouteByPath(config: SpotterConfig, path: string): Route | undefined {
  return config.routes.find((r) => r.path === path)
}

export function findActionByIntent(config: SpotterConfig, intent: string): Action | undefined {
  return config.actions.find((a) => a.intent === intent)
}
