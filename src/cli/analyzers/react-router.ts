import fs from 'fs'
import path from 'path'
import type { FrameworkAnalyzer } from './types'
import { extractRoutes, findSourceFiles, toDiscoveredRoutes } from './route-config'

function hasReactRouterDep(rootDir: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    return 'react-router' in deps || 'react-router-dom' in deps
  } catch { return false }
}

const ROUTER_MARKERS =
  /createBrowserRouter|createHashRouter|createMemoryRouter|createRoutesFromElements|useRoutes\s*\(|<Route[\s>/]|@react-router\/dev\/routes/

export const reactRouterAnalyzer: FrameworkAnalyzer = {
  name: 'React Router',

  detect(rootDir) {
    return hasReactRouterDep(rootDir)
  },

  async analyze(rootDir, options) {
    const specs = options?.routeFiles
      ?? findSourceFiles(rootDir, content => ROUTER_MARKERS.test(content)).map(file => ({ file }))
    return toDiscoveredRoutes(extractRoutes(specs, rootDir))
  },
}
