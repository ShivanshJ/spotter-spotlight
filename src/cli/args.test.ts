import { describe, it, expect } from 'vitest'
import { parseArgs } from './args'

const spec = { '--root': 'value', '--routes': 'list', '--json': 'boolean' } as const

describe('parseArgs', () => {
  it('reads values, repeated and comma-separated lists, and booleans', () => {
    const args = parseArgs(['--root', 'web', '--routes', 'a.ts,b.ts', '--routes=c.ts@/c', '--json'], spec)
    expect(args.value('--root')).toBe('web')
    expect(args.list('--routes')).toEqual(['a.ts', 'b.ts', 'c.ts@/c'])
    expect(args.has('--json')).toBe(true)
    expect(args.has('--other')).toBe(false)
  })

  it('rejects unknown options with a suggestion', () => {
    expect(() => parseArgs(['--route', 'a.ts'], spec)).toThrow('Unknown option --route. Did you mean --routes?')
  })

  it('rejects a missing value', () => {
    expect(() => parseArgs(['--root'], spec)).toThrow('--root needs a value.')
    expect(() => parseArgs(['--root', '--json'], spec)).toThrow('--root needs a value.')
  })

  it('rejects stray arguments', () => {
    expect(() => parseArgs(['src/router.tsx'], spec)).toThrow('Unexpected argument "src/router.tsx"')
  })
})
