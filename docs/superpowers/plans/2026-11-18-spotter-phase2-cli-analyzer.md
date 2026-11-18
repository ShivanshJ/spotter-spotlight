# Spotter Phase 2: CLI Analyzer + LLM Provider Flexibility

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `spotter analyze` CLI command that auto-generates `spotter.config.json` from a JS codebase, and make the LLM provider configurable across both the CLI and proxy.

**Architecture:** Static analysis of source files — no browser, no login required. A `FrameworkAnalyzer` plugin interface lets each framework (Next.js, React Router, Vue Router) live in its own file; adding a new one is one file + one registry line. The LLM config drops the `provider` field and adds optional `baseURL` + `model`, making any OpenAI-compatible endpoint (OpenRouter, Ollama, etc.) a one-line config change.

**Tech Stack:** TypeScript, Node.js built-ins (`fs/promises`, `path`, `process`), OpenAI SDK (already a dep), tsup (already configured), vitest (already configured).

**Principles enforced throughout:**
- One responsibility per file — no file does two jobs
- Plain TS interfaces + factory functions; no classes
- No comments inside functions
- OCP: new analyzers extend the registry array, never modify existing files
- DIP: orchestrators depend on `FrameworkAnalyzer` interface, not concrete implementations

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/proxy/llm-client.ts` | Modify | Accept `LLMConfig` with `baseURL?`, `model?`; remove hardcoded model |
| `src/proxy/analytics.ts` | Create | `SpotterEvent`, `AnalyticsHandler`, `noopAnalytics` |
| `src/proxy/index.ts` | Modify | Use `LLMConfig`; accept + wire `onAnalytics?` |
| `src/proxy.ts` | Modify | Export `LLMConfig`, `AnalyticsHandler`, `SpotterEvent` |
| `src/cli/analyzers/types.ts` | Create | `FrameworkAnalyzer` interface, `DiscoveredRoute` type |
| `src/cli/analyzers/extract.ts` | Create | Regex extraction: selectors, API calls, page title |
| `src/cli/analyzers/nextjs.ts` | Create | Next.js app + pages router analyzer |
| `src/cli/analyzers/react-router.ts` | Create | React Router v6/v7 analyzer |
| `src/cli/analyzers/vue-router.ts` | Create | Vue Router v3/v4 analyzer |
| `src/cli/analyzers/registry.ts` | Create | Ordered list + `detectAnalyzer()` |
| `src/cli/llm-describe.ts` | Create | Batch LLM description generation; noop fallback |
| `src/cli/config-writer.ts` | Create | Write/merge `spotter.config.json`; preserve manual edits |
| `src/cli/analyze.ts` | Create | Orchestrator: detect → extract → describe → write |
| `src/cli/index.ts` | Create | Bin entry; arg parsing via `process.argv` |
| `tsup.config.ts` | Modify | Add CLI entry with shebang banner |
| `package.json` | Modify | Add `bin` field; add `dist/cli` to files |
| `README.md` | Modify | 3-step quick start; LLM providers section; analytics section |

---

### Task 1: LLMConfig type + update llm-client

**Files:**
- Modify: `src/proxy/llm-client.ts`
- Modify: `src/proxy/llm-client.test.ts`

- [ ] **Step 1: Write a failing test for the new signature**

```ts
// src/proxy/llm-client.test.ts — add this test inside describe('routeQuery')
it('passes baseURL and model to the OpenAI client', async () => {
  const client = makeMockClient({ type: 'general' })
  const result = await routeQuery(
    client as any,
    'some query',
    'Routes:\n  (none)',
    'gpt-4-turbo'
  )
  expect(result.type).toBe('general')
  expect(client.chat.completions.create).toHaveBeenCalledWith(
    expect.objectContaining({ model: 'gpt-4-turbo' })
  )
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A5 "passes baseURL"
```

Expected: FAIL — `routeQuery` doesn't accept a 4th argument yet.

- [ ] **Step 3: Rewrite `src/proxy/llm-client.ts`**

```ts
import OpenAI from 'openai'

export type LLMConfig = {
  apiKey: string
  baseURL?: string
  model?: string
}

export type RouteResult =
  | { type: 'navigate'; routePath: string }
  | { type: 'action'; actionIntent: string }
  | { type: 'general' }

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
          content: `You are a navigation classifier for a web application.
Given a user query and the app's site map, determine:
1. Is this a UI navigation or action request?
2. If navigate: which route path best matches?
3. If action: which action intent best matches?

Return one of:
- {"type":"navigate","routePath":"/exact/path"}
- {"type":"action","actionIntent":"exact intent string"}
- {"type":"general"}

Only return "navigate" or "action" if there is a clear match. When unsure, return "general".

Site map:
${siteMapSummary}`,
        },
        { role: 'user', content: query },
      ],
    })

    const content = response.choices[0].message.content
    if (!content) return { type: 'general' }
    return JSON.parse(content) as RouteResult
  } catch {
    return { type: 'general' }
  }
}
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/proxy/llm-client.ts src/proxy/llm-client.test.ts
git commit -m "feat: add LLMConfig with baseURL and model support"
```

---

### Task 2: Analytics infrastructure

**Files:**
- Create: `src/proxy/analytics.ts`
- Create: `src/proxy/analytics.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/proxy/analytics.test.ts
import { describe, it, expect, vi } from 'vitest'
import { noopAnalytics } from './analytics'
import type { AnalyticsHandler, SpotterEvent } from './analytics'

