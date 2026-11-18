import { describe, it, expect } from 'vitest'
import path from 'path'
import { fileURLToPath } from 'url'
import { nextjsAnalyzer } from './nextjs'

const fixtureDir = path.join(fileURLToPath(new URL('.', import.meta.url)), '__fixtures__/nextjs')

describe('nextjsAnalyzer', () => {
  it('detects a Next.js project by next.config.ts', () => {
    expect(nextjsAnalyzer.detect(fixtureDir)).toBe(true)
  })

  it('does not detect a non-Next.js project', () => {
    expect(nextjsAnalyzer.detect('/tmp')).toBe(false)
  })

  it('extracts routes from the app directory', async () => {
    const routes = await nextjsAnalyzer.analyze(fixtureDir)
    const paths = routes.map(r => r.path)
    expect(paths).toContain('/')
    expect(paths).toContain('/settings/appearance')
  })

  it('extracts routes from the pages directory', async () => {
    const routes = await nextjsAnalyzer.analyze(fixtureDir)
    expect(routes.map(r => r.path)).toContain('/billing')
  })

  it('extracts selectors from component files', async () => {
    const routes = await nextjsAnalyzer.analyze(fixtureDir)
    const appearance = routes.find(r => r.path === '/settings/appearance')
    expect(appearance?.selectors).toMatchObject({
      darkModeToggle: '[data-testid="dark-mode-toggle"]',
    })
  })

  it('extracts page title from metadata export', async () => {
    const routes = await nextjsAnalyzer.analyze(fixtureDir)
    const appearance = routes.find(r => r.path === '/settings/appearance')
    expect(appearance?.pageTitle).toBe('Appearance Settings')
  })

  it('deduplicates routes when both app and pages dirs have same path', async () => {
    const routes = await nextjsAnalyzer.analyze(fixtureDir)
    const unique = new Set(routes.map(r => r.path))
    expect(unique.size).toBe(routes.length)
  })
})
