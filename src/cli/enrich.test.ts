import { describe, it, expect } from 'vitest'
import { enrichRoutes, isPlaceholderDescription, placeholderDescription, toInsight, buildPagePrompt } from './enrich'
import { SourceReader, type InspectedRoute } from './page-inspect'

function route(path: string, extra: Partial<InspectedRoute> = {}): InspectedRoute {
  return {
    path,
    componentFile: `/app${path}.tsx`,
    selectors: {},
    apiCalls: [],
    files: [],
    controls: [{ key: 'upgradePlanButton', selector: 'role=button[name="Upgrade plan"]', label: 'Upgrade plan', role: 'button' }],
    resourceOnly: false,
    ...extra,
  }
}

function fakeClient(reply: (prompt: string) => unknown) {
  const prompts: string[] = []
  return {
    prompts,
    chat: {
      completions: {
        create: async (req: { messages: { role: string; content: string }[] }) => {
          const prompt = req.messages[1].content
          prompts.push(prompt)
          const value = reply(prompt)
          if (value instanceof Error) throw value
          return { choices: [{ message: { content: JSON.stringify(value) } }] }
        },
      },
    },
  } as never as { prompts: string[]; chat: never }
}

const options = { rootDir: '/app', reader: new SourceReader() }

describe('placeholders', () => {
  it('recognises generated and empty descriptions', () => {
    expect(placeholderDescription('/settings/billing')).toBe('Settings Billing page')
    expect(isPlaceholderDescription('/settings/billing', 'Settings Billing page')).toBe(true)
    expect(isPlaceholderDescription('/settings/billing', '/settings/billing')).toBe(true)
    expect(isPlaceholderDescription('/settings/billing', 'Change your plan')).toBe(false)
  })
})

describe('toInsight', () => {
  it('keeps only actions tied to a known control', () => {
    const insight = toInsight({
      navigable: true,
      title: 'Billing',
      description: 'Change your plan.',
      actions: [
        { name: 'changePlan', description: 'Upgrade or downgrade', control: 'upgradePlanButton' },
        { name: 'made_up', description: 'Not real', control: 'noSuchControl' },
      ],
    }, route('/billing'))
    expect(insight.actions).toEqual([
      { name: 'change_plan', description: 'Upgrade or downgrade', selector: 'role=button[name="Upgrade plan"]' },
    ])
    expect(insight.title).toBe('Billing')
  })

  it('drops actions and keeps the note for hidden pages', () => {
    const insight = toInsight({
      navigable: false,
      note: 'Paywall interstitial',
      description: 'Upgrade prompt',
      actions: [{ name: 'x', description: 'y', control: 'upgradePlanButton' }],
    }, route('/paywall'))
    expect(insight).toMatchObject({ navigable: false, note: 'Paywall interstitial', actions: [] })
  })
})

describe('enrichRoutes', () => {
  it('without a key, uses rules and name hints and writes placeholders', async () => {
    const { insights } = await enrichRoutes(
      [route('/billing'), route('/paywall'), route('/api/x'), route('/rules/:id')],
      null,
      options
    )
    expect(insights.get('/billing')).toMatchObject({ navigable: true, description: 'Billing page', actions: [] })
    expect(insights.get('/paywall')?.navigable).toBe(false)
    expect(insights.get('/api/x')?.note).toBe('API endpoint')
    expect(insights.get('/rules/:id')?.navigable).toBe(false)
  })

  it('asks the model about each page that no rule settles', async () => {
    const client = fakeClient(prompt => ({
      navigable: !prompt.startsWith('Path: /paywall'),
      note: 'Interstitial',
      title: 'T',
      description: `About ${prompt.split('\n')[0]}`,
      actions: [],
    }))
    const { insights, failures } = await enrichRoutes(
      [route('/billing'), route('/paywall'), route('/api/x')],
      { apiKey: 'k' },
      { ...options, client: client as never }
    )
    expect(failures).toEqual([])
    expect(client.prompts).toHaveLength(2)
    expect(insights.get('/billing')).toMatchObject({ navigable: true, description: 'About Path: /billing', source: 'llm' })
    expect(insights.get('/paywall')).toMatchObject({ navigable: false, note: 'Interstitial' })
    expect(insights.get('/api/x')?.source).toBe('rule')
  })

  it('falls back to placeholders and stops calling after an auth error', async () => {
    const authError = Object.assign(new Error('401 Incorrect API key'), { status: 401 })
    const client = fakeClient(() => authError)
    const routes = [route('/a'), route('/b'), route('/c')]
    const { insights, failures } = await enrichRoutes(routes, { apiKey: 'bad' }, { ...options, client: client as never, concurrency: 1 })
    expect(client.prompts).toHaveLength(1)
    expect(failures).toHaveLength(3)
    expect(failures[0].error).toBe('401 Incorrect API key')
    expect(insights.get('/b')?.description).toBe('B page')
  })
})

describe('buildPagePrompt', () => {
  it('lists the controls and the other routes', () => {
    const prompt = buildPagePrompt(route('/billing'), ['/billing', '/team'], options)
    expect(prompt).toContain('Path: /billing')
    expect(prompt).toContain('Other routes: /team')
    expect(prompt).toContain('- upgradePlanButton: button "Upgrade plan"')
  })
})