describe('analytics', () => {
  it('noopAnalytics does not throw', () => {
    const event: SpotterEvent = {
      type: 'query',
      query: 'dark mode',
      responseType: 'navigate',
      url: 'https://app.com',
    }
    expect(() => noopAnalytics(event)).not.toThrow()
  })

  it('AnalyticsHandler type accepts an event with optional role', () => {
    const handler: AnalyticsHandler = vi.fn()
    handler({ type: 'query', query: 'test', responseType: 'unhandled', url: 'https://app.com', role: 'admin' })
    expect(handler).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A5 "analytics"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/proxy/analytics.ts`**

```ts
export type SpotterEvent = {
  type: 'query'
  query: string
  responseType: 'navigate' | 'answer' | 'unhandled' | 'error'
  url: string
  role?: string
}

export type AnalyticsHandler = (event: SpotterEvent) => void

export const noopAnalytics: AnalyticsHandler = () => {}
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/proxy/analytics.ts src/proxy/analytics.test.ts
git commit -m "feat: add analytics event infrastructure"
```

---

### Task 3: Update proxy options + wire analytics

**Files:**
- Modify: `src/proxy/index.ts`
- Modify: `src/proxy/index.test.ts`
- Modify: `src/proxy.ts`

- [ ] **Step 1: Write failing tests for the new API**

Replace the entire `src/proxy/index.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SpotterConfig } from '../types'

vi.mock('./llm-client', () => ({
  createLLMClient: vi.fn(() => ({})),
  routeQuery: vi.fn(),
}))

import { routeQuery } from './llm-client'
import { createSpotterProxy } from './index'

const mockConfig: SpotterConfig = {
  version: '1',
  baseUrl: 'https://app.com',
  mcpServers: [],
  routes: [
    {
      path: '/settings/appearance',
      description: 'Dark mode and theme settings',
      selectors: { darkModeToggle: '[data-testid="dark-mode"]' },
    },
  ],
  actions: [],
}

function makeReqRes(body: object) {
  const req = { body } as any
  const jsonFn = vi.fn()
  const res = { json: jsonFn, status: vi.fn().mockReturnThis() } as any
  return { req, res, jsonFn }
}

describe('createSpotterProxy', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns navigate steps when LLM routes to a known route', async () => {
    vi.mocked(routeQuery).mockResolvedValue({ type: 'navigate', routePath: '/settings/appearance' })

    const handler = createSpotterProxy({ config: mockConfig, llm: { apiKey: 'test' } })
    const { req, res, jsonFn } = makeReqRes({ query: 'dark mode', url: 'https://app.com/home' })

    await handler(req, res)

    const response = jsonFn.mock.calls[0][0]
    expect(response.type).toBe('navigate')
    expect(response.steps).toBeInstanceOf(Array)
    expect(response.steps[0]).toMatchObject({ description: expect.any(String), selector: expect.any(String) })
  })

  it('returns navigate steps with navigate-to-route step when route has no selectors', async () => {
    const configNoSelectors: SpotterConfig = {
      ...mockConfig,
      routes: [{ path: '/rewards', description: 'Points page', selectors: {} }],
    }
    vi.mocked(routeQuery).mockResolvedValue({ type: 'navigate', routePath: '/rewards' })

    const handler = createSpotterProxy({ config: configNoSelectors, llm: { apiKey: 'test' } })
    const { req, res, jsonFn } = makeReqRes({ query: 'show my points', url: 'https://app.com/home' })

    await handler(req, res)

    const response = jsonFn.mock.calls[0][0]
    expect(response.type).toBe('navigate')
    expect(response.steps[0].description).toContain('/rewards')
  })

  it('returns unhandled when LLM returns general', async () => {
    vi.mocked(routeQuery).mockResolvedValue({ type: 'general' })

    const handler = createSpotterProxy({ config: mockConfig, llm: { apiKey: 'test' } })
    const { req, res, jsonFn } = makeReqRes({ query: 'what is your phone number?', url: 'https://app.com' })

    await handler(req, res)
    expect(jsonFn.mock.calls[0][0]).toMatchObject({ type: 'unhandled', query: 'what is your phone number?' })
  })

  it('returns error response on unexpected throw', async () => {
    vi.mocked(routeQuery).mockRejectedValue(new Error('network failure'))

    const handler = createSpotterProxy({ config: mockConfig, llm: { apiKey: 'test' } })
    const { req, res, jsonFn } = makeReqRes({ query: 'test', url: 'https://app.com' })

    await handler(req, res)
    expect(jsonFn.mock.calls[0][0]).toMatchObject({ type: 'error' })
  })

  it('calls onAnalytics with correct event shape after each response', async () => {
    vi.mocked(routeQuery).mockResolvedValue({ type: 'navigate', routePath: '/settings/appearance' })
    const onAnalytics = vi.fn()

    const handler = createSpotterProxy({ config: mockConfig, llm: { apiKey: 'test' }, onAnalytics })
    const { req, res } = makeReqRes({ query: 'dark mode', url: 'https://app.com', role: 'admin' })

    await handler(req, res)

    expect(onAnalytics).toHaveBeenCalledWith({
      type: 'query',
      query: 'dark mode',
      responseType: 'navigate',
      url: 'https://app.com',
      role: 'admin',
    })
  })

  it('does not throw when onAnalytics is not provided', async () => {
    vi.mocked(routeQuery).mockResolvedValue({ type: 'general' })

    const handler = createSpotterProxy({ config: mockConfig, llm: { apiKey: 'test' } })
    const { req, res } = makeReqRes({ query: 'test', url: 'https://app.com' })

    await expect(handler(req, res)).resolves.not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|pass" | head -20
```

Expected: failures on `onAnalytics` tests and TypeScript error on old `provider` field.

- [ ] **Step 3: Rewrite `src/proxy/index.ts`**

```ts
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
```

- [ ] **Step 4: Update `src/proxy.ts` to export new types**

```ts
export { createSpotterProxy } from './proxy/index'
export type { SpotterProxyOptions } from './proxy/index'
export type { LLMConfig } from './proxy/llm-client'
export type { AnalyticsHandler, SpotterEvent } from './proxy/analytics'
export type { SpotterConfig, Route, Action, SpotterQuery, SpotterResponse } from './types'
```

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/proxy/index.ts src/proxy/index.test.ts src/proxy.ts
git commit -m "feat: wire LLMConfig and onAnalytics into proxy"
```

---

### Task 4: CLI types + extraction utilities

**Files:**
- Create: `src/cli/analyzers/types.ts`
- Create: `src/cli/analyzers/extract.ts`
- Create: `src/cli/analyzers/extract.test.ts`

- [ ] **Step 1: Write failing tests for extract utilities**

```ts
// src/cli/analyzers/extract.test.ts
import { describe, it, expect } from 'vitest'
import { extractSelectors, extractApiCalls, extractPageTitle } from './extract'

describe('extractSelectors', () => {
  it('extracts data-testid selectors', () => {
    const content = `<button data-testid="dark-mode-toggle">Toggle</button>`
    expect(extractSelectors(content)).toEqual({
      darkModeToggle: '[data-testid="dark-mode-toggle"]',
    })
  })

  it('extracts aria-label selectors', () => {
    const content = `<button aria-label="Close menu">X</button>`
    expect(extractSelectors(content)).toEqual({
      closeMenu: '[aria-label="Close menu"]',
    })
  })

  it('returns empty object when no selectors found', () => {
    expect(extractSelectors('<div>no selectors</div>')).toEqual({})
  })

  it('deduplicates when same key appears twice', () => {
    const content = `<a data-testid="submit-btn"></a><b data-testid="submit-btn"></b>`
    const result = extractSelectors(content)
    expect(Object.keys(result)).toHaveLength(1)
  })
})

describe('extractApiCalls', () => {
  it('extracts fetch calls starting with /api/', () => {
    const content = `fetch('/api/user/profile')`
    expect(extractApiCalls(content)).toEqual(['/api/user/profile'])
  })

  it('extracts axios calls starting with /api/', () => {
    const content = `axios.get('/api/rewards')`
    expect(extractApiCalls(content)).toEqual(['/api/rewards'])
  })

  it('ignores non-/api/ fetch calls', () => {
    expect(extractApiCalls(`fetch('https://cdn.example.com/image.png')`)).toEqual([])
  })

  it('deduplicates identical calls', () => {
    const content = `fetch('/api/user') \n fetch('/api/user')`
    expect(extractApiCalls(content)).toHaveLength(1)
  })
})

describe('extractPageTitle', () => {
  it('extracts title from Next.js metadata export', () => {
    const content = `export const metadata = { title: 'Appearance Settings' }`
    expect(extractPageTitle(content)).toBe('Appearance Settings')
  })

  it('extracts title from HTML title tag', () => {
    const content = `<title>Billing Page</title>`
    expect(extractPageTitle(content)).toBe('Billing Page')
  })

  it('returns undefined when no title found', () => {
    expect(extractPageTitle('<div>no title</div>')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "extractSelectors"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/cli/analyzers/types.ts`**

```ts
export interface FrameworkAnalyzer {
  readonly name: string
  detect(rootDir: string): boolean
  analyze(rootDir: string): Promise<DiscoveredRoute[]>
}

export type DiscoveredRoute = {
  path: string
  componentFile: string
  pageTitle?: string
  selectors: Record<string, string>
  apiCalls: string[]
}
```

- [ ] **Step 4: Create `src/cli/analyzers/extract.ts`**

```ts
export function extractSelectors(content: string): Record<string, string> {
  const selectors: Record<string, string> = {}
  for (const match of content.matchAll(/data-testid=["']([^"']+)["']/g)) {
    selectors[toCamelCase(match[1])] = `[data-testid="${match[1]}"]`
  }
  for (const match of content.matchAll(/aria-label=["']([^"']+)["']/g)) {
    selectors[toCamelCase(match[1])] = `[aria-label="${match[1]}"]`
  }
  return selectors
}

export function extractApiCalls(content: string): string[] {
  const calls: string[] = []
  for (const match of content.matchAll(/fetch\(['"]([^'"]+)['"]/g)) {
    if (match[1].startsWith('/api/')) calls.push(match[1])
  }
  for (const match of content.matchAll(/axios\.\w+\(['"]([^'"]+)['"]/g)) {
    if (match[1].startsWith('/api/')) calls.push(match[1])
  }
  return [...new Set(calls)]
}

export function extractPageTitle(content: string): string | undefined {
  const metadataMatch = content.match(/title:\s*["']([^"']+)["']/)
  if (metadataMatch) return metadataMatch[1]
  const titleTagMatch = content.match(/<title>([^<]+)<\/title>/)
  if (titleTagMatch) return titleTagMatch[1]
  return undefined
}

function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toLowerCase())
}
```

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/cli/analyzers/types.ts src/cli/analyzers/extract.ts src/cli/analyzers/extract.test.ts
git commit -m "feat: add CLI types and selector/API extraction utilities"
```

---

### Task 5: Next.js analyzer

**Files:**
- Create: `src/cli/analyzers/nextjs.ts`
- Create: `src/cli/analyzers/nextjs.test.ts`
- Create: `src/cli/analyzers/__fixtures__/nextjs/next.config.ts`
- Create: `src/cli/analyzers/__fixtures__/nextjs/app/page.tsx`
- Create: `src/cli/analyzers/__fixtures__/nextjs/app/settings/appearance/page.tsx`
- Create: `src/cli/analyzers/__fixtures__/nextjs/pages/billing.tsx`

- [ ] **Step 1: Create fixture files**

`src/cli/analyzers/__fixtures__/nextjs/next.config.ts`:
```ts
export default {}
```

`src/cli/analyzers/__fixtures__/nextjs/app/page.tsx`:
```tsx
export default function HomePage() {
  return <main data-testid="home-hero">Welcome</main>
}
```

`src/cli/analyzers/__fixtures__/nextjs/app/settings/appearance/page.tsx`:
```tsx
export const metadata = { title: 'Appearance Settings' }

export default function AppearancePage() {
  return (
    <div>
      <button data-testid="dark-mode-toggle">Dark Mode</button>
    </div>
  )
}
```

`src/cli/analyzers/__fixtures__/nextjs/pages/billing.tsx`:
```tsx
export default function BillingPage() {
  return <div aria-label="billing section">Billing</div>
}
```

- [ ] **Step 2: Write failing test**

```ts
// src/cli/analyzers/nextjs.test.ts
import { describe, it, expect } from 'vitest'
import path from 'path'
import { fileURLToPath } from 'url'
import { nextjsAnalyzer } from './nextjs'

const fixtureDir = path.join(fileURLToPath(new URL('.', import.meta.url)), '__fixtures__/nextjs')

describe('nextjsAnalyzer', () => {
  it('detects a Next.js project by next.config.ts', () => {
    expect(nextjsAnalyzer.detect(fixtureDir)).toBe(true)
  })

  it('does not detect a non-Next.js project', () => {
    expect(nextjsAnalyzer.detect('/tmp')).toBe(false)
  })

  it('extracts routes from the app directory', async () => {
    const routes = await nextjsAnalyzer.analyze(fixtureDir)
    const paths = routes.map(r => r.path)
    expect(paths).toContain('/')
    expect(paths).toContain('/settings/appearance')
  })

  it('extracts routes from the pages directory', async () => {
    const routes = await nextjsAnalyzer.analyze(fixtureDir)
    expect(routes.map(r => r.path)).toContain('/billing')
  })

  it('extracts selectors from component files', async () => {
    const routes = await nextjsAnalyzer.analyze(fixtureDir)
    const appearance = routes.find(r => r.path === '/settings/appearance')
    expect(appearance?.selectors).toMatchObject({
      darkModeToggle: '[data-testid="dark-mode-toggle"]',
    })
  })

  it('extracts page title from metadata export', async () => {
    const routes = await nextjsAnalyzer.analyze(fixtureDir)
    const appearance = routes.find(r => r.path === '/settings/appearance')
    expect(appearance?.pageTitle).toBe('Appearance Settings')
  })

  it('deduplicates routes when both app and pages dirs exist for same path', async () => {
    const routes = await nextjsAnalyzer.analyze(fixtureDir)
    const unique = new Set(routes.map(r => r.path))
    expect(unique.size).toBe(routes.length)
  })
})
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "nextjsAnalyzer"
```

Expected: FAIL — module not found.

- [ ] **Step 4: Create `src/cli/analyzers/nextjs.ts`**

```ts
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import type { FrameworkAnalyzer, DiscoveredRoute } from './types'
import { extractSelectors, extractApiCalls, extractPageTitle } from './extract'

function existsSync(filePath: string): boolean {
  try { fs.accessSync(filePath); return true } catch { return false }
}

async function walkDir(dir: string): Promise<string[]> {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true })
    const files: string[] = []
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) files.push(...await walkDir(full))
      else files.push(full)
    }
    return files
  } catch { return [] }
}

