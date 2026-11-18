# Spotter Phase 2: CLI Analyzer + LLM Provider Flexibility

**Date:** 2026-11-18
**Status:** Draft

---

## Goal

Eliminate manual `spotter.config.json` authoring. One command scans a JS codebase, extracts routes/selectors/API patterns, generates descriptions via LLM, and writes the config. Also makes the LLM provider configurable across both the CLI and proxy — any OpenAI-compatible endpoint works (OpenAI, OpenRouter, Ollama, etc.).

---

## What This Is Not

The LLM is a commodity classifier. The value is in the static analyzer (framework intelligence), the config format (the knowledge layer), the navigation runtime, and the analytics signal. Adding a new framework is one new file. The LLM can be swapped or self-hosted without touching any other code.

---

## Scope

**In:**
- `spotter analyze` CLI command
- Framework analyzers: Next.js (app + pages router), React Router v6/v7, Vue Router v3/v4
- Plugin architecture — adding a new framework is one file + one line in the registry
- LLM provider config: `baseURL?` + `model?` on both proxy and CLI
- Basic analytics infrastructure in the proxy (`onAnalytics` callback, noop by default)
- README restructured around the 3-step happy path

**Out (future):**
- `spotter diff` for CI/CD
- Actions execution
- MCP in widget
- Analytics dashboard (Spotter Cloud)
- Python SDK

---

## Principles

- SOLID applied functionally: plain TypeScript interfaces, factory functions, no classes
- Single responsibility per file — each file has one job
- Open/closed: new analyzers extend the registry without modifying existing code
- Dependency inversion: orchestrators depend on interfaces, not concrete implementations
- No comments inside functions — names carry meaning

---

## File Structure

```
src/
  cli/
    index.ts            ← bin entry, arg parsing (process.argv only, no framework)
    analyze.ts          ← orchestrates: detect → extract → describe → write
    analyzers/
      types.ts          ← FrameworkAnalyzer interface, DiscoveredRoute type
      registry.ts       ← ordered analyzer list, detectAnalyzer()
      nextjs.ts         ← Next.js app router + pages router
      react-router.ts   ← React Router v6/v7
      vue-router.ts     ← Vue Router v3/v4
    llm-describe.ts     ← batch LLM description generation, graceful noop if no key
    config-writer.ts    ← writes/merges spotter.config.json, preserves manual edits
  proxy/
    llm-client.ts       ← updated: baseURL?, model? — hardcoded gpt-4o-mini removed
    analytics.ts        ← SpotterEvent type, AnalyticsHandler type, noopAnalytics
    index.ts            ← updated: accepts onAnalytics?, emits on every query
```

---

## Interfaces

### FrameworkAnalyzer

```ts
interface FrameworkAnalyzer {
  readonly name: string
  detect(rootDir: string): boolean
  analyze(rootDir: string): Promise<DiscoveredRoute[]>
}
```

Each analyzer is a plain object satisfying this interface — no classes. `detect` is cheap (filesystem checks only). `analyze` does the AST/filesystem work.

### DiscoveredRoute

```ts
type DiscoveredRoute = {
  path: string
  componentFile: string
  pageTitle?: string
  selectors: Record<string, string>
  apiCalls: string[]
}
```

`selectors` captures `data-testid`, `aria-label`, `data-cy` attributes found in the component file. `apiCalls` captures URL patterns from `fetch`/`axios` calls.

### LLMConfig

```ts
type LLMConfig = {
  apiKey: string
  baseURL?: string
  model?: string
}
```

`baseURL` defaults to OpenAI. Set `https://openrouter.ai/api/v1` for OpenRouter. Any OpenAI-compatible endpoint works. `model` defaults to `gpt-4o-mini`.

The `provider` field is removed — it was always redundant.

### Analytics

```ts
type SpotterEvent = {
  type: 'query'
  query: string
  responseType: 'navigate' | 'answer' | 'unhandled' | 'error'
  url: string
  role?: string
}

type AnalyticsHandler = (event: SpotterEvent) => void
```

