// Decides which routes are pages a user would ask to be taken to.
//
// `ruleVerdict` covers routes that are certainly not navigable (API and resource routes, and
// dynamic routes, which need a record id Spotter can't fill in yet). `nameVerdict` guesses from
// the path alone and is only used when no LLM is configured; with an LLM, the model reads the
// page and decides.
import type { InspectedRoute } from './page-inspect'

export type Verdict = { navigable: false; note: string }

const NAME_HINTS: [RegExp, string][] = [
  [/^(health|healthz|healthcheck|ping|status\.json|robots\.txt|sitemap\.xml)$/, 'Health check or machine-readable endpoint'],
  [/^(callback|oauth|oauth2|sso|auth-callback|redirect)$/, 'Auth callback or redirect, not a page users visit directly'],
  [/^(logout|log-out|signout|sign-out)$/, 'Logs the user out; not a page to navigate to'],
  [/^(loading|splash|paywall|maintenance)$/, 'Interstitial the app sends users to; not a page users ask for'],
  [/(^|-)(test|debug|sandbox|playground|demo)$|^(test|debug)-/, 'Internal test or debug page'],
  [/^(loginas|login-as|impersonate)$/, 'Internal admin tool'],
]

export function ruleVerdict(route: Pick<InspectedRoute, 'path' | 'resourceOnly'>): Verdict | null {
  if (/^\/api(\/|$)/.test(route.path)) return { navigable: false, note: 'API endpoint' }
  if (route.resourceOnly) return { navigable: false, note: 'Resource route: exports a loader or action but renders no page' }
  if (/(^|\/)[:*]/.test(route.path)) {
    return { navigable: false, note: "Needs a specific record id, which Spotter can't fill in yet" }
  }
  return null
}

export function nameVerdict(routePath: string): Verdict | null {
  const segments = routePath.toLowerCase().split('/').filter(Boolean)
  for (const segment of segments) {
    for (const [pattern, note] of NAME_HINTS) {
      if (pattern.test(segment)) return { navigable: false, note: `${note} (guessed from the path)` }
    }
  }
  return null
}