const PAGE_PATTERN = /\/page\.(tsx?|jsx?)$/
const SPECIAL_PATTERN = /(layout|loading|error|not-found|template|default|route)\.(tsx?|jsx?)$/
const PAGES_EXCLUDE = /(^|\/)(_(app|document|error)\.(tsx?|jsx?)|api\/)/

function appRoutePath(rootDir: string, filePath: string): string {
  const rel = path.relative(path.join(rootDir, 'app'), filePath)
  const withoutPage = rel.replace(/\/page\.(tsx?|jsx?)$/, '').replace(/^page\.(tsx?|jsx?)$/, '')
  return withoutPage ? `/${withoutPage}` : '/'
}

function pagesRoutePath(rootDir: string, filePath: string): string {
  const rel = path.relative(path.join(rootDir, 'pages'), filePath)
  return '/' + rel.replace(/\.(tsx?|jsx?)$/, '')
}

async function routeFromFile(filePath: string, routePath: string): Promise<DiscoveredRoute> {
  const content = await fsp.readFile(filePath, 'utf-8')
  return {
    path: routePath,
    componentFile: filePath,
    pageTitle: extractPageTitle(content),
    selectors: extractSelectors(content),
    apiCalls: extractApiCalls(content),
  }
}

async function appRoutes(rootDir: string): Promise<DiscoveredRoute[]> {
  const files = await walkDir(path.join(rootDir, 'app'))
  const pageFiles = files.filter(f => PAGE_PATTERN.test(f) && !SPECIAL_PATTERN.test(f))
  return Promise.all(pageFiles.map(f => routeFromFile(f, appRoutePath(rootDir, f))))
}

