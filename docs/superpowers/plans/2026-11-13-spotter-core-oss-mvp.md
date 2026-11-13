# Spotter Core OSS MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core OSS MVP — a floating chat widget (`@spotter/widget`) + self-hosted proxy middleware (`@spotter/proxy`) + config format (`spotter.config.json`) — that lets an operator add navigate-only Spotter to their app in three steps, with zero data leaving their infrastructure.

**Architecture:** The widget (browser IIFE) sends user queries to the operator's own backend proxy via `POST /api/spotter`. The proxy holds the LLM key server-side, classifies the query against `spotter.config.json`, and returns navigate instructions. The widget executes those instructions by highlighting elements and stepping the user through the UI. MCP/API actions and the CLI crawl tool are out of scope for this plan.

**Tech Stack:** TypeScript, Vitest + happy-dom, Zod, OpenAI SDK (server-side only), tsup (dual browser/node builds), vanilla DOM (no framework)

---

## File Map

Files created or significantly changed by this plan:

| File | Type | Responsibility |
|---|---|---|
| `src/types.ts` | shared | Zod schemas + TS types for SpotterConfig, SpotterQuery, SpotterResponse |
| `src/proxy/site-map.ts` | proxy | Load config from disk, summarize for LLM context, find route/action by path/intent |
| `src/proxy/llm-client.ts` | proxy | Server-side OpenAI wrapper — classify query + return matched route/action path |
| `src/proxy/index.ts` | proxy | `createSpotterProxy()` — returns Express-compatible request handler |
| `src/widget/navigator.ts` | widget | Highlight DOM elements, show step tooltips, advance on click |
| `src/widget/ui.ts` | widget | Create/destroy floating button + chat panel DOM |
| `src/widget/client.ts` | widget | `fetch` wrapper — POST query to proxyUrl, return typed SpotterResponse |
| `src/widget/index.ts` | widget | `Spotter.init()` — wires UI + client + navigator together |
| `src/index.ts` | entry | Browser entry point — re-exports widget only |
| `src/proxy.ts` | entry | Node entry point — re-exports proxy only |
| `src/styles.css` | widget | Existing file — extend with highlight + tooltip + chat panel styles |
| `tsup.config.ts` | build | Update to use separate browser (`src/index.ts`) and node (`src/proxy.ts`) entries |
| `package.json` | build | Add `exports` map, add Vitest dev deps |
| `vitest.config.ts` | test | Vitest config — node env for proxy tests, happy-dom for widget tests |

Files **not** changed: `src/html-processor.ts`, `src/storage/local-storage.ts` (kept for future CLI use), `src/llm.ts` (superseded by `src/proxy/llm-client.ts` — delete at end of Task 4).

---

## Task 1: Test Infrastructure

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install test dependencies**

```bash
npm install --save-dev vitest@5.1.0 happy-dom@21.0.4
```

Expected: `package.json` devDependencies updated, no errors.

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environmentMatchGlobs: [
      ['src/widget/**', 'happy-dom'],
      ['src/proxy/**', 'node'],
    ],
  },
})
```

- [ ] **Step 3: Add test script to `package.json`**

In `package.json`, replace `"test": "echo \"Error: no test specified\" && exit 1"` with:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a smoke test to verify the setup**

Create `src/proxy/smoke.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('proxy test environment', () => {
  it('runs in node', () => {
    expect(typeof window).toBe('undefined')
  })
})
```

Create `src/widget/smoke.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('widget test environment', () => {
  it('runs with DOM', () => {
    expect(typeof document).toBe('object')
  })
})
```

- [ ] **Step 5: Run tests and confirm both pass**

```bash
npm test
```

Expected output:
```
✓ src/proxy/smoke.test.ts (1)
✓ src/widget/smoke.test.ts (1)
Test Files  2 passed (2)
```

- [ ] **Step 6: Delete smoke tests and commit**

```bash
rm src/proxy/smoke.test.ts src/widget/smoke.test.ts
git add vitest.config.ts package.json package-lock.json
git commit -m "test: add vitest + happy-dom test infrastructure"
```

---

## Task 2: Config Types

**Files:**
- Create: `src/types.ts`
- Create: `src/types.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { SpotterConfigSchema } from './types'

