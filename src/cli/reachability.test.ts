import { describe, it, expect } from 'vitest'
import { deriveReachableFrom } from './reachability'

describe('deriveReachableFrom', () => {
  it('maps a route to its nearest ancestor that exists as a route', () => {
    const result = deriveReachableFrom(['/settings', '/settings/billing', '/settings/billing/history'])
    expect(result.get('/settings/billing')).toEqual(['/settings'])
    expect(result.get('/settings/billing/history')).toEqual(['/settings/billing'])
  })

  it('skips missing intermediate ancestors', () => {
    const result = deriveReachableFrom(['/settings', '/settings/team/members'])
    expect(result.get('/settings/team/members')).toEqual(['/settings'])
  })

  it('gives top-level routes and the root no parent', () => {
    const result = deriveReachableFrom(['/', '/settings', '/rewards'])
    expect(result.has('/')).toBe(false)
    expect(result.has('/settings')).toBe(false)
    expect(result.has('/rewards')).toBe(false)
  })

  it('gives routes with no existing ancestor no parent', () => {
    const result = deriveReachableFrom(['/billing/invoices'])
    expect(result.has('/billing/invoices')).toBe(false)
  })
})
