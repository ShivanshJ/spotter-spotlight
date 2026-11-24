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
| `selectors` | no | Named CSS selectors discovered by `spotter analyze`. Informational: use them as a reference when writing page actions. They are not clicked during navigation |
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
2. Otherwise: `[link to parent]`, `[link to route]`.

A link step uses selector `a[href="<path>"]`. A parent that is not itself a route in the config is skipped.

## Conformance

The `/conformance` directory holds fixtures every SDK implementation must pass: `config.json` (canonical config), `summary.txt` (expected site-map summary), `routing-prompt.txt` (expected LLM prompt), `navigate-cases.json` (expected steps). The TypeScript and Python SDKs both test against them.

## Compatibility

v1.1 is additive. Configs without `title`, `reachableFrom`, or `actions` remain valid and behave as before.
