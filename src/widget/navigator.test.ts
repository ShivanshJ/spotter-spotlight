import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NavigatorController } from './navigator'

beforeEach(() => {
  document.body.innerHTML = `
    <button data-testid="dark-mode">Toggle dark mode</button>
    <a href="/rewards">Rewards</a>
  `
})

afterEach(() => {
  document.body.innerHTML = ''
  document.querySelectorAll('[data-spotter-overlay]').forEach((el) => el.remove())
})

describe('NavigatorController', () => {
  it('creates a highlight overlay for a valid selector', () => {
    const nav = new NavigatorController()
    nav.highlightStep({ selector: '[data-testid="dark-mode"]', description: 'Toggle dark mode', interactionType: 'click' })
    expect(document.querySelector('[data-spotter-overlay]')).not.toBeNull()
  })

  it('creates a tooltip with the step description', () => {
    const nav = new NavigatorController()
    nav.highlightStep({ selector: '[data-testid="dark-mode"]', description: 'Toggle dark mode', interactionType: 'click' })
    const tooltip = document.querySelector('[data-spotter-tooltip]')
    expect(tooltip?.textContent).toContain('Toggle dark mode')
  })

  it('removes overlay and tooltip on clear', () => {
    const nav = new NavigatorController()
    nav.highlightStep({ selector: '[data-testid="dark-mode"]', description: 'Toggle', interactionType: 'click' })
    nav.clear()
    expect(document.querySelector('[data-spotter-overlay]')).toBeNull()
    expect(document.querySelector('[data-spotter-tooltip]')).toBeNull()
  })

  it('does nothing silently if selector matches no element', () => {
    const nav = new NavigatorController()
    expect(() =>
      nav.highlightStep({ selector: '[data-testid="nonexistent"]', description: 'Missing', interactionType: 'click' })
    ).not.toThrow()
  })

  it('calls onComplete when highlighted element is clicked', () => {
    return new Promise<void>((resolve) => {
      const nav = new NavigatorController()
      nav.onComplete(() => resolve())
      nav.highlightStep({ selector: '[data-testid="dark-mode"]', description: 'Click me', interactionType: 'click' })
      const btn = document.querySelector<HTMLElement>('[data-testid="dark-mode"]')
      btn?.click()
    })
  })
})
