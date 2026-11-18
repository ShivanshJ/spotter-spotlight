import type { FrameworkAnalyzer } from './types'
import { nextjsAnalyzer } from './nextjs'
import { reactRouterAnalyzer } from './react-router'
import { vueRouterAnalyzer } from './vue-router'

const analyzers: FrameworkAnalyzer[] = [
  nextjsAnalyzer,
  reactRouterAnalyzer,
  vueRouterAnalyzer,
]

export function detectAnalyzer(rootDir: string): FrameworkAnalyzer | null {
  return analyzers.find(a => a.detect(rootDir)) ?? null
}
