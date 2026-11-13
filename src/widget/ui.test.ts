import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createUI } from './ui'

beforeEach(() => { document.body.innerHTML = '' })
afterEach(() => { document.body.innerHTML = '' })

describe('createUI', () => {
  it('mounts a container into the DOM', () => {
    const ui = createUI()
    document.body.appendChild(ui.container)
    expect(document.querySelector('[data-spotter-root]')).not.toBeNull()
  })

  it('panel is hidden by default', () => {
    const ui = createUI()
    document.body.appendChild(ui.container)
    const panel = document.querySelector<HTMLElement>('[data-spotter-panel]')
    expect(panel?.getAttribute('data-open')).toBeFalsy()
  })

  it('panel opens when toggle button is clicked', () => {
    const ui = createUI()
    document.body.appendChild(ui.container)
    document.querySelector<HTMLElement>('[data-spotter-toggle]')?.click()
    const panel = document.querySelector<HTMLElement>('[data-spotter-panel]')
    expect(panel?.getAttribute('data-open')).toBe('true')
  })

  it('calls onSubmit with trimmed input when form is submitted', () => {
    const ui = createUI()
    document.body.appendChild(ui.container)
    const onSubmit = vi.fn()
    ui.onSubmit(onSubmit)

    const input = document.querySelector<HTMLInputElement>('[data-spotter-input]')!
    input.value = '  dark mode  '
    document.querySelector<HTMLFormElement>('[data-spotter-form]')?.dispatchEvent(new Event('submit'))

    expect(onSubmit).toHaveBeenCalledWith('dark mode')
  })

  it('clears input after submit', () => {
    const ui = createUI()
    document.body.appendChild(ui.container)
    ui.onSubmit(vi.fn())
    const input = document.querySelector<HTMLInputElement>('[data-spotter-input]')!
    input.value = 'test query'
    document.querySelector<HTMLFormElement>('[data-spotter-form]')?.dispatchEvent(new Event('submit'))
    expect(input.value).toBe('')
  })

  it('showMessage adds a message bubble to the panel', () => {
    const ui = createUI()
    document.body.appendChild(ui.container)
    ui.showMessage('I can only help with navigation.')
    expect(document.querySelector('[data-spotter-messages]')?.textContent).toContain('I can only help with navigation.')
  })

  it('showSteps renders a numbered step list', () => {
    const ui = createUI()
    document.body.appendChild(ui.container)
    ui.showSteps([
      { selector: '#foo', description: 'Click the foo button', interactionType: 'click' },
      { selector: '#bar', description: 'Then click bar', interactionType: 'click' },
    ])
    const messages = document.querySelector('[data-spotter-messages]')?.textContent
    expect(messages).toContain('Click the foo button')
    expect(messages).toContain('Then click bar')
  })

  it('destroy removes the container from DOM', () => {
    const ui = createUI()
    document.body.appendChild(ui.container)
    ui.destroy()
    expect(document.querySelector('[data-spotter-root]')).toBeNull()
  })
})