async function pagesRoutes(rootDir: string): Promise<DiscoveredRoute[]> {
  const pagesDir = path.join(rootDir, 'pages')
  const files = await walkDir(pagesDir)
  const pageFiles = files.filter(f => {
    const rel = path.relative(pagesDir, f)
    return !PAGES_EXCLUDE.test(rel) && /\.(tsx?|jsx?)$/.test(f)
  })
  return Promise.all(pageFiles.map(f => routeFromFile(f, pagesRoutePath(rootDir, f))))
}

export const nextjsAnalyzer: FrameworkAnalyzer = {
  name: 'Next.js',

  detect(rootDir) {
    return (
      existsSync(path.join(rootDir, 'next.config.js')) ||
      existsSync(path.join(rootDir, 'next.config.ts')) ||
      existsSync(path.join(rootDir, 'next.config.mjs'))
    )
  },

  async analyze(rootDir) {
    const [app, pages] = await Promise.all([appRoutes(rootDir), pagesRoutes(rootDir)])
    const seen = new Set<string>()
    return [...app, ...pages].filter(r => {
      if (seen.has(r.path)) return false
      seen.add(r.path)
      return true
    })
  },
}
```

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/cli/analyzers/nextjs.ts src/cli/analyzers/nextjs.test.ts src/cli/analyzers/__fixtures__/nextjs
git commit -m "feat: add Next.js framework analyzer"
```

---

### Task 6: React Router analyzer

**Files:**
- Create: `src/cli/analyzers/react-router.ts`
- Create: `src/cli/analyzers/react-router.test.ts`
- Create: `src/cli/analyzers/__fixtures__/react-router/package.json`
- Create: `src/cli/analyzers/__fixtures__/react-router/src/App.tsx`

- [ ] **Step 1: Create fixture files**

`src/cli/analyzers/__fixtures__/react-router/package.json`:
```json
{
  "name": "test-react-app",
  "dependencies": {
    "react-router-dom": "^6.0.0"
  }
}
```

`src/cli/analyzers/__fixtures__/react-router/src/App.tsx`:
```tsx
import { createBrowserRouter } from 'react-router-dom'

const router = createBrowserRouter([
  { path: '/', element: <div>Home</div> },
  { path: '/settings', element: <div data-testid="settings-panel">Settings</div> },
  { path: '/billing', element: <div>Billing</div> },
])

export default router
```

- [ ] **Step 2: Write failing test**

```ts
// src/cli/analyzers/react-router.test.ts
import { describe, it, expect } from 'vitest'
import path from 'path'
import { fileURLToPath } from 'url'
import { reactRouterAnalyzer } from './react-router'

const fixtureDir = path.join(fileURLToPath(new URL('.', import.meta.url)), '__fixtures__/react-router')

describe('reactRouterAnalyzer', () => {
  it('detects a React Router project by package.json', () => {
    expect(reactRouterAnalyzer.detect(fixtureDir)).toBe(true)
  })

  it('does not detect a project without react-router', () => {
    expect(reactRouterAnalyzer.detect('/tmp')).toBe(false)
  })

  it('extracts route paths from createBrowserRouter config', async () => {
    const routes = await reactRouterAnalyzer.analyze(fixtureDir)
    const paths = routes.map(r => r.path)
    expect(paths).toContain('/')
    expect(paths).toContain('/settings')
    expect(paths).toContain('/billing')
  })

  it('extracts selectors from route component files', async () => {
    const routes = await reactRouterAnalyzer.analyze(fixtureDir)
    const hasSelector = routes.some(r => Object.keys(r.selectors).length > 0)
    expect(hasSelector).toBe(true)
  })

  it('returns empty array when no router file found', async () => {
    const routes = await reactRouterAnalyzer.analyze('/tmp/nonexistent-react-app')
    expect(routes).toEqual([])
  })
})
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "reactRouterAnalyzer"
```

