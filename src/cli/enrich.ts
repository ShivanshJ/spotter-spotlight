// Turns inspected routes into what goes in spotter.config.json: whether each route is a page
// users ask for, a title, a description, and page actions tied to real controls.
//
// With an LLM, a small model reads each page's code. Without one, routes get rule-based
// verdicts and a placeholder description, and no actions.
import path from 'path'
import OpenAI from 'openai'
import { z } from 'zod'
import type { LLMConfig } from '../proxy/llm-client'
import type { PageAction } from '../types'
import type { InspectedRoute, SourceReader } from './page-inspect'
import { nameVerdict, ruleVerdict } from './navigable'

export type PageInsight = {
  navigable: boolean
  note?: string
  title?: string
  description: string
  actions: PageAction[]
  source: 'rule' | 'llm' | 'placeholder'
}

export type EnrichResult = {
  insights: Map<string, PageInsight>
  failures: { path: string; error: string }[]
}

export type EnrichOptions = {
  rootDir: string
  reader: SourceReader
  concurrency?: number
  maxSourceChars?: number
  client?: Pick<OpenAI, 'chat'>
}

const DEFAULT_MODEL = 'gpt-4o-mini'
const MAX_ACTIONS = 6

export function placeholderDescription(routePath: string): string {
  const segments = routePath.split('/').filter(Boolean)
  if (segments.length === 0) return 'Home page'
  const words = segments.filter(s => !/^[:*]/.test(s)).map(s => s.charAt(0).toUpperCase() + s.slice(1))
  return words.join(' ') + (segments.some(s => s.startsWith(':')) ? ' detail page' : ' page')
}

export function isPlaceholderDescription(routePath: string, description: string | undefined): boolean {
  return !description || description === routePath || description === placeholderDescription(routePath)
}

const InsightSchema = z.object({
  navigable: z.boolean(),
  note: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  description: z.string().min(1),
  actions: z.array(z.object({
    name: z.string(),
    description: z.string(),
    control: z.string(),
  })).optional().nullable(),
})

const SYSTEM_PROMPT = `You map a web app's pages for an in-app assistant. Users type requests like "change my plan" or "invite a teammate"; the assistant takes them to the right page and highlights the right control.

You get one route: its path, the other routes in the app, the controls found in the page's code, and the code itself.

Return JSON: {"navigable": true|false, "note": "...", "title": "...", "description": "...", "actions": [{"name": "snake_case_name", "description": "...", "control": "<control key>"}]}

- navigable: false when this is not a page a user would ask to be taken to: redirects, interstitials (loading screens, paywalls, upsell walls), auth callbacks, logout, error pages, internal test or debug pages, routes that render no UI. When false, "note" says why in a few words and "actions" is empty.
- title: the page name a user would say, e.g. "Billing" or "Team members".
- description: one sentence in the words a user would type, naming the main things they can see or do here. No implementation details, and don't just repeat the path.
- actions: up to ${MAX_ACTIONS} things a user can do on this page, each tied to one control from the list by its key. Use only keys from the list. Skip generic controls (close, cancel, back, open menu) and links to other pages. Empty when nothing fits.`

function rel(rootDir: string, file: string): string {
  return path.relative(rootDir, file) || file
}

function sourceExcerpt(route: InspectedRoute, options: EnrichOptions): string {
  const budget = options.maxSourceChars ?? 12_000
  const parts: string[] = []
  let used = 0
  for (const file of route.files) {
    const content = options.reader.read(file)
    if (!content) continue
    const room = budget - used
    if (room < 400) break
    const body = content.length > room ? content.slice(0, room) + '\n/* ...truncated */' : content
    parts.push(`--- ${rel(options.rootDir, file)}\n${body}`)
    used += body.length
  }
  return parts.join('\n\n') || '(source not found)'
}

export function buildPagePrompt(route: InspectedRoute, allPaths: string[], options: EnrichOptions): string {
  const controls = route.controls.length
    ? route.controls.map(c => `- ${c.key}: ${c.role ?? 'element'} "${c.label}"`).join('\n')
    : '(none found)'
  const others = allPaths.filter(p => p !== route.path).slice(0, 80).join(', ')
  return `Path: ${route.path}\nOther routes: ${others || '(none)'}\n\nControls:\n${controls}\n\nCode:\n${sourceExcerpt(route, options)}`
}

function snakeCase(name: string): string {
  return name.trim().replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase()
}

export function toInsight(raw: unknown, route: InspectedRoute): PageInsight {
  const parsed = InsightSchema.parse(raw)
  const byKey = new Map(route.controls.map(c => [c.key, c]))
  const seen = new Set<string>()
  const actions: PageAction[] = []
  for (const a of parsed.navigable ? parsed.actions ?? [] : []) {
    const control = byKey.get(a.control)
    const name = snakeCase(a.name)
    if (!control || !name || seen.has(name) || actions.length >= MAX_ACTIONS) continue
    seen.add(name)
    actions.push({ name, description: a.description.trim(), selector: control.selector })
  }
  return {
    navigable: parsed.navigable,
    ...(parsed.navigable || !parsed.note ? {} : { note: parsed.note.trim() }),
    ...(parsed.title ? { title: parsed.title.trim() } : {}),
    description: parsed.description.trim(),
    actions,
    source: 'llm',
  }
}

function offlineInsight(route: InspectedRoute): PageInsight {
  const verdict = ruleVerdict(route) ?? nameVerdict(route.path)
  return {
    navigable: !verdict,
    ...(verdict ? { note: verdict.note } : {}),
    description: placeholderDescription(route.path),
    actions: [],
    source: verdict && ruleVerdict(route) ? 'rule' : 'placeholder',
  }
}

async function askModel(
  client: Pick<OpenAI, 'chat'>,
  model: string,
  route: InspectedRoute,
  allPaths: string[],
  options: EnrichOptions
): Promise<PageInsight> {
  const response = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildPagePrompt(route, allPaths, options) },
    ],
  })
  const content = response.choices[0]?.message.content
  if (!content) throw new Error('empty response from the model')
  return toInsight(JSON.parse(content), route)
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message.split('\n')[0] : String(err)
}

export async function enrichRoutes(
  routes: InspectedRoute[],
  llmConfig: LLMConfig | null,
  options: EnrichOptions
): Promise<EnrichResult> {
  const insights = new Map<string, PageInsight>()
  const failures: EnrichResult['failures'] = []
  const allPaths = routes.map(r => r.path)

  const needsModel: InspectedRoute[] = []
  for (const r of routes) {
    const verdict = ruleVerdict(r)
    if (verdict || !llmConfig) insights.set(r.path, offlineInsight(r))
    else needsModel.push(r)
  }
  if (!llmConfig || needsModel.length === 0) return { insights, failures }

  const client = options.client ?? new OpenAI({ apiKey: llmConfig.apiKey, baseURL: llmConfig.baseURL, maxRetries: 2 })
  const model = llmConfig.model ?? DEFAULT_MODEL
  let fatal: string | null = null

  await mapLimit(needsModel, options.concurrency ?? 6, async route => {
    if (fatal) {
      insights.set(route.path, offlineInsight(route))
      failures.push({ path: route.path, error: fatal })
      return
    }
    try {
      insights.set(route.path, await askModel(client, model, route, allPaths, options))
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status === 401 || status === 403 || status === 404) fatal = errorMessage(err)
      insights.set(route.path, offlineInsight(route))
      failures.push({ path: route.path, error: errorMessage(err) })
    }
  })

  return { insights, failures }
}
