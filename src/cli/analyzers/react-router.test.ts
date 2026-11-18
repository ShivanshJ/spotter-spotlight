import { describe, it, expect } from 'vitest'
import path from 'path'
import { fileURLToPath } from 'url'
import { reactRouterAnalyzer } from './react-router'

const fixtureDir = path.join(fileURLToPath(new URL('.', import.meta.url)), '__fixtures__/react-router')

describe('reactRouterAnalyzer', () => {
  it('detects a React Router project by package.json', () => {
    expect(reactRouterAnalyzer.detect(fixtureDir)).toBe(true)
  })

  it('does not detect a project without react-router', () => {
    expect(reactRouterAnalyzer.detect('/tmp')).toBe(false)
  })

  it('extracts route paths from createBrowserRouter config', async () => {
    const routes = await reactRouterAnalyzer.analyze(fixtureDir)
    const paths = routes.map(r => r.path)
    expect(paths).toContain('/')
    expect(paths).toContain('/settings')
    expect(paths).toContain('/billing')
  })

  it('extracts selectors from route component files', async () => {
    const routes = await reactRouterAnalyzer.analyze(fixtureDir)
    const hasSelector = routes.some(r => Object.keys(r.selectors).length > 0)
    expect(hasSelector).toBe(true)
  })

  it('returns empty array when no router file found', async () => {
    const routes = await reactRouterAnalyzer.analyze('/tmp/nonexistent-react-app')
    expect(routes).toEqual([])
  })
})