Expected: FAIL — module not found.

- [ ] **Step 4: Create `src/cli/analyzers/react-router.ts`**

```ts
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import type { FrameworkAnalyzer, DiscoveredRoute } from './types'
import { extractSelectors, extractApiCalls } from './extract'

function existsSync(filePath: string): boolean {
  try { fs.accessSync(filePath); return true } catch { return false }
}

function hasReactRouterDep(rootDir: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    return 'react-router' in deps || 'react-router-dom' in deps
  } catch { return false }
}

function extractPaths(content: string): string[] {
  const paths: string[] = []
  for (const match of content.matchAll(/path=["']([^"']+)["']/g)) paths.push(match[1])
  for (const match of content.matchAll(/path:\s*["']([^"']+)["']/g)) paths.push(match[1])
  return [...new Set(paths)].filter(p => p.startsWith('/'))
}

const ROUTER_CANDIDATES = [
  'src/App.tsx', 'src/App.jsx', 'src/App.ts', 'src/App.js',
  'src/router.tsx', 'src/router.jsx', 'src/router.ts', 'src/router.js',
  'App.tsx', 'App.jsx', 'router.tsx', 'router.js',
]

async function findRouterFile(rootDir: string): Promise<string | null> {
  for (const candidate of ROUTER_CANDIDATES) {
    const filePath = path.join(rootDir, candidate)
    if (!existsSync(filePath)) continue
    const content = await fsp.readFile(filePath, 'utf-8')
    if (content.includes('react-router') || content.includes('createBrowserRouter') || content.includes('<Route')) {
      return filePath
    }
  }
  return null
}

export const reactRouterAnalyzer: FrameworkAnalyzer = {
  name: 'React Router',

  detect(rootDir) {
    return hasReactRouterDep(rootDir)
  },

  async analyze(rootDir) {
    const routerFile = await findRouterFile(rootDir)
    if (!routerFile) return []

    const content = await fsp.readFile(routerFile, 'utf-8')
    return extractPaths(content).map(routePath => ({
      path: routePath,
      componentFile: routerFile,
      pageTitle: undefined,
      selectors: extractSelectors(content),
      apiCalls: extractApiCalls(content),
    }))
  },
}
```

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/cli/analyzers/react-router.ts src/cli/analyzers/react-router.test.ts src/cli/analyzers/__fixtures__/react-router
git commit -m "feat: add React Router framework analyzer"
```

---

### Task 7: Vue Router analyzer

**Files:**
- Create: `src/cli/analyzers/vue-router.ts`
- Create: `src/cli/analyzers/vue-router.test.ts`
- Create: `src/cli/analyzers/__fixtures__/vue-router/package.json`
- Create: `src/cli/analyzers/__fixtures__/vue-router/src/router/index.ts`

- [ ] **Step 1: Create fixture files**

`src/cli/analyzers/__fixtures__/vue-router/package.json`:
```json
{
  "name": "test-vue-app",
  "dependencies": {
    "vue-router": "^4.0.0"
  }
}
```

`src/cli/analyzers/__fixtures__/vue-router/src/router/index.ts`:
```ts
import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', component: () => import('../views/Home.vue') },
  { path: '/settings', component: () => import('../views/Settings.vue') },
  { path: '/profile', component: () => import('../views/Profile.vue') },
]

export default createRouter({ history: createWebHistory(), routes })
```

- [ ] **Step 2: Write failing test**

```ts
// src/cli/analyzers/vue-router.test.ts
import { describe, it, expect } from 'vitest'
import path from 'path'
import { fileURLToPath } from 'url'
import { vueRouterAnalyzer } from './vue-router'

const fixtureDir = path.join(fileURLToPath(new URL('.', import.meta.url)), '__fixtures__/vue-router')

describe('vueRouterAnalyzer', () => {
  it('detects a Vue Router project by package.json', () => {
    expect(vueRouterAnalyzer.detect(fixtureDir)).toBe(true)
  })

  it('does not detect a project without vue-router', () => {
    expect(vueRouterAnalyzer.detect('/tmp')).toBe(false)
  })

  it('extracts route paths from router config', async () => {
    const routes = await vueRouterAnalyzer.analyze(fixtureDir)
    const paths = routes.map(r => r.path)
    expect(paths).toContain('/')
    expect(paths).toContain('/settings')
    expect(paths).toContain('/profile')
  })

  it('returns empty array when no router file found', async () => {
    const routes = await vueRouterAnalyzer.analyze('/tmp/nonexistent-vue-app')
    expect(routes).toEqual([])
  })
})
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "vueRouterAnalyzer"
```

Expected: FAIL — module not found.

- [ ] **Step 4: Create `src/cli/analyzers/vue-router.ts`**

```ts
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import type { FrameworkAnalyzer, DiscoveredRoute } from './types'
import { extractSelectors, extractApiCalls } from './extract'

function existsSync(filePath: string): boolean {
  try { fs.accessSync(filePath); return true } catch { return false }
}

function hasVueRouterDep(rootDir: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    return 'vue-router' in deps
  } catch { return false }
}

function extractPaths(content: string): string[] {
  const paths: string[] = []
  for (const match of content.matchAll(/path:\s*["']([^"']+)["']/g)) paths.push(match[1])
  return [...new Set(paths)].filter(p => p.startsWith('/'))
}

const ROUTER_CANDIDATES = [
  'src/router/index.ts', 'src/router/index.js',
  'src/router.ts', 'src/router.js',
  'router/index.ts', 'router/index.js',
]

async function findRouterFile(rootDir: string): Promise<string | null> {
  for (const candidate of ROUTER_CANDIDATES) {
    const filePath = path.join(rootDir, candidate)
    if (existsSync(filePath)) return filePath
  }
  return null
}

export const vueRouterAnalyzer: FrameworkAnalyzer = {
  name: 'Vue Router',

  detect(rootDir) {
    return hasVueRouterDep(rootDir)
  },

  async analyze(rootDir) {
    const routerFile = await findRouterFile(rootDir)
    if (!routerFile) return []

    const content = await fsp.readFile(routerFile, 'utf-8')
    return extractPaths(content).map(routePath => ({
      path: routePath,
      componentFile: routerFile,
      pageTitle: undefined,
      selectors: extractSelectors(content),
      apiCalls: extractApiCalls(content),
    }))
  },
}
```

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/cli/analyzers/vue-router.ts src/cli/analyzers/vue-router.test.ts src/cli/analyzers/__fixtures__/vue-router
git commit -m "feat: add Vue Router framework analyzer"
```