describe('SpotterConfigSchema', () => {
  it('parses a valid minimal config', () => {
    const config = SpotterConfigSchema.parse({
      version: '1',
      baseUrl: 'https://app.com',
      routes: [],
      actions: [],
      mcpServers: [],
    })
    expect(config.version).toBe('1')
    expect(config.routes).toEqual([])
  })

  it('parses a config with routes and actions', () => {
    const config = SpotterConfigSchema.parse({
      version: '1',
      baseUrl: 'https://app.com',
      routes: [
        {
          path: '/settings/appearance',
          description: 'Dark mode and theme settings',
          selectors: { darkModeToggle: '[data-testid="dark-mode"]' },
        },
      ],
      actions: [
        {
          intent: 'get user points balance',
          type: 'api',
          endpoint: 'GET /api/user/rewards',
          auth: 'session',
        },
      ],
      mcpServers: [
        { url: 'https://api.app.com/mcp', allowedTools: ['getPoints'] },
      ],
    })
    expect(config.routes[0].path).toBe('/settings/appearance')
    expect(config.actions[0].intent).toBe('get user points balance')
    expect(config.mcpServers[0].url).toBe('https://api.app.com/mcp')
  })

  it('rejects config missing baseUrl', () => {
    expect(() =>
      SpotterConfigSchema.parse({ version: '1', routes: [], actions: [], mcpServers: [] })
    ).toThrow()
  })

  it('rejects route missing description', () => {
    expect(() =>
      SpotterConfigSchema.parse({
        version: '1',
        baseUrl: 'https://app.com',
        routes: [{ path: '/foo' }],
        actions: [],
        mcpServers: [],
      })
    ).toThrow()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test src/types.test.ts
```

Expected: FAIL — `Cannot find module './types'`

- [ ] **Step 3: Create `src/types.ts`**

```typescript
import { z } from 'zod'

export const RouteSchema = z.object({
  path: z.string(),
  description: z.string(),
  selectors: z.record(z.string()).default({}),
  role: z.string().optional(),
})

export const ActionSchema = z.object({
  intent: z.string(),
  type: z.literal('api'),
  endpoint: z.string(),
  auth: z.literal('session'),
  role: z.string().optional(),
})

export const MCPServerSchema = z.object({
  url: z.string().url(),
  allowedTools: z.array(z.string()).optional(),
})

export const SpotterConfigSchema = z.object({
  version: z.literal('1'),
  baseUrl: z.string().url(),
  routes: z.array(RouteSchema),
  actions: z.array(ActionSchema),
  mcpServers: z.array(MCPServerSchema),
})

export type Route = z.infer<typeof RouteSchema>
export type Action = z.infer<typeof ActionSchema>
export type MCPServer = z.infer<typeof MCPServerSchema>
export type SpotterConfig = z.infer<typeof SpotterConfigSchema>

export type NavigateStep = {
  selector: string
  description: string
  interactionType: 'click' | 'expand' | 'none'
}

export type SpotterQuery = {
  query: string
  url: string
  sessionToken?: string
  role?: string
}

export type SpotterResponse =
  | { type: 'navigate'; steps: NavigateStep[] }
  | { type: 'answer'; content: string }
  | { type: 'unhandled'; query: string }
  | { type: 'error'; message: string }
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test src/types.test.ts
```

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/types.test.ts
git commit -m "feat: add SpotterConfig Zod schema and shared types"
```

---

## Task 3: Site Map Utilities

**Files:**
- Create: `src/proxy/site-map.ts`
- Create: `src/proxy/site-map.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/proxy/site-map.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { summarizeConfig, findRouteByPath, findActionByIntent } from './site-map'
import type { SpotterConfig } from '../types'

const config: SpotterConfig = {
  version: '1',
  baseUrl: 'https://app.com',
  mcpServers: [],
  routes: [
    {
      path: '/settings/appearance',
      description: 'Dark mode and theme settings',
      selectors: { darkModeToggle: '[data-testid="dark-mode"]' },
    },
    {
      path: '/rewards',
      description: 'User points balance and rewards history',
      selectors: {},
    },
  ],
  actions: [
    {
      intent: 'get user points balance',
      type: 'api',
      endpoint: 'GET /api/user/rewards',
      auth: 'session',
    },
  ],
}

describe('summarizeConfig', () => {
  it('includes all route paths and descriptions', () => {
    const summary = summarizeConfig(config)
    expect(summary).toContain('/settings/appearance')
    expect(summary).toContain('Dark mode and theme settings')
    expect(summary).toContain('/rewards')
  })

  it('includes all action intents', () => {
    const summary = summarizeConfig(config)
    expect(summary).toContain('get user points balance')
  })
})

describe('findRouteByPath', () => {
  it('returns route for exact path match', () => {
    const route = findRouteByPath(config, '/settings/appearance')
    expect(route?.description).toBe('Dark mode and theme settings')
  })

  it('returns undefined for unknown path', () => {
    expect(findRouteByPath(config, '/unknown')).toBeUndefined()
  })
})

describe('findActionByIntent', () => {
  it('returns action for exact intent match', () => {
    const action = findActionByIntent(config, 'get user points balance')
    expect(action?.endpoint).toBe('GET /api/user/rewards')
  })

  it('returns undefined for unknown intent', () => {
    expect(findActionByIntent(config, 'delete account')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test src/proxy/site-map.test.ts
```

Expected: FAIL — `Cannot find module './site-map'`

- [ ] **Step 3: Create `src/proxy/site-map.ts`**

```typescript
import fs from 'fs/promises'
import { SpotterConfigSchema } from '../types'
import type { SpotterConfig, Route, Action } from '../types'

export async function loadConfig(configPath: string): Promise<SpotterConfig> {
  const raw = await fs.readFile(configPath, 'utf-8')
  return SpotterConfigSchema.parse(JSON.parse(raw))
}

export function summarizeConfig(config: SpotterConfig): string {
  const routes = config.routes
    .map((r) => `  - ${r.path}: "${r.description}"${r.role ? ` [role: ${r.role}]` : ''}`)
    .join('\n')

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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test src/proxy/site-map.test.ts
```

Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/proxy/site-map.ts src/proxy/site-map.test.ts
git commit -m "feat: add site map loader and config search utilities"
```

---

## Task 4: LLM Client (Server-Side)

**Files:**
- Create: `src/proxy/llm-client.ts`
- Create: `src/proxy/llm-client.test.ts`
- Delete: `src/llm.ts` (superseded)

- [ ] **Step 1: Write failing tests**

Create `src/proxy/llm-client.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { routeQuery } from './llm-client'
import type { RouteResult } from './llm-client'

const makeMockClient = (result: RouteResult) => ({
  chat: {
    completions: {
      create: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(result) } }],
      }),
    },
  },
})

