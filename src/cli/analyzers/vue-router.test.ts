import { describe, it, expect } from 'vitest'
import path from 'path'
import { fileURLToPath } from 'url'
import { vueRouterAnalyzer } from './vue-router'

const fixtureDir = path.join(fileURLToPath(new URL('.', import.meta.url)), '__fixtures__/vue-router')

describe('vueRouterAnalyzer', () => {
  it('detects a Vue Router project by package.json', () => {
    expect(vueRouterAnalyzer.detect(fixtureDir)).toBe(true)
  })

  it('does not detect a project without vue-router', () => {
    expect(vueRouterAnalyzer.detect('/tmp')).toBe(false)
  })

  it('extracts route paths from router config', async () => {
    const routes = await vueRouterAnalyzer.analyze(fixtureDir)
    const paths = routes.map(r => r.path)
    expect(paths).toContain('/')
    expect(paths).toContain('/settings')
    expect(paths).toContain('/profile')
  })

  it('returns empty array when no router file found', async () => {
    const routes = await vueRouterAnalyzer.analyze('/tmp/nonexistent-vue-app')
    expect(routes).toEqual([])
  })
})