---

### Task 8: Framework registry

**Files:**
- Create: `src/cli/analyzers/registry.ts`
- Create: `src/cli/analyzers/registry.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/cli/analyzers/registry.test.ts
import { describe, it, expect } from 'vitest'
import path from 'path'
import { fileURLToPath } from 'url'
import { detectAnalyzer } from './registry'

const fixturesBase = path.join(fileURLToPath(new URL('.', import.meta.url)), '__fixtures__')

describe('detectAnalyzer', () => {
  it('detects Next.js for the nextjs fixture', () => {
    const analyzer = detectAnalyzer(path.join(fixturesBase, 'nextjs'))
    expect(analyzer?.name).toBe('Next.js')
  })

  it('detects React Router for the react-router fixture', () => {
    const analyzer = detectAnalyzer(path.join(fixturesBase, 'react-router'))
    expect(analyzer?.name).toBe('React Router')
  })

  it('detects Vue Router for the vue-router fixture', () => {
    const analyzer = detectAnalyzer(path.join(fixturesBase, 'vue-router'))
    expect(analyzer?.name).toBe('Vue Router')
  })

  it('returns null for an unknown project', () => {
    expect(detectAnalyzer('/tmp')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "detectAnalyzer"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/cli/analyzers/registry.ts`**

```ts
import type { FrameworkAnalyzer } from './types'
import { nextjsAnalyzer } from './nextjs'
import { reactRouterAnalyzer } from './react-router'
import { vueRouterAnalyzer } from './vue-router'

const analyzers: FrameworkAnalyzer[] = [
  nextjsAnalyzer,
  reactRouterAnalyzer,
  vueRouterAnalyzer,
]

export function detectAnalyzer(rootDir: string): FrameworkAnalyzer | null {
  return analyzers.find(a => a.detect(rootDir)) ?? null
}
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/analyzers/registry.ts src/cli/analyzers/registry.test.ts
git commit -m "feat: add framework registry with auto-detection"
```

---

### Task 9: LLM describe

**Files:**
- Create: `src/cli/llm-describe.ts`
- Create: `src/cli/llm-describe.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/cli/llm-describe.test.ts
import { describe, it, expect, vi } from 'vitest'
import { describeRoutes } from './llm-describe'
import type { DiscoveredRoute } from './analyzers/types'

const routes: DiscoveredRoute[] = [
  { path: '/settings/appearance', componentFile: 'page.tsx', pageTitle: 'Appearance', selectors: {}, apiCalls: [] },
  { path: '/billing', componentFile: 'billing.tsx', pageTitle: undefined, selectors: {}, apiCalls: [] },
]

describe('describeRoutes', () => {
  it('returns heuristic descriptions when llmConfig is null', async () => {
    const result = await describeRoutes(routes, null)
    expect(result.get('/settings/appearance')).toBe('Settings Appearance page')
    expect(result.get('/billing')).toBe('Billing page')
  })

  it('returns a description for every route passed in', async () => {
    const result = await describeRoutes(routes, null)
    expect(result.size).toBe(routes.length)
  })

  it('falls back to heuristic when LLM throws', async () => {
    const badConfig = { apiKey: 'invalid', model: 'gpt-4o-mini' }
    vi.mock('openai', () => ({
      default: class {
        chat = { completions: { create: vi.fn().mockRejectedValue(new Error('auth error')) } }
      },
    }))
    const result = await describeRoutes(routes, badConfig)
    expect(result.size).toBe(routes.length)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "describeRoutes"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/cli/llm-describe.ts`**

```ts
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
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/llm-describe.ts src/cli/llm-describe.test.ts
git commit -m "feat: add LLM route description generation with heuristic fallback"
```

---

### Task 10: Config writer

**Files:**
- Create: `src/cli/config-writer.ts`
- Create: `src/cli/config-writer.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/cli/config-writer.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fsp from 'fs/promises'
import path from 'path'
import os from 'os'
import { writeConfig } from './config-writer'
import type { RouteWithDescription } from './config-writer'

const routes: RouteWithDescription[] = [
  { path: '/', componentFile: 'page.tsx', selectors: {}, apiCalls: [], description: 'Home page' },
  {
    path: '/settings/appearance',
    componentFile: 'appearance/page.tsx',
    selectors: { darkModeToggle: '[data-testid="dark-mode-toggle"]' },
    apiCalls: ['/api/preferences'],
    description: 'Change theme and appearance settings',
  },
]

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'spotter-test-'))
})

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true })
})

describe('writeConfig', () => {
  it('writes a valid spotter.config.json', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    await writeConfig(routes, { outputPath, baseUrl: 'https://app.example.com' })

    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.version).toBe('1')
    expect(content.baseUrl).toBe('https://app.example.com')
    expect(content.routes).toHaveLength(2)
    expect(content.routes[0].path).toBe('/')
  })

  it('preserves existing descriptions on merge', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    await writeConfig(routes, { outputPath, baseUrl: 'https://app.example.com' })

    const updatedRoutes: RouteWithDescription[] = [
      ...routes,
      { path: '/new-page', componentFile: 'new.tsx', selectors: {}, apiCalls: [], description: 'New page' },
    ]
    await writeConfig(updatedRoutes, { outputPath, baseUrl: 'https://app.example.com' })

    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    const appearance = content.routes.find((r: { path: string }) => r.path === '/settings/appearance')
    expect(appearance.description).toBe('Change theme and appearance settings')
  })

  it('does not overwrite a manually-edited description', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    await writeConfig(routes, { outputPath, baseUrl: 'https://app.example.com' })

    const existing = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    existing.routes[0].description = 'Manually edited home description'
    await fsp.writeFile(outputPath, JSON.stringify(existing, null, 2))

    await writeConfig(routes, { outputPath, baseUrl: 'https://app.example.com' })

    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.routes[0].description).toBe('Manually edited home description')
  })

  it('preserves existing actions and mcpServers on merge', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    await writeConfig(routes, { outputPath, baseUrl: 'https://app.example.com' })

    const existing = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    existing.actions = [{ intent: 'change theme', type: 'api', endpoint: '/api/prefs', auth: 'session' }]
    await fsp.writeFile(outputPath, JSON.stringify(existing, null, 2))

    await writeConfig(routes, { outputPath, baseUrl: 'https://app.example.com' })

    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.actions).toHaveLength(1)
  })

  it('creates the output directory if it does not exist', async () => {
    const outputPath = path.join(tmpDir, 'subdir', 'spotter.config.json')
    await writeConfig(routes, { outputPath, baseUrl: 'https://app.example.com' })
    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.version).toBe('1')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "writeConfig"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/cli/config-writer.ts`**

