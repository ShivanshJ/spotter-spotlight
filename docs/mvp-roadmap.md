# MVP roadmap: from working SDK to design partners

Goal: a B2B team can add Spotter in an afternoon, their users can ask for a page or an action and get taken there, and the team can see what failed and fix it.

## Where we are

- Done: Node and Python proxies, widget, `analyze` CLI (Next.js, React Router, Vue Router), graph format v1.1, shared conformance fixtures, LLM provider flexibility, analytics hook, CI, lint, type declarations.
- Gap that blocks a demo: the widget highlights only the first step of a multi-step flow and never advances. `parent → page → action` (the main v1.1 feature) does not work end to end.
- Gap that blocks selling: no way to tell if a navigation succeeded, no evaluation of routing quality, and "do things for the user" is limited to highlighting.

## P0: must exist before the first design-partner demo

1. **Flow runner (widget).** Executes steps in order. Waits for each target to appear, skips steps already satisfied, survives full page loads, falls back to direct navigation when a link is missing, and reports `completed` / `step_failed` / `abandoned`. Guided mode is the default (the user clicks); `mode: 'auto'` is opt-in and the runner clicks for the user.
2. **Routing eval harness.** A golden set of `(query → expected route/action)` per fixture app, run against a recorded LLM in CI (deterministic) and against a live model on demand (`npm run eval`). Output: accuracy, unhandled rate, a confusion list. This is the number we quote to design partners.
3. **Navigation precedence fix.** Analyzer routes carry discovered `selectors`, which win over `reachableFrom`. Make the parent link come first, then the route link, then selectors.
4. **Hardening.** Query length cap, LLM timeout and retries exposed in `LLMConfig`, `authorize` hook on the proxy (reject before spending tokens), CORS and rate-limit guidance.

## P1: what makes design partners keep using it

5. **Trace-grade events.** Add `requestId`, `latencyMs`, `model`, `matchedRoute`, `actionName`, `tokens` and an `error.kind` to the analytics event. Add the flow outcome events from the widget (endpoint: `POST <proxyUrl>/events`). Ship a built-in NDJSON file sink so partners can send us a log.
6. **`spotter report`.** Reads the NDJSON log, groups `unhandled` queries, shows success rate per route, and flags routes that are navigated to but abandoned.
7. **`spotter improve`.** Proposes edits to `spotter.config.json` (better descriptions, new page actions) from the log. It produces a diff for human review and never edits silently.
8. **Provider port.** A `RoutingModel` interface so routing is not welded to the OpenAI SDK (OpenAI-compatible stays the default adapter).
9. **Format v1.2.** `confirm: true` on page actions (destructive actions ask before running) and `risk` hints; API actions executed by the proxy with the user's session token.

## P2: distribution

10. Example apps (Next.js and FastAPI) in `examples/`, used as eval fixtures and as the demo.
11. More analyzers: SvelteKit, Remix, Angular, Nuxt. More backend adapters: Django, Flask, Go, Java.
12. Publish `spotter-sdk` to npm and PyPI from CI on tag. Add CHANGELOG and semver policy.

## Design-partner checklist (non-code)

- 60-second demo video on an example app.
- One-page integration guide (the README quick start) tested by someone who has not seen the repo.
- A weekly "unhandled queries" review with the partner, using `spotter report`.
- Success metrics agreed up front: query success rate, flow completion rate, share of queries that were `unhandled`.

## Observability as a separate product (sketch)

Every Spotter request is already a structured trace: query, retrieved map, routing decision, steps, and (once the flow runner reports) the user-visible outcome. That is the input a self-improving loop needs:

- **Collect:** events as NDJSON or OpenTelemetry spans; LLM spans in OpenRouter, Langfuse or Phoenix.
- **Label:** success is deterministic (flow completed vs abandoned vs retried with a rephrased query), so labels come free without human annotation.
- **Improve:** cluster `unhandled` and abandoned queries, propose description or action edits, validate them against the golden set before opening a PR against `spotter.config.json`.
- **Positioning:** "CI for your in-app agent". It works for any tool-using agent, not only Spotter, which is why it can stand alone.
