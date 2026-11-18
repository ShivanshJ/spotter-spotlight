import { createLLMClient, routeQuery } from './llm-client'
import type { LLMConfig } from './llm-client'
import { summarizeConfig, findRouteByPath, findActionByIntent } from './site-map'
import { noopAnalytics } from './analytics'
import type { AnalyticsHandler } from './analytics'
import { SpotterConfigSchema } from '../types'
import type { SpotterConfig, SpotterQuery, SpotterResponse, NavigateStep } from '../types'

export interface SpotterProxyOptions {
  config: string | SpotterConfig
  llm: LLMConfig
  onAnalytics?: AnalyticsHandler
}

type RequestLike = { body: SpotterQuery }
type ResponseLike = { json: (data: unknown) => void; status: (code: number) => ResponseLike }

export function createSpotterProxy(
  options: SpotterProxyOptions
): (req: RequestLike, res: ResponseLike) => Promise<void> {
  const llmClient = createLLMClient(options.llm)
  const analytics = options.onAnalytics ?? noopAnalytics

  async function resolveConfig(): Promise<SpotterConfig> {
    if (typeof options.config === 'string') {
      const { loadConfig } = await import('./site-map')
      return loadConfig(options.config)
    }
    return SpotterConfigSchema.parse(options.config)
  }

  return async (req: RequestLike, res: ResponseLike) => {
    try {
      const { query, url, sessionToken, role } = req.body
      const config = await resolveConfig()
      const summary = summarizeConfig(config)
      const result = await routeQuery(llmClient, query, summary, options.llm.model)

      let response: SpotterResponse

      if (result.type === 'navigate') {
        const route = findRouteByPath(config, result.routePath)
        if (!route) {
          response = { type: 'unhandled', query }
        } else {
          const steps: NavigateStep[] = Object.entries(route.selectors).map(([key, selector]) => ({
            selector,
            description: `${route.description} — ${key}`,
            interactionType: 'click',
          }))
          if (steps.length === 0) {
            steps.push({
              selector: `a[href="${route.path}"]`,
              description: `Navigate to ${route.path} — ${route.description}`,
              interactionType: 'click',
            })
          }
          response = { type: 'navigate', steps }
        }
      } else if (result.type === 'action') {
        const action = findActionByIntent(config, result.actionIntent)
        if (!action) {
          response = { type: 'unhandled', query }
        } else {
          response = { type: 'answer', content: `Action available but not enabled on this plan: ${action.endpoint}` }
        }
      } else {
        response = { type: 'unhandled', query }
      }

      analytics({ type: 'query', query, responseType: response.type, url, role })
      res.json(response)
    } catch (err) {
      res.json({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
    }
  }
}
