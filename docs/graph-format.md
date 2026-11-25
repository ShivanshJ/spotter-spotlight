# Spotter Application Graph Format (v1.2)

`spotter.config.json` is the application graph: what pages exist, how they connect, and what a user can do on them. It is produced by `spotter-sdk analyze`, edited by humans, and consumed by every Spotter SDK.

`analyze` keeps edits on re-runs. A route whose `description` is still the generated placeholder is treated as unreviewed and refreshed. Once it has a real description, its `title`, `navigable`, `note`, `reachableFrom` and `actions` are kept. `"navigable": true` is always kept. `selectors` are rewritten from the latest scan.

```json
{
  "version": "1",
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
| `selectors` | no | Named CSS selectors discovered by `spotter analyze`. Informational: use them as a reference when writing page actions. They are not clicked during navigation |
| `role` | no | Restrict to users with this role |
| `navigable` | no | `false` hides the route: it is left out of the site map the LLM sees and can't be navigated to. Used for paywalls, loading screens, API and resource routes, and dynamic routes. Default `true` |
| `note` | no | Why a route is hidden. Informational |

## Page action

| Field | Meaning |
|---|---|
| `name` | Stable snake_case identifier, e.g. `change_plan` |
| `description` | Plain-language description for LLM matching |
| `selector` | Element to interact with: a CSS selector, or `role=<role>[name="<accessible name>"]` |

### Selectors

A selector is either CSS (`[data-testid="change-plan"]`, `#save`) or a role selector: `role=button[name="Change plan"]`. A role selector matches elements with that ARIA role, implicit (`<button>` is a button) or explicit (`role="button"`), whose accessible name (`aria-label`, `aria-labelledby`, else text content) equals the name, ignoring case and extra whitespace. If no name matches exactly, an element whose name starts with it, then one that contains it, is used. Supported roles: `button`, `link`, `menuitem`, `tab`, `checkbox`, `switch`, and any other explicit `role` attribute.

## Top-level `actions`

Cross-page API actions (`intent`, `type: "api"`, `endpoint`, `auth`, optional `role`). Unchanged from v1.0.

## Navigation step resolution

Given a chosen route and optional page action name:

1. Page action found: `[link to first resolvable reachableFrom parent]`, `[link to route]`, `[click action selector]`.
2. Otherwise: `[link to parent]`, `[link to route]`.

A link step uses selector `a[href="<path>"]`. A parent that is not itself a route in the config is skipped.

## Conformance

The `/conformance` directory holds fixtures every SDK implementation must pass: `config.json` (canonical config), `summary.txt` (expected site-map summary), `routing-prompt.txt` (expected LLM prompt), `navigate-cases.json` (expected steps). The TypeScript and Python SDKs both test against them.

## Compatibility

v1.1 and v1.2 are additive. Configs without `title`, `reachableFrom`, `actions` or `navigable` remain valid and behave as before. v1.2 added `navigable`, `note` and role selectors.
