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

describe('Next.js route paths', () => {
  it('maps app router folders to URL paths', async () => {
    const { appRoutePath } = await import('./nextjs')
    const app = '/r/app'
    expect(appRoutePath(app, '/r/app/page.tsx')).toBe('/')
    expect(appRoutePath(app, '/r/app/(marketing)/pricing/page.tsx')).toBe('/pricing')
    expect(appRoutePath(app, '/r/app/invoices/[id]/page.tsx')).toBe('/invoices/:id')
    expect(appRoutePath(app, '/r/app/docs/[[...slug]]/page.tsx')).toBe('/docs')
    expect(appRoutePath(app, '/r/app/docs/[...slug]/page.tsx')).toBeNull()
    expect(appRoutePath(app, '/r/app/feed/(.)photo/page.tsx')).toBeNull()
    expect(appRoutePath(app, '/r/app/_components/page.tsx')).toBeNull()
    expect(appRoutePath(app, '/r/app/dashboard/@stats/page.tsx')).toBe('/dashboard')
    expect(appRoutePath(app, '/r/app/settings/layout.tsx')).toBeNull()
  })

  it('maps pages router files to URL paths', async () => {
    const { pagesRoutePath } = await import('./nextjs')
    const pages = '/r/pages'
    expect(pagesRoutePath(pages, '/r/pages/index.tsx')).toBe('/')
    expect(pagesRoutePath(pages, '/r/pages/blog/index.tsx')).toBe('/blog')
    expect(pagesRoutePath(pages, '/r/pages/blog/[slug].tsx')).toBe('/blog/:slug')
    expect(pagesRoutePath(pages, '/r/pages/_app.tsx')).toBeNull()
    expect(pagesRoutePath(pages, '/r/pages/404.tsx')).toBeNull()
    expect(pagesRoutePath(pages, '/r/pages/api/users.ts')).toBeNull()
  })

  it('reads app and pages from src/', async () => {
    const fsp = await import('fs/promises')
    const os = await import('os')
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'spotter-next-'))
    await fsp.mkdir(path.join(dir, 'src/app/settings'), { recursive: true })
    await fsp.writeFile(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '15' } }))
    await fsp.writeFile(path.join(dir, 'src/app/settings/page.tsx'), 'export default function P() { return null }')
    expect(nextjsAnalyzer.detect(dir)).toBe(true)
    const routes = await nextjsAnalyzer.analyze(dir)
    expect(routes.map(r => r.path)).toEqual(['/settings'])
    await fsp.rm(dir, { recursive: true, force: true })
  })
})