```ts
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
      apiCalls: r.apiCalls,
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
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/config-writer.ts src/cli/config-writer.test.ts
git commit -m "feat: add config writer with merge and manual-edit preservation"
```

---

### Task 11: CLI orchestrator + bin entry + build config

**Files:**
- Create: `src/cli/analyze.ts`
- Create: `src/cli/index.ts`
- Modify: `tsup.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Create `src/cli/analyze.ts`**

```ts
import path from 'path'
import { detectAnalyzer } from './analyzers/registry'
import { describeRoutes } from './llm-describe'
import { writeConfig } from './config-writer'
import type { LLMConfig } from '../proxy/llm-client'
import type { RouteWithDescription } from './config-writer'

export type AnalyzeOptions = {
  rootDir: string
  outputPath: string
  baseUrl: string
  llmConfig: LLMConfig | null
}

export async function analyze(options: AnalyzeOptions): Promise<void> {
  const { rootDir, outputPath, baseUrl, llmConfig } = options

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

  await writeConfig(routesWithDescriptions, { outputPath, baseUrl })
  console.log(`✓ Written to ${path.relative(process.cwd(), outputPath)}`)
  console.log('\nNext steps: mount the proxy on your server, then add the widget script tag.')
}
```

- [ ] **Step 2: Create `src/cli/index.ts`**

```ts
import path from 'path'
import { analyze } from './analyze'
import type { LLMConfig } from '../proxy/llm-client'

const args = process.argv.slice(2)
const command = args[0]

function flag(name: string): string | undefined {
  const idx = args.indexOf(name)
  return idx !== -1 ? args[idx + 1] : undefined
}