describe('routeQuery', () => {
  it('returns navigate result with routePath for a navigation query', async () => {
    const client = makeMockClient({ type: 'navigate', routePath: '/settings/appearance' })
    const result = await routeQuery(
      client as any,
      'how do I turn on dark mode?',
      'Routes:\n  - /settings/appearance: "Dark mode settings"'
    )
    expect(result.type).toBe('navigate')
    expect((result as { type: 'navigate'; routePath: string }).routePath).toBe('/settings/appearance')
  })

  it('returns action result with actionIntent for an action query', async () => {
    const client = makeMockClient({ type: 'action', actionIntent: 'get user points balance' })
    const result = await routeQuery(
      client as any,
      'how many points do I have?',
      'Actions:\n  - "get user points balance" → GET /api/user/rewards'
    )
    expect(result.type).toBe('action')
    expect((result as { type: 'action'; actionIntent: string }).actionIntent).toBe('get user points balance')
  })

  it('returns general for a non-navigation query', async () => {
    const client = makeMockClient({ type: 'general' })
    const result = await routeQuery(
      client as any,
      'what is your refund policy?',
      'Routes:\n  - /settings/appearance: "Dark mode settings"'
    )
    expect(result.type).toBe('general')
  })

  it('defaults to general if LLM returns unexpected JSON', async () => {
    const client = {
      chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: 'not json' } }] }) } },
    }
    const result = await routeQuery(client as any, 'some query', 'Routes:\n  (none)')
    expect(result.type).toBe('general')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test src/proxy/llm-client.test.ts
```

Expected: FAIL — `Cannot find module './llm-client'`

- [ ] **Step 3: Create `src/proxy/llm-client.ts`**

```typescript
import OpenAI from 'openai'

export type RouteResult =
  | { type: 'navigate'; routePath: string }
  | { type: 'action'; actionIntent: string }
  | { type: 'general' }

export function createLLMClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey })
}

