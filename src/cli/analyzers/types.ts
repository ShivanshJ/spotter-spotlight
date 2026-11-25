import type { RouteFileSpec } from './route-config'

export type AnalyzerOptions = {
  // Route files to read instead of auto-discovery (e.g. chosen by the coding-agent skill).
  routeFiles?: RouteFileSpec[]
}

export interface FrameworkAnalyzer {
  readonly name: string
  detect(rootDir: string): boolean
  analyze(rootDir: string, options?: AnalyzerOptions): Promise<DiscoveredRoute[]>
}

export type DiscoveredRoute = {
  path: string
  componentFile: string
  sourceFile?: string
  pageTitle?: string
  selectors: Record<string, string>
  apiCalls: string[]
}
