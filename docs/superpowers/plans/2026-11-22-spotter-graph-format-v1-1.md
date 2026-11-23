# Spotter Graph Format v1.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `spotter.config.json` so routes carry page-level actions and a navigation graph, and make the format language-neutral by adding shared conformance fixtures that every SDK implementation (TypeScript now, Python next) must pass.

**Architecture:** Additive, backwards-compatible change. `Route` gains optional `title`, `reachableFrom`, and `actions` (page actions: `name`, `description`, `selector`). `version` stays `"1"`; old configs parse unchanged. The proxy summary shown to the LLM includes page actions and reachability; the LLM can answer with an optional `actionName`; a pure `buildNavigateSteps` turns route + action + parent into ordered steps. Shared fixtures in `/conformance` pin the summary text, routing prompt, and navigate steps so the TS and Python SDKs cannot drift.

**Tech Stack:** TypeScript, zod, vitest (all already configured).

**Principles:** one responsibility per file, plain functions, no comments inside functions, no classes.

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/types.ts` | Modify | `PageActionSchema`; new optional `Route` fields |
| `src/types.test.ts` | Modify | Schema tests for new fields |
| `conformance/config.json` | Create | Canonical example config shared by all SDKs |
| `conformance/summary.txt` | Create | Expected `summarizeConfig` output for the canonical config |
| `conformance/navigate-cases.json` | Create | Expected navigate steps per (route, action) |
| `conformance/routing-prompt.txt` | Create | Expected full LLM routing prompt for the canonical config |
| `src/test-helpers/conformance.ts` | Create | Test-only loaders for conformance fixtures |
| `src/proxy/site-map.ts` | Modify | `summarizeConfig` includes reachability + page actions |
| `src/proxy/site-map.test.ts` | Modify | Add conformance summary test |
| `src/proxy/navigate-steps.ts` | Create | `buildNavigateSteps(config, route, actionName?)` |
| `src/proxy/navigate-steps.test.ts` | Create | Conformance + edge-case tests |
| `src/proxy/llm-client.ts` | Modify | `buildRoutingPrompt`; `actionName?` on navigate result |
| `src/proxy/llm-client.test.ts` | Modify | actionName pass-through test |
| `src/proxy/routing-prompt.conformance.test.ts` | Create | Prompt matches conformance fixture |
| `src/proxy/index.ts` | Modify | Use `buildNavigateSteps` |
| `src/proxy/index.test.ts` | Modify | Page-action navigate test |
| `src/cli/reachability.ts` | Create | `deriveReachableFrom(paths)` |
| `src/cli/reachability.test.ts` | Create | Tests |
| `src/cli/config-writer.ts` | Modify | Write `title`, derived `reachableFrom`; preserve manual `actions` |
| `src/cli/config-writer.test.ts` | Modify | Tests for new merge behaviour |
| `docs/graph-format.md` | Create | Format reference |
| `README.md` | Modify | Config reference updated |

---

### Task 1: Schema — page actions, title, reachableFrom

**Files:**
- Modify: `src/types.ts`
- Modify: `src/types.test.ts`

- [ ] **Step 1: Write failing tests**

Append to the end of `src/types.test.ts`:

```ts
describe('Route v1.1 fields', () => {
  const base = { version: '1', baseUrl: 'https://app.com', actions: [], mcpServers: [] }

  it('parses a route with title, reachableFrom and page actions', () => {
    const config = SpotterConfigSchema.parse({
      ...base,
      routes: [
        {
          path: '/settings/billing',
          description: 'Manage subscription',
          title: 'Billing',
          reachableFrom: ['/settings'],
          actions: [
            { name: 'change_plan', description: 'Change subscription plan', selector: '[data-testid="change-plan"]' },
          ],
        },
      ],
    })
    expect(config.routes[0].title).toBe('Billing')
    expect(config.routes[0].reachableFrom).toEqual(['/settings'])
    expect(config.routes[0].actions?.[0].name).toBe('change_plan')
  })

  it('still parses a v1.0 route without the new fields', () => {
    const config = SpotterConfigSchema.parse({
      ...base,
      routes: [{ path: '/rewards', description: 'Points' }],
    })
    expect(config.routes[0].actions).toBeUndefined()
    expect(config.routes[0].reachableFrom).toBeUndefined()
    expect(config.routes[0].selectors).toEqual({})
  })

  it('rejects a page action missing its selector', () => {
    expect(() =>
      SpotterConfigSchema.parse({
        ...base,
        routes: [{ path: '/x', description: 'X', actions: [{ name: 'a', description: 'A' }] }],
      })
    ).toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/types.test.ts`
Expected: FAIL — the first new test fails (unknown keys stripped, `title` is `undefined`); third test fails (no error thrown).

- [ ] **Step 3: Update `src/types.ts`**

Replace the `RouteSchema` block with:

```ts
export const PageActionSchema = z.object({
  name: z.string(),
  description: z.string(),
  selector: z.string(),
})

export const RouteSchema = z.object({
  path: z.string(),
  description: z.string(),
  title: z.string().optional(),
  reachableFrom: z.array(z.string()).optional(),
  actions: z.array(PageActionSchema).optional(),
  selectors: z.record(z.string()).default({}),
  role: z.string().optional(),
})
```

And add below the existing `Route` type export:

```ts
export type PageAction = z.infer<typeof PageActionSchema>
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/types.test.ts
git commit -m "feat: add page actions, title and reachableFrom to Route schema"
```

---

### Task 2: Conformance config + richer summarizeConfig

**Files:**
- Create: `conformance/config.json`
- Create: `conformance/summary.txt`
- Create: `src/test-helpers/conformance.ts`
- Modify: `src/proxy/site-map.ts`
- Modify: `src/proxy/site-map.test.ts`

- [ ] **Step 1: Create `conformance/config.json`**

```json
{
  "version": "1",
  "baseUrl": "https://app.example.com",
  "routes": [
    {
      "path": "/settings",
      "description": "Account settings hub",
      "selectors": {}
    },
    {
      "path": "/settings/billing",
      "description": "Manage subscription and payment",
      "title": "Billing",
      "reachableFrom": ["/settings"],
      "selectors": {},
      "actions": [
        {
          "name": "change_plan",
          "description": "Upgrade or downgrade subscription plan",
          "selector": "[data-testid=\"change-plan\"]"
        },
        {
          "name": "download_invoice",
          "description": "Download an invoice PDF",
          "selector": "[aria-label=\"Download invoice\"]"
        }
      ]
    },
    {
      "path": "/rewards",
      "description": "Points balance and rewards history",
      "selectors": {}
    },
    {
      "path": "/settings/appearance",
      "description": "Theme and display preferences",
      "selectors": { "themeToggle": "[data-testid=\"theme-toggle\"]" }
    }
  ],
  "actions": [
    {
      "intent": "get user points balance",
      "type": "api",
      "endpoint": "GET /api/user/rewards",
      "auth": "session"
    }
  ],
  "mcpServers": []
}
```

- [ ] **Step 2: Create `conformance/summary.txt`**

Exact content (the two indented `action` lines use 6 spaces):

```
Routes:
  - /settings: "Account settings hub"
  - /settings/billing: "Manage subscription and payment" [reachable from: /settings]
      action change_plan: Upgrade or downgrade subscription plan
      action download_invoice: Download an invoice PDF
  - /rewards: "Points balance and rewards history"
  - /settings/appearance: "Theme and display preferences"

Actions:
  - "get user points balance" → GET /api/user/rewards
```

- [ ] **Step 3: Create `src/test-helpers/conformance.ts`**

```ts
import fs from 'fs'
import { fileURLToPath } from 'url'
import { SpotterConfigSchema } from '../types'
import type { SpotterConfig } from '../types'

const conformanceDir = fileURLToPath(new URL('../../conformance/', import.meta.url))

export function readConformanceText(name: string): string {
  return fs.readFileSync(conformanceDir + name, 'utf-8').trim()
}

export function readConformanceJson<T>(name: string): T {
  return JSON.parse(readConformanceText(name)) as T
}

export function loadConformanceConfig(): SpotterConfig {
  return SpotterConfigSchema.parse(readConformanceJson('config.json'))
}
```

- [ ] **Step 4: Write the failing test**

In `src/proxy/site-map.test.ts` add to the imports:

```ts
import { loadConformanceConfig, readConformanceText } from '../test-helpers/conformance'
```

and append at the end of the file:

```ts
describe('summarizeConfig conformance', () => {
  it('matches the shared conformance summary', () => {
    expect(summarizeConfig(loadConformanceConfig())).toBe(readConformanceText('summary.txt'))
  })

  it('appends role after reachability', () => {
    const summary = summarizeConfig({
      ...config,
      routes: [{ path: '/admin/users', description: 'Users', selectors: {}, reachableFrom: ['/admin'], role: 'admin' }],
    })
    expect(summary).toContain('"Users" [reachable from: /admin] [role: admin]')
  })
})
```

- [ ] **Step 5: Run to verify failure**

Run: `npx vitest run src/proxy/site-map.test.ts`
Expected: FAIL — conformance summary mismatch (no reachability/page actions in output).

- [ ] **Step 6: Update `summarizeConfig` in `src/proxy/site-map.ts`**

Replace the `summarizeConfig` function with:

```ts
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
```

- [ ] **Step 7: Run all tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add conformance src/test-helpers src/proxy/site-map.ts src/proxy/site-map.test.ts
git commit -m "feat: include page actions and reachability in config summary, add conformance fixtures"
```

---

### Task 3: buildNavigateSteps

**Files:**
- Create: `conformance/navigate-cases.json`
- Create: `src/proxy/navigate-steps.ts`
- Create: `src/proxy/navigate-steps.test.ts`

- [ ] **Step 1: Create `conformance/navigate-cases.json`**

```json
[
  {
    "name": "page action with parent",
    "routePath": "/settings/billing",
    "actionName": "change_plan",
    "expectedSteps": [
      { "selector": "a[href=\"/settings\"]", "description": "Navigate to /settings — Account settings hub", "interactionType": "click" },
      { "selector": "a[href=\"/settings/billing\"]", "description": "Navigate to /settings/billing — Manage subscription and payment", "interactionType": "click" },
      { "selector": "[data-testid=\"change-plan\"]", "description": "Upgrade or downgrade subscription plan", "interactionType": "click" }
    ]
  },
  {
    "name": "route with parent and no selectors",
    "routePath": "/settings/billing",
    "expectedSteps": [
      { "selector": "a[href=\"/settings\"]", "description": "Navigate to /settings — Account settings hub", "interactionType": "click" },
      { "selector": "a[href=\"/settings/billing\"]", "description": "Navigate to /settings/billing — Manage subscription and payment", "interactionType": "click" }
    ]
  },
  {
    "name": "route with legacy selectors",
    "routePath": "/settings/appearance",
    "expectedSteps": [
      { "selector": "[data-testid=\"theme-toggle\"]", "description": "Theme and display preferences — themeToggle", "interactionType": "click" }
    ]
  },
  {
    "name": "plain route",
    "routePath": "/rewards",
    "expectedSteps": [
      { "selector": "a[href=\"/rewards\"]", "description": "Navigate to /rewards — Points balance and rewards history", "interactionType": "click" }
    ]
  },
  {
    "name": "unknown action name falls back to plain route",
    "routePath": "/rewards",
    "actionName": "does_not_exist",
    "expectedSteps": [
      { "selector": "a[href=\"/rewards\"]", "description": "Navigate to /rewards — Points balance and rewards history", "interactionType": "click" }
    ]
  }
]
```

- [ ] **Step 2: Write the failing test `src/proxy/navigate-steps.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { buildNavigateSteps } from './navigate-steps'
import { findRouteByPath } from './site-map'
import { loadConformanceConfig, readConformanceJson } from '../test-helpers/conformance'
import type { NavigateStep } from '../types'

type ConformanceCase = {
  name: string
  routePath: string
  actionName?: string
  expectedSteps: NavigateStep[]
}

const config = loadConformanceConfig()
const cases = readConformanceJson<ConformanceCase[]>('navigate-cases.json')

describe('buildNavigateSteps conformance', () => {
  it.each(cases)('$name', ({ routePath, actionName, expectedSteps }) => {
    const route = findRouteByPath(config, routePath)!
    expect(buildNavigateSteps(config, route, actionName)).toEqual(expectedSteps)
  })
})

describe('buildNavigateSteps edge cases', () => {
  it('skips the parent step when the parent route is not in the config', () => {
    const route = { path: '/a/b', description: 'B', selectors: {}, reachableFrom: ['/missing'] }
    const steps = buildNavigateSteps({ ...config, routes: [route] }, route)
    expect(steps).toHaveLength(1)
    expect(steps[0].selector).toBe('a[href="/a/b"]')
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/proxy/navigate-steps.test.ts`
Expected: FAIL — cannot resolve `./navigate-steps`.

- [ ] **Step 4: Create `src/proxy/navigate-steps.ts`**

```ts
import { findRouteByPath } from './site-map'
import type { SpotterConfig, Route, NavigateStep } from '../types'

function linkStep(route: Route): NavigateStep {
  return {
    selector: `a[href="${route.path}"]`,
    description: `Navigate to ${route.path} — ${route.description}`,
    interactionType: 'click',
  }
}

function selectorSteps(route: Route): NavigateStep[] {
  return Object.entries(route.selectors).map(([key, selector]) => ({
    selector,
    description: `${route.description} — ${key}`,
    interactionType: 'click',
  }))
}

function parentSteps(config: SpotterConfig, route: Route): NavigateStep[] {
  const parent = (route.reachableFrom ?? [])
    .map((path) => findRouteByPath(config, path))
    .find((candidate): candidate is Route => candidate !== undefined)
  return parent ? [linkStep(parent)] : []
}

export function buildNavigateSteps(
  config: SpotterConfig,
  route: Route,
  actionName?: string
): NavigateStep[] {
  const pageAction = route.actions?.find((a) => a.name === actionName)
  if (pageAction) {
    return [
      ...parentSteps(config, route),
      linkStep(route),
      { selector: pageAction.selector, description: pageAction.description, interactionType: 'click' },
    ]
  }

  const legacySteps = selectorSteps(route)
  if (legacySteps.length > 0) return legacySteps

  return [...parentSteps(config, route), linkStep(route)]
}
```

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add conformance/navigate-cases.json src/proxy/navigate-steps.ts src/proxy/navigate-steps.test.ts
git commit -m "feat: add buildNavigateSteps with parent and page-action steps"
```

---

### Task 4: Routing prompt + actionName in LLM result

**Files:**
- Create: `conformance/routing-prompt.txt`
- Modify: `src/proxy/llm-client.ts`
- Modify: `src/proxy/llm-client.test.ts`
- Create: `src/proxy/routing-prompt.conformance.test.ts`

- [ ] **Step 1: Create `conformance/routing-prompt.txt`**

```
You are a navigation classifier for a web application.
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
Routes:
  - /settings: "Account settings hub"
  - /settings/billing: "Manage subscription and payment" [reachable from: /settings]
      action change_plan: Upgrade or downgrade subscription plan
      action download_invoice: Download an invoice PDF
  - /rewards: "Points balance and rewards history"
  - /settings/appearance: "Theme and display preferences"

Actions:
  - "get user points balance" → GET /api/user/rewards
```

- [ ] **Step 2: Write failing tests**

Create `src/proxy/routing-prompt.conformance.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildRoutingPrompt } from './llm-client'
import { summarizeConfig } from './site-map'
import { loadConformanceConfig, readConformanceText } from '../test-helpers/conformance'

describe('buildRoutingPrompt conformance', () => {
  it('matches the shared conformance prompt', () => {
    const prompt = buildRoutingPrompt(summarizeConfig(loadConformanceConfig()))
    expect(prompt).toBe(readConformanceText('routing-prompt.txt'))
  })
})
```

Add inside `describe('routeQuery')` in `src/proxy/llm-client.test.ts`:

```ts
  it('passes actionName through on a navigate result', async () => {
    const client = makeMockClient({ type: 'navigate', routePath: '/settings/billing', actionName: 'change_plan' })
    const result = await routeQuery(client as any, 'change my plan', 'Routes:\n  (none)')
    expect(result).toEqual({ type: 'navigate', routePath: '/settings/billing', actionName: 'change_plan' })
  })

  it('sends the routing prompt as the system message', async () => {
    const client = makeMockClient({ type: 'general' })
    await routeQuery(client as any, 'q', 'Routes:\n  (none)')
    const call = client.chat.completions.create.mock.calls[0][0]
    expect(call.messages[0].content).toContain('Site map:\nRoutes:\n  (none)')
    expect(call.messages[0].content).toContain('actionName')
  })
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/proxy/`
Expected: FAIL — `buildRoutingPrompt` is not exported; the system-prompt test fails on `actionName`.

- [ ] **Step 4: Update `src/proxy/llm-client.ts`**

Change the `RouteResult` navigate member:

```ts
export type RouteResult =
  | { type: 'navigate'; routePath: string; actionName?: string }
  | { type: 'action'; actionIntent: string }
  | { type: 'general' }
```

Add above `createLLMClient`:

```ts
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
```

In `routeQuery`, replace the whole system message `content` template literal with `content: buildRoutingPrompt(siteMapSummary),`.

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add conformance/routing-prompt.txt src/proxy/llm-client.ts src/proxy/llm-client.test.ts src/proxy/routing-prompt.conformance.test.ts
git commit -m "feat: let routing LLM return an optional page actionName; export buildRoutingPrompt"
```

---

### Task 5: Wire buildNavigateSteps into the proxy

**Files:**
- Modify: `src/proxy/index.ts`
- Modify: `src/proxy/index.test.ts`

- [ ] **Step 1: Write the failing test**

Add inside `describe('createSpotterProxy')` in `src/proxy/index.test.ts`:

```ts
  it('returns parent, route and page-action steps when the LLM picks a page action', async () => {
    const config: SpotterConfig = {
      ...mockConfig,
      routes: [
        { path: '/settings', description: 'Settings hub', selectors: {} },
        {
          path: '/settings/billing',
          description: 'Billing',
          selectors: {},
          reachableFrom: ['/settings'],
          actions: [{ name: 'change_plan', description: 'Change plan', selector: '[data-testid="change-plan"]' }],
        },
      ],
    }
    vi.mocked(routeQuery).mockResolvedValue({
      type: 'navigate',
      routePath: '/settings/billing',
      actionName: 'change_plan',
    })
    const handler = createSpotterProxy({ config, llm: { apiKey: 'test' } })
    const { req, res, jsonFn } = makeReqRes({ query: 'change my plan', url: 'https://app.com/home' })
    await handler(req, res)
    const response = jsonFn.mock.calls[0][0]
    expect(response.steps.map((s: { selector: string }) => s.selector)).toEqual([
      'a[href="/settings"]',
      'a[href="/settings/billing"]',
      '[data-testid="change-plan"]',
    ])
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/proxy/index.test.ts`
Expected: FAIL — steps do not include the parent or page action.

- [ ] **Step 3: Update `src/proxy/index.ts`**

Add import: `import { buildNavigateSteps } from './navigate-steps'`. Change the `NavigateStep` import line to `import type { SpotterConfig, SpotterQuery, SpotterResponse } from '../types'`.

Replace the `if (result.type === 'navigate') { ... }` block's body with:

```ts
      if (result.type === 'navigate') {
        const route = findRouteByPath(config, result.routePath)
        response = route
          ? { type: 'navigate', steps: buildNavigateSteps(config, route, result.actionName) }
          : { type: 'unhandled', query }
      } else if (result.type === 'action') {
```

(keep the existing `action` and `else` branches and everything after them unchanged).

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all pass (existing proxy tests included).

- [ ] **Step 5: Commit**

```bash
git add src/proxy/index.ts src/proxy/index.test.ts
git commit -m "feat: proxy builds navigate steps from page actions and navigation graph"
```

---

### Task 6: CLI emits reachability + preserves manual page actions

**Files:**
- Create: `src/cli/reachability.ts`
- Create: `src/cli/reachability.test.ts`
- Modify: `src/cli/config-writer.ts`
- Modify: `src/cli/config-writer.test.ts`

- [ ] **Step 1: Write failing reachability tests**

Create `src/cli/reachability.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { deriveReachableFrom } from './reachability'

describe('deriveReachableFrom', () => {
  it('maps a route to its nearest ancestor that exists as a route', () => {
    const result = deriveReachableFrom(['/settings', '/settings/billing', '/settings/billing/history'])
    expect(result.get('/settings/billing')).toEqual(['/settings'])
    expect(result.get('/settings/billing/history')).toEqual(['/settings/billing'])
  })

  it('skips missing intermediate ancestors', () => {
    const result = deriveReachableFrom(['/settings', '/settings/team/members'])
    expect(result.get('/settings/team/members')).toEqual(['/settings'])
  })

  it('gives top-level routes and the root no parent', () => {
    const result = deriveReachableFrom(['/', '/settings', '/rewards'])
    expect(result.has('/')).toBe(false)
    expect(result.has('/settings')).toBe(false)
    expect(result.has('/rewards')).toBe(false)
  })

  it('gives routes with no existing ancestor no parent', () => {
    const result = deriveReachableFrom(['/billing/invoices'])
    expect(result.has('/billing/invoices')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/cli/reachability.test.ts`
Expected: FAIL — cannot resolve `./reachability`.

- [ ] **Step 3: Create `src/cli/reachability.ts`**

```ts
function ancestorPaths(routePath: string): string[] {
  const segments = routePath.split('/').filter(Boolean)
  return segments
    .slice(0, -1)
    .map((_, index) => '/' + segments.slice(0, segments.length - 1 - index).join('/'))
}

export function deriveReachableFrom(paths: string[]): Map<string, string[]> {
  const known = new Set(paths)
  const reachable = new Map<string, string[]>()
  for (const routePath of paths) {
    const parent = ancestorPaths(routePath).find((ancestor) => known.has(ancestor))
    if (parent) reachable.set(routePath, [parent])
  }
  return reachable
}
```

(`ancestorPaths('/a/b/c')` yields `['/a/b', '/a']`, nearest first.)

- [ ] **Step 4: Run reachability tests**

Run: `npx vitest run src/cli/reachability.test.ts`
Expected: PASS.

- [ ] **Step 5: Write failing config-writer tests**

Append inside `describe('writeConfig')` in `src/cli/config-writer.test.ts`:

```ts
  it('derives reachableFrom from existing ancestor routes', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    const nested: RouteWithDescription[] = [
      { path: '/settings', componentFile: 's.tsx', selectors: {}, apiCalls: [], description: 'Settings' },
      { path: '/settings/billing', componentFile: 'b.tsx', selectors: {}, apiCalls: [], description: 'Billing' },
    ]
    await writeConfig(nested, { outputPath, baseUrl: 'https://app.example.com' })

    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.routes[0]).not.toHaveProperty('reachableFrom')
    expect(content.routes[1].reachableFrom).toEqual(['/settings'])
  })

  it('writes title from the discovered page title', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    const titled: RouteWithDescription[] = [
      { path: '/billing', componentFile: 'b.tsx', selectors: {}, apiCalls: [], pageTitle: 'Billing', description: 'Billing' },
    ]
    await writeConfig(titled, { outputPath, baseUrl: 'https://app.example.com' })

    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.routes[0].title).toBe('Billing')
  })

  it('preserves manually authored page actions and reachableFrom on merge', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    await writeConfig(routes, { outputPath, baseUrl: 'https://app.example.com' })

    const existing = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    existing.routes[1].actions = [{ name: 'toggle_theme', description: 'Toggle dark mode', selector: '[data-testid="x"]' }]
    existing.routes[1].reachableFrom = ['/custom-parent']
    await fsp.writeFile(outputPath, JSON.stringify(existing, null, 2))

    await writeConfig(routes, { outputPath, baseUrl: 'https://app.example.com' })

    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.routes[1].actions[0].name).toBe('toggle_theme')
    expect(content.routes[1].reachableFrom).toEqual(['/custom-parent'])
  })

  it('omits actions when none exist', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    await writeConfig(routes, { outputPath, baseUrl: 'https://app.example.com' })
    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.routes[0]).not.toHaveProperty('actions')
  })
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run src/cli/config-writer.test.ts`
Expected: FAIL on the first three new tests.

- [ ] **Step 7: Update `src/cli/config-writer.ts`**

Add import: `import { deriveReachableFrom } from './reachability'`.

Replace the `priorByPath` / `mergedRoutes` section with:

```ts
  const priorByPath = new Map(prior?.routes.map(r => [r.path, r]) ?? [])
  const derivedReachableFrom = deriveReachableFrom(routes.map(r => r.path))

  const mergedRoutes = routes.map(r => {
    const existing = priorByPath.get(r.path)
    return {
      path: r.path,
      description: existing?.description || r.description,
      title: existing?.title ?? r.pageTitle,
      reachableFrom: existing?.reachableFrom ?? derivedReachableFrom.get(r.path),
      actions: existing?.actions,
      selectors: r.selectors,
    }
  })
```

- [ ] **Step 8: Run all tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/cli/reachability.ts src/cli/reachability.test.ts src/cli/config-writer.ts src/cli/config-writer.test.ts
git commit -m "feat: analyzer emits title and derived reachableFrom, preserves manual page actions"
```

---

### Task 7: Format documentation

**Files:**
- Create: `docs/graph-format.md`
- Modify: `README.md`

- [ ] **Step 1: Create `docs/graph-format.md`**

````md
# Spotter Application Graph Format (v1.1)

`spotter.config.json` is the application graph: what pages exist, how they connect, and what a user can do on them. It is produced by `spotter analyze`, edited by humans, and consumed by every Spotter SDK.

```json
{
  "version": "1",
  "baseUrl": "https://app.example.com",
  "routes": [
    {
      "path": "/settings/billing",
      "description": "Manage subscription and payment",
      "title": "Billing",
      "reachableFrom": ["/settings"],
      "selectors": {},
      "actions": [
        { "name": "change_plan", "description": "Upgrade or downgrade subscription plan", "selector": "[data-testid=\"change-plan\"]" }
      ]
    }
  ],
  "actions": [],
  "mcpServers": []
}
```

## Route

| Field | Required | Meaning |
|---|---|---|
| `path` | yes | URL path of the page |
| `description` | yes | Plain-language description; what the LLM matches user queries against |
| `title` | no | Human page name |
| `reachableFrom` | no | Paths of pages the user passes through to reach this one (navigation graph) |
| `actions` | no | Page actions: things a user can do on this page |
| `selectors` | no | Named CSS selectors (v1.0 compatibility; walked in order when no page action is chosen) |
| `role` | no | Restrict to users with this role |

## Page action

| Field | Meaning |
|---|---|
| `name` | Stable snake_case identifier, e.g. `change_plan` |
| `description` | Plain-language description for LLM matching |
| `selector` | CSS selector of the element to interact with |

## Top-level `actions`

Cross-page API actions (`intent`, `type: "api"`, `endpoint`, `auth`, optional `role`). Unchanged from v1.0.

## Navigation step resolution

Given a chosen route and optional page action name:

1. Page action found: `[link to first resolvable reachableFrom parent]`, `[link to route]`, `[click action selector]`.
2. No page action, route has `selectors`: one click step per selector (v1.0 behaviour).
3. Otherwise: `[link to parent]`, `[link to route]`.

A link step uses selector `a[href="<path>"]`. A parent that is not itself a route in the config is skipped.

## Conformance

The `/conformance` directory holds fixtures every SDK implementation must pass: `config.json` (canonical config), `summary.txt` (expected site-map summary), `routing-prompt.txt` (expected LLM prompt), `navigate-cases.json` (expected steps). The TypeScript and Python SDKs both test against them.

## Compatibility

v1.1 is additive. Configs without `title`, `reachableFrom`, or `actions` remain valid and behave as before.
````

- [ ] **Step 2: Update `README.md` config reference**

In the `## Config reference` section's `Route` type block, replace it with:

```ts
type Route = {
  path: string
  description: string        // matched against user queries
  title?: string             // human page name
  reachableFrom?: string[]   // navigation graph: parent paths
  actions?: PageAction[]     // what a user can do on this page
  selectors?: Record<string, string>
  role?: string
}

type PageAction = {
  name: string               // e.g. "change_plan"
  description: string        // for LLM matching
  selector: string           // element to interact with
}
```

and add one line directly under the section's intro sentence: `The full format is documented in [docs/graph-format.md](docs/graph-format.md).`

- [ ] **Step 3: Run all tests and build**

Run: `npm test && npm run build`
Expected: all tests pass; build succeeds.

- [ ] **Step 4: Smoke-test the CLI**

Run: `node dist/cli/cli.js analyze --root src/cli/analyzers/__fixtures__/nextjs --output /tmp/spotter-v11.json && cat /tmp/spotter-v11.json`
Expected: `/settings/appearance` has no parent (no `/settings` route in the fixture), output is valid JSON with `version: "1"`.

- [ ] **Step 5: Commit**

```bash
git add docs/graph-format.md README.md
git commit -m "docs: document graph format v1.1 and conformance fixtures"
```