export async function routeQuery(
  client: OpenAI,
  query: string,
  siteMapSummary: string
): Promise<RouteResult> {
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
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

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test src/proxy/llm-client.test.ts
```

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Delete the superseded LLM file and commit**

```bash
git rm src/llm.ts
git add src/proxy/llm-client.ts src/proxy/llm-client.test.ts
git commit -m "feat: add server-side LLM client for query routing, remove browser-side llm.ts"
```

---

## Task 5: Proxy Middleware

**Files:**
- Create: `src/proxy/index.ts`
- Create: `src/proxy/index.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/proxy/index.test.ts`:

```typescript
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

    const handler = createSpotterProxy({ config: mockConfig, llm: { provider: 'openai', apiKey: 'test' } })
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

    const handler = createSpotterProxy({ config: configNoSelectors, llm: { provider: 'openai', apiKey: 'test' } })
    const { req, res, jsonFn } = makeReqRes({ query: 'show my points', url: 'https://app.com/home' })

    await handler(req, res)

    const response = jsonFn.mock.calls[0][0]
    expect(response.type).toBe('navigate')
    expect(response.steps[0].description).toContain('/rewards')
  })

  it('returns unhandled when LLM returns general', async () => {
    vi.mocked(routeQuery).mockResolvedValue({ type: 'general' })

    const handler = createSpotterProxy({ config: mockConfig, llm: { provider: 'openai', apiKey: 'test' } })
    const { req, res, jsonFn } = makeReqRes({ query: 'what is your phone number?', url: 'https://app.com' })

    await handler(req, res)
    expect(jsonFn.mock.calls[0][0]).toMatchObject({ type: 'unhandled', query: 'what is your phone number?' })
  })

  it('returns error response on unexpected throw', async () => {
    vi.mocked(routeQuery).mockRejectedValue(new Error('network failure'))

    const handler = createSpotterProxy({ config: mockConfig, llm: { provider: 'openai', apiKey: 'test' } })
    const { req, res, jsonFn } = makeReqRes({ query: 'test', url: 'https://app.com' })

    await handler(req, res)
    expect(jsonFn.mock.calls[0][0]).toMatchObject({ type: 'error' })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test src/proxy/index.test.ts
```

Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 3: Create `src/proxy/index.ts`**

```typescript
import { createLLMClient, routeQuery } from './llm-client'
import { summarizeConfig, findRouteByPath, findActionByIntent } from './site-map'
import { SpotterConfigSchema } from '../types'
import type { SpotterConfig, SpotterQuery, SpotterResponse, NavigateStep } from '../types'

export interface SpotterProxyOptions {
  config: string | SpotterConfig
  llm: { provider: 'openai'; apiKey: string }
}

type RequestLike = { body: SpotterQuery }
type ResponseLike = { json: (data: unknown) => void; status: (code: number) => ResponseLike }

export function createSpotterProxy(
  options: SpotterProxyOptions
): (req: RequestLike, res: ResponseLike) => Promise<void> {
  const llmClient = createLLMClient(options.llm.apiKey)

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
      const result = await routeQuery(llmClient, query, summary)

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

      res.json(response)
    } catch (err) {
      res.json({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
    }
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test src/proxy/index.test.ts
```

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/proxy/index.ts src/proxy/index.test.ts
git commit -m "feat: add createSpotterProxy middleware with intent routing"
```

---

## Task 6: Widget Navigator

**Files:**
- Create: `src/widget/navigator.ts`
- Create: `src/widget/navigator.test.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing tests**

Create `src/widget/navigator.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NavigatorController } from './navigator'

beforeEach(() => {
  document.body.innerHTML = `
    <button data-testid="dark-mode">Toggle dark mode</button>
    <a href="/rewards">Rewards</a>
  `
})

afterEach(() => {
  document.body.innerHTML = ''
  document.querySelectorAll('[data-spotter-overlay]').forEach((el) => el.remove())
})

describe('NavigatorController', () => {
  it('creates a highlight overlay for a valid selector', () => {
    const nav = new NavigatorController()
    nav.highlightStep({ selector: '[data-testid="dark-mode"]', description: 'Toggle dark mode', interactionType: 'click' })
    expect(document.querySelector('[data-spotter-overlay]')).not.toBeNull()
  })

  it('creates a tooltip with the step description', () => {
    const nav = new NavigatorController()
    nav.highlightStep({ selector: '[data-testid="dark-mode"]', description: 'Toggle dark mode', interactionType: 'click' })
    const tooltip = document.querySelector('[data-spotter-tooltip]')
    expect(tooltip?.textContent).toContain('Toggle dark mode')
  })

  it('removes overlay and tooltip on clear', () => {
    const nav = new NavigatorController()
    nav.highlightStep({ selector: '[data-testid="dark-mode"]', description: 'Toggle', interactionType: 'click' })
    nav.clear()
    expect(document.querySelector('[data-spotter-overlay]')).toBeNull()
    expect(document.querySelector('[data-spotter-tooltip]')).toBeNull()
  })

  it('does nothing silently if selector matches no element', () => {
    const nav = new NavigatorController()
    expect(() =>
      nav.highlightStep({ selector: '[data-testid="nonexistent"]', description: 'Missing', interactionType: 'click' })
    ).not.toThrow()
  })

  it('calls onComplete when highlighted element is clicked', () => {
    return new Promise<void>((resolve) => {
      const nav = new NavigatorController()
      nav.onComplete(() => resolve())
      nav.highlightStep({ selector: '[data-testid="dark-mode"]', description: 'Click me', interactionType: 'click' })
      const btn = document.querySelector<HTMLElement>('[data-testid="dark-mode"]')
      btn?.click()
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test src/widget/navigator.test.ts
```

Expected: FAIL — `Cannot find module './navigator'`

- [ ] **Step 3: Create `src/widget/navigator.ts`**

```typescript
import type { NavigateStep } from '../types'

export class NavigatorController {
  private overlay: HTMLElement | null = null
  private tooltip: HTMLElement | null = null
  private completeHandler: (() => void) | null = null
  private clickHandler: (() => void) | null = null
  private currentTarget: HTMLElement | null = null

  onComplete(handler: () => void): void {
    this.completeHandler = handler
  }

  highlightStep(step: NavigateStep): void {
    this.clear()
    const target = document.querySelector<HTMLElement>(step.selector)
    if (!target) return

    this.currentTarget = target
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })

    const rect = target.getBoundingClientRect()
    const scrollX = window.scrollX
    const scrollY = window.scrollY

    this.overlay = document.createElement('div')
    this.overlay.setAttribute('data-spotter-overlay', '')
    Object.assign(this.overlay.style, {
      position: 'absolute',
      top: `${rect.top + scrollY - 4}px`,
      left: `${rect.left + scrollX - 4}px`,
      width: `${rect.width + 8}px`,
      height: `${rect.height + 8}px`,
      pointerEvents: 'none',
      zIndex: '999998',
    })
    document.body.appendChild(this.overlay)

    this.tooltip = document.createElement('div')
    this.tooltip.setAttribute('data-spotter-tooltip', '')
    this.tooltip.textContent = step.description
    Object.assign(this.tooltip.style, {
      position: 'absolute',
      top: `${rect.bottom + scrollY + 8}px`,
      left: `${rect.left + scrollX}px`,
      zIndex: '999999',
    })
    document.body.appendChild(this.tooltip)

    this.clickHandler = () => {
      this.clear()
      this.completeHandler?.()
    }
    target.addEventListener('click', this.clickHandler, { once: true })
  }

  clear(): void {
    this.overlay?.remove()
    this.tooltip?.remove()
    this.overlay = null
    this.tooltip = null
    if (this.currentTarget && this.clickHandler) {
      this.currentTarget.removeEventListener('click', this.clickHandler)
    }
    this.currentTarget = null
    this.clickHandler = null
  }
}
```

- [ ] **Step 4: Add highlight + tooltip styles to `src/styles.css`**

Append to the existing `src/styles.css`:

```css
/* Spotter highlight overlay */
[data-spotter-overlay] {
  border: 2px solid #6366f1;
  border-radius: 6px;
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2);
  animation: spotter-pulse 1.5s ease-in-out infinite;
}

@keyframes spotter-pulse {
  0%, 100% { box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2); }
  50% { box-shadow: 0 0 0 8px rgba(99, 102, 241, 0.05); }
}

/* Spotter step tooltip */
[data-spotter-tooltip] {
  background: #1e1b4b;
  color: #e0e7ff;
  font-family: system-ui, sans-serif;
  font-size: 13px;
  padding: 6px 10px;
  border-radius: 6px;
  max-width: 280px;
  pointer-events: none;
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm test src/widget/navigator.test.ts
```

Expected: PASS — 5 tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/widget/navigator.ts src/widget/navigator.test.ts src/styles.css
git commit -m "feat: add NavigatorController for DOM highlighting and step tooltips"
```

---

## Task 7: Widget UI

**Files:**
- Create: `src/widget/ui.ts`
- Create: `src/widget/ui.test.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing tests**

Create `src/widget/ui.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createUI } from './ui'

beforeEach(() => { document.body.innerHTML = '' })
afterEach(() => { document.body.innerHTML = '' })

describe('createUI', () => {
  it('mounts a container into the DOM', () => {
    const ui = createUI()
    document.body.appendChild(ui.container)
    expect(document.querySelector('[data-spotter-root]')).not.toBeNull()
  })

  it('panel is hidden by default', () => {
    const ui = createUI()
    document.body.appendChild(ui.container)
    const panel = document.querySelector<HTMLElement>('[data-spotter-panel]')
    expect(panel?.getAttribute('data-open')).toBeFalsy()
  })

  it('panel opens when toggle button is clicked', () => {
    const ui = createUI()
    document.body.appendChild(ui.container)
    document.querySelector<HTMLElement>('[data-spotter-toggle]')?.click()
    const panel = document.querySelector<HTMLElement>('[data-spotter-panel]')
    expect(panel?.getAttribute('data-open')).toBe('true')
  })

  it('calls onSubmit with trimmed input when form is submitted', () => {
    const ui = createUI()
    document.body.appendChild(ui.container)
    const onSubmit = vi.fn()
    ui.onSubmit(onSubmit)

    const input = document.querySelector<HTMLInputElement>('[data-spotter-input]')!
    input.value = '  dark mode  '
    document.querySelector<HTMLFormElement>('[data-spotter-form]')?.dispatchEvent(new Event('submit'))

    expect(onSubmit).toHaveBeenCalledWith('dark mode')
  })

  it('clears input after submit', () => {
    const ui = createUI()
    document.body.appendChild(ui.container)
    ui.onSubmit(vi.fn())
    const input = document.querySelector<HTMLInputElement>('[data-spotter-input]')!
    input.value = 'test query'
    document.querySelector<HTMLFormElement>('[data-spotter-form]')?.dispatchEvent(new Event('submit'))
    expect(input.value).toBe('')
  })

  it('showMessage adds a message bubble to the panel', () => {
    const ui = createUI()
    document.body.appendChild(ui.container)
    ui.showMessage('I can only help with navigation.')
    expect(document.querySelector('[data-spotter-messages]')?.textContent).toContain('I can only help with navigation.')
  })

  it('showSteps renders a numbered step list', () => {
    const ui = createUI()
    document.body.appendChild(ui.container)
    ui.showSteps([
      { selector: '#foo', description: 'Click the foo button', interactionType: 'click' },
      { selector: '#bar', description: 'Then click bar', interactionType: 'click' },
    ])
    const messages = document.querySelector('[data-spotter-messages]')?.textContent
    expect(messages).toContain('Click the foo button')
    expect(messages).toContain('Then click bar')
  })

  it('destroy removes the container from DOM', () => {
    const ui = createUI()
    document.body.appendChild(ui.container)
    ui.destroy()
    expect(document.querySelector('[data-spotter-root]')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test src/widget/ui.test.ts
```

Expected: FAIL — `Cannot find module './ui'`

- [ ] **Step 3: Create `src/widget/ui.ts`**

```typescript
import type { NavigateStep } from '../types'

export interface UIController {
  container: HTMLElement
  onSubmit: (handler: (query: string) => void) => void
  showMessage: (text: string) => void
  showSteps: (steps: NavigateStep[]) => void
  destroy: () => void
}

export function createUI(): UIController {
  const container = document.createElement('div')
  container.setAttribute('data-spotter-root', '')

  const toggle = document.createElement('button')
  toggle.setAttribute('data-spotter-toggle', '')
  toggle.textContent = '✦ Ask Spotter'

  const panel = document.createElement('div')
  panel.setAttribute('data-spotter-panel', '')

  const messages = document.createElement('div')
  messages.setAttribute('data-spotter-messages', '')

  const form = document.createElement('form')
  form.setAttribute('data-spotter-form', '')

  const input = document.createElement('input')
  input.setAttribute('data-spotter-input', '')
  input.placeholder = 'Ask anything...'
  input.autocomplete = 'off'

  const submit = document.createElement('button')
  submit.type = 'submit'
  submit.textContent = '→'

  form.appendChild(input)
  form.appendChild(submit)
  panel.appendChild(messages)
  panel.appendChild(form)
  container.appendChild(toggle)
  container.appendChild(panel)

  toggle.addEventListener('click', () => {
    const isOpen = panel.getAttribute('data-open') === 'true'
    panel.setAttribute('data-open', isOpen ? 'false' : 'true')
  })

  let submitHandler: ((query: string) => void) | null = null

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const query = input.value.trim()
    if (!query) return
    input.value = ''
    submitHandler?.(query)
  })

  function appendMessage(html: string): void {
    const bubble = document.createElement('div')
    bubble.setAttribute('data-spotter-bubble', '')
    bubble.innerHTML = html
    messages.appendChild(bubble)
    messages.scrollTop = messages.scrollHeight
  }

  return {
    container,
    onSubmit(handler) { submitHandler = handler },
    showMessage(text) { appendMessage(text) },
    showSteps(steps) {
      const list = steps
        .map((s, i) => `${i + 1}. ${s.description}`)
        .join('<br>')
      appendMessage(list)
    },
    destroy() { container.remove() },
  }
}
```

- [ ] **Step 4: Add widget panel styles to `src/styles.css`**

Append to `src/styles.css`:

```css
/* Spotter widget root */
[data-spotter-root] {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 999997;
  font-family: system-ui, sans-serif;
}

/* Toggle button */
[data-spotter-toggle] {
  background: #4f46e5;
  color: #fff;
  border: none;
  border-radius: 24px;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
}

/* Chat panel */
[data-spotter-panel] {
  display: none;
  flex-direction: column;
  width: 320px;
  max-height: 420px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  margin-bottom: 8px;
  overflow: hidden;
}

[data-spotter-panel][data-open="true"] { display: flex; }

/* Messages area */
[data-spotter-messages] {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Message bubble */
[data-spotter-bubble] {
  background: #f1f5f9;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  line-height: 1.5;
  color: #1e293b;
}

/* Input form */
[data-spotter-form] {
  display: flex;
  gap: 6px;
  padding: 10px 12px;
  border-top: 1px solid #e2e8f0;
}

[data-spotter-input] {
  flex: 1;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  outline: none;
}

[data-spotter-form] button[type="submit"] {
  background: #4f46e5;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 14px;
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm test src/widget/ui.test.ts
```

Expected: PASS — 8 tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/widget/ui.ts src/widget/ui.test.ts src/styles.css
git commit -m "feat: add floating chat widget UI with panel, input, and step display"
```

---

## Task 8: Widget Client

**Files:**
- Create: `src/widget/client.ts`
- Create: `src/widget/client.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/widget/client.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { sendQuery } from './client'
import type { SpotterResponse } from '../types'

afterEach(() => vi.restoreAllMocks())

describe('sendQuery', () => {
  it('POSTs to proxyUrl and returns parsed response', async () => {
    const mockResponse: SpotterResponse = {
      type: 'navigate',
      steps: [{ selector: '#foo', description: 'Click foo', interactionType: 'click' }],
    }

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }))

    const result = await sendQuery('/api/spotter', {
      query: 'dark mode',
      url: 'https://app.com',
      sessionToken: 'tok123',
    })

    expect(fetch).toHaveBeenCalledWith('/api/spotter', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }))
    expect(result).toEqual(mockResponse)
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    await expect(sendQuery('/api/spotter', { query: 'test', url: 'https://app.com' })).rejects.toThrow('500')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test src/widget/client.test.ts
```

Expected: FAIL — `Cannot find module './client'`

- [ ] **Step 3: Create `src/widget/client.ts`**

```typescript
import type { SpotterQuery, SpotterResponse } from '../types'

export async function sendQuery(proxyUrl: string, body: SpotterQuery): Promise<SpotterResponse> {
  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Spotter proxy error: ${res.status}`)
  return res.json() as Promise<SpotterResponse>
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test src/widget/client.test.ts
```

Expected: PASS — 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/widget/client.ts src/widget/client.test.ts
git commit -m "feat: add widget client for proxying queries to backend"
```

---

## Task 9: Widget Init

**Files:**
- Create: `src/widget/index.ts`
- Create: `src/widget/index.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/widget/index.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./client', () => ({ sendQuery: vi.fn() }))

import { sendQuery } from './client'
import { Spotter } from './index'

beforeEach(() => { document.body.innerHTML = '' })
afterEach(() => { Spotter.destroy(); document.body.innerHTML = ''; vi.clearAllMocks() })

describe('Spotter.init', () => {
  it('mounts the widget into the DOM', () => {
    Spotter.init({ proxyUrl: '/api/spotter' })
    expect(document.querySelector('[data-spotter-root]')).not.toBeNull()
  })

  it('does not mount twice if init is called again', () => {
    Spotter.init({ proxyUrl: '/api/spotter' })
    Spotter.init({ proxyUrl: '/api/spotter' })
    expect(document.querySelectorAll('[data-spotter-root]').length).toBe(1)
  })

  it('calls sendQuery with query + sessionToken + url on form submit', async () => {
    vi.mocked(sendQuery).mockResolvedValue({ type: 'unhandled', query: 'test' })
    Spotter.init({ proxyUrl: '/api/spotter', sessionToken: () => 'tok123' })

    const input = document.querySelector<HTMLInputElement>('[data-spotter-input]')!
    input.value = 'dark mode'
    document.querySelector<HTMLFormElement>('[data-spotter-form]')?.dispatchEvent(new Event('submit'))
    await vi.waitFor(() => expect(sendQuery).toHaveBeenCalled())

    expect(sendQuery).toHaveBeenCalledWith('/api/spotter', expect.objectContaining({
      query: 'dark mode',
      sessionToken: 'tok123',
      url: expect.any(String),
    }))
  })

  it('calls onUnhandled callback for unhandled response', async () => {
    vi.mocked(sendQuery).mockResolvedValue({ type: 'unhandled', query: 'refund policy' })
    const onUnhandled = vi.fn()
    Spotter.init({ proxyUrl: '/api/spotter', onUnhandled })

    const input = document.querySelector<HTMLInputElement>('[data-spotter-input]')!
    input.value = 'refund policy'
    document.querySelector<HTMLFormElement>('[data-spotter-form]')?.dispatchEvent(new Event('submit'))
    await vi.waitFor(() => expect(onUnhandled).toHaveBeenCalledWith('refund policy'))
  })

  it('shows fallback message when no onUnhandled is provided', async () => {
    vi.mocked(sendQuery).mockResolvedValue({ type: 'unhandled', query: 'anything' })
    Spotter.init({ proxyUrl: '/api/spotter' })

    const input = document.querySelector<HTMLInputElement>('[data-spotter-input]')!
    input.value = 'anything'
    document.querySelector<HTMLFormElement>('[data-spotter-form]')?.dispatchEvent(new Event('submit'))
    await vi.waitFor(() =>
      expect(document.querySelector('[data-spotter-messages]')?.textContent).toContain("I can only help")
    )
  })
})

describe('Spotter.destroy', () => {
  it('removes the widget from DOM', () => {
    Spotter.init({ proxyUrl: '/api/spotter' })
    Spotter.destroy()
    expect(document.querySelector('[data-spotter-root]')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test src/widget/index.test.ts
```

Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 3: Create `src/widget/index.ts`**

```typescript
import { createUI } from './ui'
import { NavigatorController } from './navigator'
import { sendQuery } from './client'
import type { SpotterQuery } from '../types'

export interface SpotterInitOptions {
  proxyUrl: string
  sessionToken?: () => string | undefined
  role?: string
  onUnhandled?: (query: string) => void
  spotterKey?: string
}

let ui: ReturnType<typeof createUI> | null = null
let navController: NavigatorController | null = null

export const Spotter = {
  init(options: SpotterInitOptions): void {
    if (ui) return

    ui = createUI()
    navController = new NavigatorController()
    document.body.appendChild(ui.container)

    ui.onSubmit(async (queryText) => {
      const body: SpotterQuery = {
        query: queryText,
        url: window.location.href,
        sessionToken: options.sessionToken?.(),
        role: options.role,
      }

      try {
        const response = await sendQuery(options.proxyUrl, body)

        if (response.type === 'navigate') {
          ui!.showSteps(response.steps)
          if (response.steps[0]) navController!.highlightStep(response.steps[0])
        } else if (response.type === 'answer') {
          ui!.showMessage(response.content)
        } else if (response.type === 'unhandled') {
          if (options.onUnhandled) {
            options.onUnhandled(queryText)
          } else {
            ui!.showMessage("I can only help with navigating this app.")
          }
        } else if (response.type === 'error') {
          ui!.showMessage("Something went wrong. Please try again.")
        }
      } catch {
        ui!.showMessage("Couldn't reach Spotter. Check your connection.")
      }
    })
  },

  destroy(): void {
    navController?.clear()
    ui?.destroy()
    ui = null
    navController = null
  },
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test src/widget/index.test.ts
```

Expected: PASS — 6 tests passing.

- [ ] **Step 5: Run all tests to confirm nothing is broken**

```bash
npm test
```

Expected: PASS — all test files passing.

- [ ] **Step 6: Commit**

```bash
git add src/widget/index.ts src/widget/index.test.ts
git commit -m "feat: add Spotter.init() wiring widget, navigator, and proxy client"
```

---

## Task 10: Entry Points and Build Config

**Files:**
- Modify: `src/index.ts`
- Create: `src/proxy.ts`
- Modify: `tsup.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Update `src/index.ts` to be browser-only**

Replace the full contents of `src/index.ts` with:

```typescript
export { Spotter } from './widget/index'
export type { SpotterInitOptions } from './widget/index'
```

- [ ] **Step 2: Create `src/proxy.ts` as the Node entry point**

```typescript
export { createSpotterProxy } from './proxy/index'
export type { SpotterProxyOptions } from './proxy/index'
export type { SpotterConfig, Route, Action, SpotterQuery, SpotterResponse } from './types'
```

- [ ] **Step 3: Update `tsup.config.ts`**

Replace the full contents of `tsup.config.ts` with:

```typescript
import { defineConfig, Format } from 'tsup'

const sharedConfig = {
  bundle: true,
  minify: false,
  dts: false,
  shims: true,
  skipNodeModulesBundle: false,
  clean: false,
  outExtension({ format }: { format: string }) {
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
])
```

- [ ] **Step 4: Update `package.json` exports**

In `package.json`, update the top-level fields and add `exports`:

```json
{
  "main": "dist/node/proxy.cjs.js",
  "module": "dist/node/proxy.esm.js",
  "browser": "dist/index.iife.js",
  "exports": {
    ".": {
      "browser": "./dist/index.esm.js",
      "import": "./dist/index.esm.js"
    },
    "./proxy": {
      "import": "./dist/node/proxy.esm.js",
      "require": "./dist/node/proxy.cjs.js"
    }
  }
}
```

- [ ] **Step 5: Build and verify output**

```bash
npm run build
```

Expected output (no errors):
```
dist/index.iife.js       — browser widget IIFE
dist/index.esm.js        — browser widget ESM
dist/node/proxy.esm.js   — Node proxy ESM
dist/node/proxy.cjs.js   — Node proxy CJS
```

Verify the IIFE exposes `Spotter`:
```bash
node -e "const s = require('./dist/node/proxy.cjs.js'); console.log(typeof s.createSpotterProxy)"
```
Expected: `function`

- [ ] **Step 6: Run all tests one final time**

```bash
npm test
```

Expected: all tests passing.

- [ ] **Step 7: Commit**

```bash
git add src/index.ts src/proxy.ts tsup.config.ts package.json package-lock.json
git commit -m "build: separate browser and node entry points, update exports map"
```

---

## Done

At this point the Core OSS MVP is complete. An operator can:

1. `npx @spotter/cli crawl` → `spotter.config.json` *(CLI is Phase 2)*
2. `npm install @spotter/proxy` + `app.post('/api/spotter', createSpotterProxy({ config, llm }))`
3. Drop `<script src="...widget.iife.js">` + `Spotter.init({ proxyUrl: '/api/spotter' })`

Navigate-only mode is live. No data leaves the operator's infra. The paid action proxy (Phase 3) is stubbed — the proxy returns `"Action available but not enabled on this plan"` for any matched action intent.

**Phase 2:** `@spotter/cli` — Puppeteer crawl + `spotter diff`
**Phase 3:** MCP manifest caching + tool calling at action tier
