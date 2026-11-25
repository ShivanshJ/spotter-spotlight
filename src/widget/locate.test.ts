import { describe, it, expect, beforeEach } from 'vitest'
import { locate, isValidSelector } from './locate'

beforeEach(() => {
  document.body.innerHTML = `
    <button id="a">Upgrade plan</button>
    <div role="button" id="b"><svg></svg> Delete rule</div>
    <button id="c" aria-label="Close dialog">X</button>
    <div role="menuitem" id="d">Rename</div>
    <button id="e" data-testid="save">Save changes</button>
    <button id="f">Upgrade plan now</button>`
})

describe('locate', () => {
  it('finds buttons by visible text, preferring an exact match', () => {
    expect(locate('role=button[name="Upgrade plan"]')?.id).toBe('a')
    expect(locate('role=button[name="upgrade PLAN now"]')?.id).toBe('f')
  })

  it('matches role="button" elements and trims icons from the name', () => {
    expect(locate('role=button[name="Delete rule"]')?.id).toBe('b')
  })

  it('uses aria-label as the accessible name', () => {
    expect(locate('role=button[name="Close dialog"]')?.id).toBe('c')
  })

  it('finds other roles', () => {
    expect(locate('role=menuitem[name="Rename"]')?.id).toBe('d')
  })

  it('still accepts CSS selectors', () => {
    expect(locate('[data-testid="save"]')?.id).toBe('e')
  })

  it('returns null when nothing matches or the selector is invalid', () => {
    expect(locate('role=button[name="Nope"]')).toBeNull()
    expect(locate('[[bad')).toBeNull()
    expect(isValidSelector('role=tab[name="Members"]')).toBe(true)
  })
})