`createSpotterProxy` accepts an optional `onAnalytics?: AnalyticsHandler`. Default is a noop. Operators pass their own handler. Spotter Cloud later provides a hosted handler.

---

## CLI Flow

```
spotter analyze [rootDir]
```

1. Resolve `rootDir` (defaults to `process.cwd()`)
2. `detectAnalyzer(rootDir)` — iterate registry, return first analyzer where `detect()` is true
3. `analyzer.analyze(rootDir)` — returns `DiscoveredRoute[]`
4. `describeRoutes(routes, llmConfig)` — batch LLM call generates descriptions. If `OPENAI_API_KEY` is not set, skips and leaves descriptions as the path segment (e.g. `"settings appearance"`). Prints one line: `tip: set OPENAI_API_KEY for richer route descriptions`
5. `writeConfig(routes, outputPath)` — merges with existing `spotter.config.json` if present. Existing descriptions are never overwritten (preserves manual edits).
6. Prints summary: routes found, selectors extracted, API patterns detected

### Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `OPENAI_API_KEY` | LLM key for description generation | — (skips LLM if unset) |
| `SPOTTER_LLM_BASE_URL` | Override LLM endpoint | OpenAI |
| `SPOTTER_LLM_MODEL` | Override model | `gpt-4o-mini` |

---

## Framework Analyzers

### Next.js

**Detection:** `next.config.js` or `next.config.ts` or `next.config.mjs` exists in `rootDir`.

**App router:** Walk `app/` directory. Each `page.tsx` / `page.jsx` is a route. Path derived from directory structure (`app/settings/appearance/page.tsx` → `/settings/appearance`). Extract `<title>` / `metadata.title` from the file. Scan JSX for `data-testid`, `aria-label`, `data-cy`. Scan for `fetch`/`axios` calls.

**Pages router:** Walk `pages/` directory. Each `.tsx`/`.jsx` file (excluding `_app`, `_document`, `api/`) is a route. Same selector and API extraction.

### React Router

**Detection:** `react-router` or `react-router-dom` in `package.json` dependencies.

**Analysis:** Find the router config file (scan for files importing from `react-router`). Parse `<Route path="...">` JSX and `createBrowserRouter([{ path: "..." }])` patterns. For each route, resolve the component file and run selector + API extraction.

### Vue Router

**Detection:** `vue-router` in `package.json` dependencies.

**Analysis:** Find the router config file (scan for files importing from `vue-router`). Parse `routes` array: `{ path: string, component: ... }` entries. Resolve each component file and run selector + API extraction.

---

## Proxy Updates

`createSpotterProxy` options change:

```ts
interface SpotterProxyOptions {
  config: string | SpotterConfig
  llm: LLMConfig           // was: { provider: 'openai'; apiKey: string }
  onAnalytics?: AnalyticsHandler
}
```

`llm-client.ts` passes `baseURL` and `model` through to the OpenAI SDK. `routeQuery` no longer hardcodes `gpt-4o-mini` — uses `config.model ?? 'gpt-4o-mini'`.

---

## README Structure

```
# spotter-sdk

[one-line pitch]

## How it works
[architecture diagram: browser → your server → LLM]

## Quick start
  Step 1: analyze your codebase
    npx spotter-sdk analyze
  Step 2: mount the proxy (3 lines)
  Step 3: add the script tag

## LLM providers
  OpenAI (default), OpenRouter, any compatible endpoint

## Analytics
  onAnalytics hook example

## Self-hosting
  .env + server.mjs example

## Config reference
## Spotter.init options
## Security
## Development
```

---

## Testing

- `src/cli/analyzers/*.ts` — unit tests per analyzer with fixture directories (minimal Next.js app structure, React Router app, Vue Router app)
- `src/cli/config-writer.ts` — test merge behaviour: new routes added, existing descriptions preserved
- `src/cli/llm-describe.ts` — test graceful noop when `OPENAI_API_KEY` unset
- `src/proxy/analytics.ts` — test that `onAnalytics` fires with correct event shape on each response type
- `src/proxy/llm-client.ts` — test `baseURL` and `model` are passed through correctly
