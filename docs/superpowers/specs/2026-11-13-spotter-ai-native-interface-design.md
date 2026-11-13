# Spotter: AI-Native Interface Layer for Legacy Websites

**Date:** 2026-11-13  
**Status:** Draft

---

## Problem

Legacy enterprise websites have complex, hard-to-navigate UIs. Users waste time hunting for features, settings, and data buried deep in menus. Operators can't easily retrofit a modern UX onto existing apps. The goal is a drop-in SDK that converts any legacy website into an AI-native interface — users describe what they want in natural language, the agent either navigates them there or does it for them.

---

## Who This Is For

**Primary persona:** Website operators — companies running legacy internal tools, enterprise apps, or any complex web product. They install Spotter into their own app to improve their users' experience.

**End user:** Customers or employees of that app. They interact with the floating chat widget.

---

## System Components

Five components across two tiers:

| Package | Tier | Responsibility |
|---|---|---|
| `@spotter/widget` | OSS | Drop-in floating chat widget, intent router, navigate + action runtime |
| `@spotter/cli` | OSS | Puppeteer-based local crawl → `spotter.config.json`, `spotter diff` for CI |
| `@spotter/proxy` | OSS | Self-hosted Node server — holds LLM key server-side, executes LLM + navigate actions |
| `spotter.config.json` | OSS | Knowledge map committed to git: routes, selectors, API endpoints, MCP server URLs |
| Spotter Cloud | Paid | Hosted action proxy for API + MCP calls, dashboard, BYOK |

**Core principle:** In the pure OSS path, Spotter is never in the data flow. The widget calls the operator's own proxy, which calls the LLM with the operator's own key. Nothing leaves their infrastructure.

---

## Architecture

```
Browser
  └── @spotter/widget
        ↓ POST /api/spotter
  Operator's backend
  └── @spotter/proxy
        ├── spotter.config.json  (knowledge map)
        ├── LLM API  (key in env var, never in browser)
        └── Navigate instructions → returned to widget → widget does DOM work

              ↕ optional (paid)

  Spotter Cloud
  └── Action proxy
        ├── API calls (with user session token)
        └── MCP calls (with user session token)
```

---

## Query Data Flow

```
User types: "how many points do I have?"
      ↓
Intent Router (server-side, fast LLM call)
  → Is this a UI action/navigation query, or general support?
  → If general: fires onUnhandled(query) → delegates to existing chatbot
      ↓ UI action
Site Map Lookup
  → Does config have an API endpoint or MCP tool for this?
  → Does config have a route to navigate to?
      ↓
  ┌──────────────────────┬─────────────────────┐
  │ API/MCP available    │ Navigate only        │
  │ + paid tier          │ (free tier)          │
  ├──────────────────────┼─────────────────────┤
  │ Call endpoint/MCP    │ Highlight elements,  │
  │ with session token   │ guide user step by   │
  │ → return answer      │ step to destination  │
  └──────────────────────┴─────────────────────┘
```

**Intent router** is server-side (in the proxy). It prevents conflicts with existing chatbots by classifying queries before acting. Operators provide an `onUnhandled` callback to pass unrecognised queries to their existing support widget. If `onUnhandled` is not provided, the widget replies: *"I can only help with navigating this app."*

**MCP flow:** At runtime, the proxy fetches the MCP server manifest, discovers available tools, and the agent selects the right tool. Session token is passed through to the MCP call — the agent acts as the user, so backend permissions are inherited naturally. No permission modeling needed in Spotter.

---

## Crawl Flow

```bash
spotter crawl --url https://app.company.com
```

1. CLI launches Puppeteer in headed (visible) mode
2. Navigates to the app — if login page detected, pauses and prints: `🔐 Complete login in the browser window...`
3. Developer completes SSO / login manually (Google, SAML, etc.)
4. CLI detects successful authentication (URL change + network idle) and resumes automatically
5. Crawls all reachable routes:
   - Records URL patterns and route descriptions
   - Extracts interactive elements + generates stable CSS selectors
   - Watches network traffic → captures API calls made during navigation
   - If `mcpServers` declared in config → fetches manifests, records available tools
6. Writes `spotter.config.json`

**Session cookie shortcut (for CI/CD):**
```bash
spotter crawl --url https://app.company.com --session-cookie "session=abc123"
```
No browser interaction needed. Used in CI with a service account token stored as a secret.

**Multiple roles:**
```bash
spotter crawl --url https://app.com --session-cookie $ADMIN_TOKEN --role admin
spotter crawl --url https://app.com --session-cookie $USER_TOKEN --role user
```
Generates tagged route maps per role. Operator passes the current user's role to `Spotter.init({ role: 'admin' })` — the proxy selects the matching route map at query time.

---

## Config Format

