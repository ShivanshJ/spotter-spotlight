import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { extractRoutes, joinPath, findSourceFiles } from './route-config'

let dir: string

function write(rel: string, content: string): string {
  const file = path.join(dir, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
  return file
}

const paths = (file: string | string[], opts: { mount?: string; explicit?: boolean } = {}) =>
  extractRoutes([file].flat().map(f => ({ file: f, ...opts })), dir).map(r => r.path)

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spotter-routes-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('joinPath', () => {
  it('joins relative children and keeps absolute ones', () => {
    expect(joinPath('/', 'a')).toBe('/a')
    expect(joinPath('/a', 'b')).toBe('/a/b')
    expect(joinPath('/a/', 'b/')).toBe('/a/b')
    expect(joinPath('/a', '/x')).toBe('/x')
    expect(joinPath('/a', '')).toBe('/a')
  })
})

describe('object route trees', () => {
  it('follows nested children, index routes and pathless layouts', () => {
    const f = write('src/router.tsx', `
      import { createBrowserRouter } from 'react-router-dom'
      export const router = createBrowserRouter([
        {
          path: '/',
          element: <Root />,
          children: [
            { index: true, element: <Home /> },
            { path: 'settings', element: <div>Settings, general</div>, children: [
              { path: 'billing', element: <Billing /> },
            ]},
            { element: <AuthLayout />, children: [{ path: 'login' }] },
            { path: '*', element: <NotFound /> },
          ],
        },
      ])
    `)
    expect(paths(f)).toEqual(['/', '/settings', '/settings/billing', '/login'])
  })

  it('follows routes split across files through imports and spreads', () => {
    write('src/routes/admin.ts', `
      export const adminRoutes: RouteObject[] = [
        { path: 'users', lazy: () => import('../pages/Users') },
        { path: 'audit' },
      ]
    `)
    write('src/routes/public.ts', `export default [{ path: '/pricing' }, { path: '/about' }]`)
    write('src/pages/Users.tsx', `export default () => <div data-testid="users-table" />`)
    const f = write('src/main.tsx', `
      import { adminRoutes } from './routes/admin'
      import publicRoutes from './routes/public'
      const routes = [
        ...publicRoutes,
        { path: '/admin', children: adminRoutes },
      ]
      createRoot(el).render(<RouterProvider router={createBrowserRouter(routes)} />)
    `)
    const routes = extractRoutes([{ file: f }], dir)
    expect(routes.map(r => r.path)).toEqual(['/pricing', '/about', '/admin', '/admin/users', '/admin/audit'])
    expect(routes.find(r => r.path === '/admin/users')!.componentFile).toBe(path.join(dir, 'src/pages/Users.tsx'))
  })

  it('reads Vue createRouter({ routes }) with nested children', () => {
    const f = write('src/router/index.ts', `
      import { createRouter, createWebHistory } from 'vue-router'
      const routes: RouteRecordRaw[] = [
        { path: '/', component: () => import('../views/Home.vue') },
        { path: '/account', component: Account, children: [{ path: 'profile' }, { path: '' }] },
        { path: '/:pathMatch(.*)*', component: NotFound },
      ]
      export default createRouter({ history: createWebHistory(), routes })
    `)
    expect(paths(f)).toEqual(['/', '/account', '/account/profile'])
  })
})

describe('React Router framework mode (routes.ts)', () => {
  it('reads route(), index(), layout() and prefix()', () => {
    write('app/routes/home.tsx', '')
    write('app/routes/team.tsx', '')
    const f = write('app/routes.ts', `
      import { type RouteConfig, index, route, layout, prefix } from '@react-router/dev/routes'
      export default [
        index('routes/home.tsx'),
        route('about', 'routes/about.tsx'),
        layout('routes/auth-layout.tsx', [route('/login', 'routes/login.tsx')]),
        ...prefix('projects', [
          index('routes/projects.tsx'),
          route(':id', 'routes/project.tsx', [route('team', 'routes/team.tsx')]),
        ]),
      ] satisfies RouteConfig
    `)
    const routes = extractRoutes([{ file: f }], dir)
    expect(routes.map(r => r.path)).toEqual(['/', '/about', '/login', '/projects', '/projects/:id', '/projects/:id/team'])
    expect(routes[0].componentFile).toBe(path.join(dir, 'app/routes/home.tsx'))
  })

  it('reads flatRoutes() file conventions', () => {
    for (const name of ['_index.tsx', 'about.tsx', 'rules.$id.tsx', '_auth.login.tsx', 'files.$.tsx', 'blog.post.test.tsx']) {
      write(`app/routes/${name}`, '')
    }
    write('app/routes/settings/route.tsx', '')
    const f = write('app/routes.ts', `
      import { flatRoutes } from '@react-router/fs-routes'
      export default flatRoutes() satisfies RouteConfig
    `)
    expect(paths(f).sort()).toEqual(['/', '/about', '/login', '/rules/:id', '/settings'])
  })
})

describe('JSX route trees', () => {
  it('nests <Route> paths and skips catch-alls', () => {
    const f = write('src/App.tsx', `
      export default function App() {
        return (
          <Routes>
            <Route path="/" element={<Layout title="a > b" />}>
              <Route index element={<Home />} />
              <Route path="docs" element={<Docs />}>
                <Route path={"intro"} element={<Intro />} />
              </Route>
              <Route element={<Guard />}>
                <Route path="dashboard" element={<Dash />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        )
      }
    `)
    expect(paths(f)).toEqual(['/', '/docs', '/docs/intro', '/dashboard'])
  })
})

describe('nested <Routes> in another file', () => {
  it('mounts a splat route\'s component file under its path, not at /', () => {
    const app = write('src/App.tsx', `
      import DashboardRoutes from './dashboard/DashboardRoutes'
      export const App = () => (
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="dashboard/*" element={<DashboardRoutes />} />
        </Routes>
      )
    `)
    const dash = write('src/dashboard/DashboardRoutes.tsx', `
      export default function DashboardRoutes() {
        return <Routes><Route index element={<Overview />} /><Route path="stats" element={<Stats />} /></Routes>
      }
    `)
    // order matters: discovery may list the nested file first
    expect(paths([dash, app])).toEqual(['/', '/dashboard', '/dashboard/stats'])
  })
})

describe('explicit files and mounts', () => {
  it('mounts a file under a prefix and reads its exported arrays', () => {
    const f = write('src/features/billing/routes.tsx', `
      export const billingRoutes = [{ path: 'invoices' }, { path: 'plans' }]
    `)
    expect(paths(f)).toEqual([]) // not a router file on its own
    expect(paths(f, { explicit: true, mount: '/billing' })).toEqual(['/billing/invoices', '/billing/plans'])
  })

  it('does not double-count an explicit file that another route tree already imports', () => {
    const admin = write('src/admin.ts', `export const adminRoutes = [{ path: 'users' }]`)
    const main = write('src/main.tsx', `
      import { adminRoutes } from './admin'
      createBrowserRouter([{ path: '/admin', children: adminRoutes }])
    `)
    expect(paths([main, admin], { explicit: true })).toEqual(['/admin', '/admin/users'])
  })
})

describe('findSourceFiles', () => {
  it('finds router files under src/ and app/, skipping tests and node_modules', () => {
    write('src/router.tsx', 'createBrowserRouter([])')
    write('src/router.test.tsx', 'createBrowserRouter([])')
    write('node_modules/x/index.js', 'createBrowserRouter([])')
    write('src/other.ts', 'export const x = 1')
    const found = findSourceFiles(dir, c => c.includes('createBrowserRouter'))
    expect(found.map(f => path.relative(dir, f))).toEqual(['src/router.tsx'])
  })
})
