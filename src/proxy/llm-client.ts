import OpenAI from 'openai'

export type RouteResult =
  | { type: 'navigate'; routePath: string; actionName?: string }
  | { type: 'action'; actionIntent: string }
  | { type: 'general'; error?: string }

export type LLMConfig = {
  apiKey: string
  baseURL?: string
  model?: string
}

const ROUTING_PROMPT_HEADER = `You are a navigation classifier for a web application.
Given a user query and the app's site map, determine:
1. Is this a UI navigation or action request?
2. If navigate: which route path best matches, and which page action (if any) the user wants to perform there?
3. If action: which action intent best matches?

Return one of:
- {"type":"navigate","routePath":"/exact/path"}
- {"type":"navigate","routePath":"/exact/path","actionName":"exact page action name"}
- {"type":"action","actionIntent":"exact intent string"}
- {"type":"general"}

Only return "navigate" or "action" if there is a clear match. When unsure, return "general".

Site map:
`

export function buildRoutingPrompt(siteMapSummary: string): string {
  return ROUTING_PROMPT_HEADER + siteMapSummary
}

export function createLLMClient(config: LLMConfig): OpenAI {
  return new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL })
}

export async function routeQuery(
  client: OpenAI,
  query: string,
  siteMapSummary: string,
  model = 'gpt-4o-mini'
): Promise<RouteResult> {
  try {
    const response = await client.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: buildRoutingPrompt(siteMapSummary),
        },
        { role: 'user', content: query },
      ],
    })

    const content = response.choices[0].message.content
    if (!content) return { type: 'general' }
    return JSON.parse(content) as RouteResult
  } catch (err) {
    return { type: 'general', error: err instanceof Error ? err.message : String(err) }
  }
}
