# Roadmap

**Positioning:** add an AI agent to your SaaS in 5 minutes. Spotter reads your code to build an open application graph (`spotter.config.json`). An in-app agent uses it to take users to the right page and the right control.

**Business split:**

- **Open source core:** the `analyze` CLI, the graph format, the widget, navigation, page actions, the Node and Python endpoints, and bring-your-own model.
- **Spotter Cloud (paid, later):** managed inference and action execution, analytics and improvement loops, enterprise controls. It is billed on tasks or actions, not seats.

**Adoption loop:** `npx spotter-sdk analyze` → `npx spotter-sdk dev` (try it on your own app, no code changes) → add the endpoint and widget → (later) deploy to Spotter Cloud.

## Done

- Endpoints (Node, Python/FastAPI), widget, flow runner (multi-step, guided and auto modes, survives page loads), analytics hook, shared conformance fixtures, CI.
- `analyze`:
  - deterministic multi-file route extraction for React Router (data, declarative, framework mode), Vue Router and Next.js (`app/`, `pages/`, `src/`)
  - controls from each page and the components it imports, by test id, `aria-label` or visible text
  - small-model descriptions, `navigable` classification and generated page actions using the developer's own key (read from `.env`)
  - dry run and `--json` for agents
- Graph format v1.2: `navigable`, `note`, role selectors (`role=button[name="..."]`).
- `spotter-sdk dev`: reverse proxy in front of the dev server that injects the widget, passes HMR through, and serves the endpoint with the developer's key.
- Claude Code plugin (`spotter-analyze` skill): the same pipeline with the coding agent doing the judgment calls, no key needed.

## Next: dogfood on a real app

The founder tests the full loop on their own app (`analyze` → `dev` → ask questions) and fixes what breaks. Watch for:

- routes the parser misses, or the wrong mount prefix
- pages hidden or shown wrongly
- controls that aren't found (computed labels, custom components) or selectors that don't resolve
- descriptions that route queries to the wrong page

## Then: prove it works on apps we didn't write

1. **Eval harness.** Run `analyze` on public apps (Cal.com and others). Hand-label a golden set of `(query → page, action)`. Measure route accuracy, action accuracy, unhandled rate, and selector resolution rate in a real browser. A recorded-LLM mode runs in CI, a live mode on demand. Publish the numbers. That is the main risk to the thesis: whether analyze → graph → agent can operate an arbitrary SaaS.
2. **Dynamic routes.** Fill `:id` from the current page, recent records or a search action, so detail pages stop being hidden.
3. **Hardening.** Query length cap, LLM timeout and retries in `LLMConfig`, an `authorize` hook on the endpoint, rate-limit guidance.
4. **Publish.** Settle the npm name, publish `spotter-sdk` to npm and PyPI from CI on tag, then add a CHANGELOG and semver policy.

## Later

- `spotter setup`: a skill or command that adds the production endpoint and widget to the user's codebase.
- Trace-grade events (`requestId`, latency, matched route, flow outcome), `spotter report` (unhandled queries, abandoned flows), `spotter improve` (proposed config diffs, never silent edits).
- Executed actions: top-level API actions run by the endpoint with the user's session, and `confirm` on destructive page actions.
- More analyzers (SvelteKit, Angular, Nuxt) and backends (Django, Flask, Go).
- Spotter Cloud.
