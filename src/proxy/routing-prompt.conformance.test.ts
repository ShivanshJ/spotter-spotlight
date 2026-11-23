import { describe, it, expect } from 'vitest'
import { buildRoutingPrompt } from './llm-client'
import { summarizeConfig } from './site-map'
import { loadConformanceConfig, readConformanceText } from '../test-helpers/conformance'

describe('buildRoutingPrompt conformance', () => {
  it('matches the shared conformance prompt', () => {
    const prompt = buildRoutingPrompt(summarizeConfig(loadConformanceConfig()))
    expect(prompt).toBe(readConformanceText('routing-prompt.txt'))
  })
})
