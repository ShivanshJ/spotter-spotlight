import { describe, it, expect, vi } from 'vitest'
import { routeQuery } from './llm-client'
import type { RouteResult } from './llm-client'

const makeMockClient = (result: RouteResult) => ({
  chat: {
    completions: {
      create: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(result) } }],
      }),
    },
  },
})

describe('routeQuery', () => {
  it('returns navigate result with routePath for a navigation query', async () => {
    const client = makeMockClient({ type: 'navigate', routePath: '/settings/appearance' })
    const result = await routeQuery(
      client as any,
      'how do I turn on dark mode?',
      'Routes:\n  - /settings/appearance: "Dark mode settings"'
    )
    expect(result.type).toBe('navigate')
    expect((result as { type: 'navigate'; routePath: string }).routePath).toBe('/settings/appearance')
  })

  it('returns action result with actionIntent for an action query', async () => {
    const client = makeMockClient({ type: 'action', actionIntent: 'get user points balance' })
    const result = await routeQuery(
      client as any,
      'how many points do I have?',
      'Actions:\n  - "get user points balance" → GET /api/user/rewards'
    )
    expect(result.type).toBe('action')
    expect((result as { type: 'action'; actionIntent: string }).actionIntent).toBe('get user points balance')
  })

  it('returns general for a non-navigation query', async () => {
    const client = makeMockClient({ type: 'general' })
    const result = await routeQuery(
      client as any,
      'what is your refund policy?',
      'Routes:\n  - /settings/appearance: "Dark mode settings"'
    )
    expect(result.type).toBe('general')
  })

  it('defaults to general if LLM returns unexpected JSON', async () => {
    const client = {
      chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: 'not json' } }] }) } },
    }
    const result = await routeQuery(client as any, 'some query', 'Routes:\n  (none)')
    expect(result.type).toBe('general')
  })

  it('passes baseURL and model to the OpenAI client', async () => {
    const client = makeMockClient({ type: 'general' })
    const result = await routeQuery(
      client as any,
      'some query',
      'Routes:\n  (none)',
      'gpt-4-turbo'
    )
    expect(result.type).toBe('general')
    expect(client.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4-turbo' })
    )
  })
})
