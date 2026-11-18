import { describe, it, expect } from 'vitest'
import path from 'path'
import { fileURLToPath } from 'url'
import { detectAnalyzer } from './registry'

const fixturesBase = path.join(fileURLToPath(new URL('.', import.meta.url)), '__fixtures__')

describe('detectAnalyzer', () => {
  it('detects Next.js for the nextjs fixture', () => {
    const analyzer = detectAnalyzer(path.join(fixturesBase, 'nextjs'))
    expect(analyzer?.name).toBe('Next.js')
  })

  it('detects React Router for the react-router fixture', () => {
    const analyzer = detectAnalyzer(path.join(fixturesBase, 'react-router'))
    expect(analyzer?.name).toBe('React Router')
  })

  it('detects Vue Router for the vue-router fixture', () => {
    const analyzer = detectAnalyzer(path.join(fixturesBase, 'vue-router'))
    expect(analyzer?.name).toBe('Vue Router')
  })

  it('returns null for an unknown project', () => {
    expect(detectAnalyzer('/tmp')).toBeNull()
  })
})