```json
{
  "version": "1",
  "baseUrl": "https://app.company.com",
  "mcpServers": ["https://api.company.com/mcp"],
  "routes": [
    {
      "path": "/settings/appearance",
      "description": "Theme and display settings including dark mode",
      "selectors": {
        "darkModeToggle": "[data-testid='dark-mode-switch']"
      }
    },
    {
      "path": "/rewards",
      "description": "User points balance and rewards history"
    }
  ],
  "actions": [
    {
      "intent": "get user points balance",
      "type": "api",
      "endpoint": "GET /api/user/rewards",
      "auth": "session"
    }
  ]
}
```

Config is committed to git and versioned with the codebase. It is the source of truth for what Spotter knows about the site.

---

## Developer Experience — Installation

**Three steps, no Spotter account required:**

**Step 1 — Crawl:**
```bash
npx @spotter/cli crawl --url https://app.company.com
# headed browser opens, dev logs in, crawl runs automatically
# writes spotter.config.json
```

**Step 2 — Add proxy to backend:**
```bash
npm install @spotter/proxy
```
```js
import { createSpotterProxy } from '@spotter/proxy'

// Express, Next.js API route, or any Node server
app.use('/api/spotter', createSpotterProxy({
  config: './spotter.config.json',
  llm: { provider: 'openai', apiKey: process.env.OPENAI_API_KEY }
}))
```

**Step 3 — Drop in the widget:**
```html
<script src="https://cdn.spotter.dev/widget.js"></script>
<script>
  Spotter.init({
    proxyUrl: '/api/spotter',
    sessionToken: () => getCookie('session'),
    onUnhandled: (query) => existingChatbot?.open(query)
  })
</script>
```

Navigate mode is now live. No Spotter account, no data leaving the operator's infrastructure.

**CI/CD diff (free, two lines):**
```yaml
- run: npx @spotter/cli diff --config spotter.config.json --url $STAGING_URL
  env:
    SPOTTER_SESSION_COOKIE: ${{ secrets.SESSION }}
```
Passes silently if nothing changed. Warns (or fails, operator's choice) if selectors break or routes move.

---

## Free vs Paid

| | Free (OSS) | Paid (Spotter Cloud) |
|---|---|---|
| **Agent capability** | Navigate only — guides user to destination | Actions — calls APIs and MCP tools, returns answers directly |
| **LLM key** | Operator's own key, in their own proxy | BYOK to Spotter dashboard (stored encrypted) or Spotter-managed |
| **Infrastructure** | Operator runs proxy server | Spotter hosts action proxy, zero infra for operator |
| **Multi-site** | One site per config | Multiple sites, team access, dashboard |
| **Dashboard** | None | Site map viewer, query analytics |
| **Data sovereignty** | 100% — nothing leaves operator's infra | Opt-in — operator chooses to route through Spotter |

**Conversion trigger:** The natural PLG moment is when users ask questions the navigate-only agent can't answer directly ("how many points do I have?", "submit this approval for me"). The widget surfaces a CTA: *"I can answer this directly — your admin can enable it."* Actions upgrade converts them.

**CI/CD diff stays free forever** — it's a retention mechanism, not a conversion trigger. Keeps Spotter embedded in the operator's workflow.

---

## Paid Moat

The paid tier's value is infrastructure + capability, not features hidden behind a paywall:

1. **LLM key security at scale** — operators who don't want to maintain their own proxy infra offload it to Spotter. BYOK means they control LLM spend.
2. **Action execution** — API calls and MCP calls require a server-side proxy with access to the user's session token. Spotter provides this. Navigate-only is a qualitatively different product.
3. **Multi-site at team scale** — free tier is one site. Paid tier spans multiple products, environments, teams.

There is no network effect from shared/pre-built site maps. Each operator's config is specific to their app and committed to their own git repo.

---

## Authentication Handling

**During crawl:**
- Interactive headed mode: Puppeteer opens visible browser, developer completes SSO/Google login manually, CLI resumes after detecting successful auth
- Session cookie mode: developer passes cookie directly, no browser interaction (default for CI)
- Fully automated SSO (Puppeteer filling credentials) is explicitly not supported — blocked by OAuth providers

**At runtime (widget):**
- User is already logged in; session token read from browser cookie or passed via `sessionToken` config
- If unauthenticated user opens widget: config includes the login route, agent navigates them there
- Permissions: agent inherits the logged-in user's permissions via their session token. Backend enforces access control. No permission modeling in Spotter.

---

## Open Questions

- **Widget conflict detection:** Should the intent router detect and suppress Spotter's widget if the site already has an identical-looking chatbot in the same viewport position?
- **Config encryption:** Should `spotter.config.json` support encrypting sensitive selector/endpoint data before committing to git, for operators with strict security requirements?
- **Offline/cached MCP manifests:** Should MCP manifests be fetched and cached at crawl time into the config, or always fetched live at runtime?
