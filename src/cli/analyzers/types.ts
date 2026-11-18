export interface FrameworkAnalyzer {
  readonly name: string
  detect(rootDir: string): boolean
  analyze(rootDir: string): Promise<DiscoveredRoute[]>
}

export type DiscoveredRoute = {
  path: string
  componentFile: string
  pageTitle?: string
  selectors: Record<string, string>
  apiCalls: string[]
}