if (command === 'analyze') {
  const rootDir = path.resolve(flag('--root') ?? process.cwd())
  const outputPath = path.resolve(flag('--output') ?? path.join(rootDir, 'spotter.config.json'))
  const baseUrl = flag('--base-url') ?? 'https://your-app.com'

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.log('tip: set OPENAI_API_KEY for richer route descriptions\n')
  }

  const llmConfig: LLMConfig | null = apiKey
    ? { apiKey, baseURL: process.env.SPOTTER_LLM_BASE_URL, model: process.env.SPOTTER_LLM_MODEL }
    : null

  analyze({ rootDir, outputPath, baseUrl, llmConfig }).catch(err => {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
} else {
  console.log(
    'Usage: spotter analyze [--root <dir>] [--output <path>] [--base-url <url>]\n\n' +
    'Environment:\n' +
    '  OPENAI_API_KEY       LLM key for description generation\n' +
    '  SPOTTER_LLM_BASE_URL Override LLM endpoint (e.g. OpenRouter)\n' +
    '  SPOTTER_LLM_MODEL    Override model (default: gpt-4o-mini)'
  )
  process.exit(command ? 1 : 0)
}
```

- [ ] **Step 3: Update `tsup.config.ts` to add CLI entry**

```ts
import { defineConfig, Format } from 'tsup'

const sharedConfig = {
  bundle: true,
  minify: false,
  dts: false,
  shims: true,
  skipNodeModulesBundle: false,
  clean: false,
  outExtension({ format }: { format: string }) {
    if (format === 'cjs') return { js: '.cjs' }
    return { js: `.${format}.js` }
  },
}

export default defineConfig([
  {
    ...sharedConfig,
    platform: 'browser',
    entry: ['src/index.ts'],
    format: ['esm', 'iife'] as Format[],
    globalName: 'Spotter',
    injectStyle: true,
    outDir: 'dist',
    clean: true,
  },
  {
    ...sharedConfig,
    platform: 'node',
    entry: ['src/proxy.ts'],
    format: ['esm', 'cjs'] as Format[],
    outDir: 'dist/node',
  },
  {
    ...sharedConfig,
    platform: 'node',
    entry: { cli: 'src/cli/index.ts' },
    format: ['esm'] as Format[],
    outDir: 'dist/cli',
    banner: { js: '#!/usr/bin/env node' },
    outExtension() { return { js: '.js' } },
  },
])
```

- [ ] **Step 4: Update `package.json`**

```json
{
  "name": "spotter-sdk",
  "version": "0.0.2",
  "description": "spotlight for enterprise applications",
  "main": "dist/node/proxy.cjs",
  "module": "dist/node/proxy.esm.js",
  "browser": "dist/index.iife.js",
  "bin": {
    "spotter": "./dist/cli/cli.js"
  },
  "exports": {
    ".": {
      "browser": "./dist/index.esm.js",
      "import": "./dist/index.esm.js"
    },
    "./proxy": {
      "import": "./dist/node/proxy.esm.js",
      "require": "./dist/node/proxy.cjs"
    }
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "author": "",
  "license": "ISC",
  "devDependencies": {
    "formdata-polyfill": "^4.0.10",
    "happy-dom": "^21.0.4",
    "jsdom": "^25.0.0",
    "tsup": "^8.3.6",
    "typescript": "^5.7.3",
    "vitest": "^5.1.0"
  },
  "dependencies": {
    "@babycommando/entity-db": "^1.0.9",
    "openai": "^4.82.0",
    "turndown": "^7.2.0",
    "zod": "^3.24.1"
  },
  "type": "module",
  "sourcemap": true
}
```

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 6: Build and verify the CLI binary exists**

```bash
npm run build && ls dist/cli/
```

Expected: `cli.js` present.

- [ ] **Step 7: Smoke-test the CLI against the nextjs fixture**

```bash
node dist/cli/cli.js analyze --root src/cli/analyzers/__fixtures__/nextjs --output /tmp/test-spotter.config.json
```

Expected output:
```
tip: set OPENAI_API_KEY for richer route descriptions

✓ Detected: Next.js
✓ Found 3 routes
✓ Extracted 3 selectors
✓ Written to /tmp/test-spotter.config.json

Next steps: mount the proxy on your server, then add the widget script tag.
```

- [ ] **Step 8: Commit**

```bash
git add src/cli/analyze.ts src/cli/index.ts tsup.config.ts package.json
git commit -m "feat: add CLI orchestrator, bin entry, and build config"
```

---

### Task 12: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite `README.md`**

```md
# spotter-sdk

Add a natural-language navigation layer to any existing web app. Users type what they want; Spotter navigates the UI for them.

```
"show me my unpaid invoices" → navigates to /billing/invoices?status=unpaid
"change to dark mode"        → walks user to /settings/appearance
```

## How it works

Two separate pieces — one for your backend, one for your frontend:

```
Browser (your frontend)              Your server (Node.js)        LLM
────────────────────────────────────────────────────────────────────────
Widget (spotter-sdk)      →POST→     createSpotterProxy()  →HTTP→  gpt-4o-mini
proxyUrl: '/api/spotter'             reads API key
                                     from server env var
```

1. Run `spotter analyze` — scans your codebase, writes `spotter.config.json` automatically.
2. Mount the proxy middleware on your Node.js server — your LLM key stays server-side.
3. Add the widget script tag — users get a floating chat panel.

## Packages

| Import path | Use case |
|---|---|
| `spotter-sdk` | Browser widget (ESM/IIFE) |
| `spotter-sdk/proxy` | Node.js proxy middleware |

## Quick start

### Step 1: Analyze your codebase

```bash
npx spotter-sdk analyze
```

Detects your framework (Next.js, React Router, Vue Router), extracts routes and selectors, and writes `spotter.config.json`. Set `OPENAI_API_KEY` for LLM-generated descriptions; falls back to path-based descriptions if not set.

```bash
# Optional flags
npx spotter-sdk analyze \
  --root ./my-app \
  --output ./spotter.config.json \
  --base-url https://app.example.com
```

You can also author `spotter.config.json` by hand — see [Config reference](#config-reference).

### Step 2: Mount the proxy

```ts
import express from 'express'
import { createSpotterProxy } from 'spotter-sdk/proxy'

const app = express()
app.use(express.json())

const spotter = createSpotterProxy({
  config: './spotter.config.json',
  llm: { apiKey: process.env.OPENAI_API_KEY! },
})

app.post('/api/spotter', (req, res) => spotter(req, res))
```

### Step 3: Add the widget

```html
<script src="https://unpkg.com/spotter-sdk/dist/index.iife.js"></script>
<script>
  Spotter.init({
    proxyUrl: '/api/spotter',
    sessionToken: () => window.__SESSION_TOKEN__,
    onUnhandled: (query) => {
      // forward to your existing chatbot if you have one
    },
  })
</script>
```

Or with ESM bundlers:

```ts
import { Spotter } from 'spotter-sdk'

Spotter.init({ proxyUrl: '/api/spotter' })
```

## LLM providers

Any OpenAI-compatible endpoint works. Set `baseURL` to switch:

```ts
// OpenAI (default — no baseURL needed)
createSpotterProxy({ config: '...', llm: { apiKey: process.env.OPENAI_API_KEY! } })

// OpenRouter (access Claude, Gemini, Llama, etc.)
createSpotterProxy({
  config: '...',
  llm: {
    apiKey: process.env.OPENROUTER_API_KEY!,
    baseURL: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-3-haiku',
  },
})

// Self-hosted Ollama
createSpotterProxy({
  config: '...',
  llm: {
    apiKey: 'ollama',
    baseURL: 'http://localhost:11434/v1',
    model: 'llama3',
  },
})
```

The CLI reads the same env vars:

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | LLM key (required for descriptions) |
| `SPOTTER_LLM_BASE_URL` | Override endpoint (e.g. OpenRouter) |
| `SPOTTER_LLM_MODEL` | Override model (default: `gpt-4o-mini`) |

## Analytics

Track what your users are asking for:

```ts
createSpotterProxy({
  config: './spotter.config.json',
  llm: { apiKey: process.env.OPENAI_API_KEY! },
  onAnalytics: (event) => {
    // event.query        — what the user typed
    // event.responseType — 'navigate' | 'answer' | 'unhandled' | 'error'
    // event.url          — page the user was on
    // event.role         — user role if passed to Spotter.init
    console.log(event)
  },
})
```

`unhandled` events are the most valuable signal — they show you what users are looking for that Spotter couldn't find. Use them to improve your config or identify missing features.

## Self-hosting / local dev

```bash
npm install spotter-sdk express dotenv
```

```
# .env  (do not commit)
OPENAI_API_KEY=sk-...
```

```js
// server.mjs
import 'dotenv/config'
import express from 'express'
import { createSpotterProxy } from 'spotter-sdk/proxy'

const app = express()
app.use(express.json())
app.use(express.static('public'))

const spotter = createSpotterProxy({
  config: './spotter.config.json',
  llm: { apiKey: process.env.OPENAI_API_KEY },
})

app.post('/api/spotter', (req, res) => spotter(req, res))
app.listen(3000)
```

```bash
node server.mjs
```

For production, set `OPENAI_API_KEY` as an environment variable in your hosting platform. The key never leaves your server.

## Response types

```ts
type SpotterResponse =
  | { type: 'navigate'; steps: NavigateStep[] }   // widget walks the user through the UI
  | { type: 'answer';   content: string }          // direct text answer
  | { type: 'unhandled'; query: string }           // LLM couldn't match anything
  | { type: 'error';    message: string }
```

## Config reference

`spotter.config.json` is generated by `spotter analyze` and committed to git.

```ts
type SpotterConfig = {
  version: '1'
  baseUrl: string
  routes: Route[]
  actions: Action[]
  mcpServers: MCPServer[]
}

type Route = {
  path: string
  description: string        // matched against user queries
  selectors?: Record<string, string>
  role?: string
}

type Action = {
  intent: string
  type: 'api'
  endpoint: string
  auth: 'session'
  role?: string
}

type MCPServer = {
  url: string
  allowedTools?: string[]
}
```

## `Spotter.init` options

```ts
type SpotterInitOptions = {
  proxyUrl: string
  sessionToken?: () => string | undefined
  role?: string
  onUnhandled?: (query: string) => void
  spotterKey?: string
}
```

## Security

- **LLM key never reaches the browser.** The widget only talks to your proxy.
- **Session tokens are the user's own tokens.** Your backend enforces permissions as normal.
- **No `innerHTML`.** The widget builds DOM nodes directly to prevent XSS.

## Development

```bash
npm install
npm test          # vitest
npm run build     # tsup → dist/ (browser) + dist/node/ (node) + dist/cli/ (CLI)
npx spotter-sdk analyze --help
```
```

- [ ] **Step 2: Run all tests to confirm nothing broke**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: restructure README around 3-step quick start, add LLM providers + analytics sections"
```
