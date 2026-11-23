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
