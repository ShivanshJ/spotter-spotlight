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
