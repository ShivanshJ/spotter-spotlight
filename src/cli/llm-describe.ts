import OpenAI from 'openai'
import type { LLMConfig } from '../proxy/llm-client'
import type { DiscoveredRoute } from './analyzers/types'

function heuristic(routePath: string): string {
  const segments = routePath.split('/').filter(Boolean)
  if (segments.length === 0) return 'Home page'
  return segments.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ') + ' page'
}

function allHeuristics(routes: DiscoveredRoute[]): Map<string, string> {
  return new Map(routes.map(r => [r.path, heuristic(r.path)]))
}

export async function describeRoutes(
  routes: DiscoveredRoute[],
  llmConfig: LLMConfig | null
): Promise<Map<string, string>> {
  if (!llmConfig) return allHeuristics(routes)

  try {
    const client = new OpenAI({ apiKey: llmConfig.apiKey, baseURL: llmConfig.baseURL })
    const model = llmConfig.model ?? 'gpt-4o-mini'

    const prompt = routes
      .map((r, i) => `${i + 1}. path: ${r.path}, title: ${r.pageTitle ?? 'unknown'}`)
      .join('\n')

    const response = await client.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are configuring a natural language navigation system.
For each route, write a 1-sentence description of what that page does.
Descriptions must match natural language queries like "how do I change dark mode" or "where are my invoices".
Return JSON: { "descriptions": [{ "path": "...", "description": "..." }] }`,
        },
        { role: 'user', content: prompt },
      ],
    })

    const content = response.choices[0].message.content
    if (!content) return allHeuristics(routes)

    const parsed = JSON.parse(content) as { descriptions: { path: string; description: string }[] }
    return new Map(parsed.descriptions.map(d => [d.path, d.description]))
  } catch {
    return allHeuristics(routes)
  }
}
