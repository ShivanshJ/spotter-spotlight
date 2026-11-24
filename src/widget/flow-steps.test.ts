import { describe, it, expect } from 'vitest'
import { linkPathOf } from './flow-steps'

const step = (selector: string) => ({ selector, description: 'd', interactionType: 'click' as const })

describe('linkPathOf', () => {
  it('returns the path for an exact link selector', () => {
    expect(linkPathOf(step('a[href="/rewards"]'))).toBe('/rewards')
  })

  it('returns null for other selectors', () => {
    expect(linkPathOf(step('#save'))).toBeNull()
    expect(linkPathOf(step('a[href="/x"] span'))).toBeNull()
    expect(linkPathOf(step('button[href="/x"]'))).toBeNull()
    expect(linkPathOf(step('a[href=""]'))).toBeNull()
  })
})
