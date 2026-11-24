import type { NavigateStep } from '../types'

const LINK_SELECTOR = /^a\[href="([^"]+)"\]$/

export function linkPathOf(step: NavigateStep): string | null {
  const match = LINK_SELECTOR.exec(step.selector)
  return match ? match[1] : null
}
