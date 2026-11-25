export type FlagSpec = 'value' | 'list' | 'boolean'

export type ParsedArgs = {
  has(flag: string): boolean
  value(flag: string): string | undefined
  list(flag: string): string[]
}

export class ArgError extends Error {}

function suggestion(flag: string, known: string[]): string {
  const close = known.find(k => k.startsWith(flag) || flag.startsWith(k))
  return close ? ` Did you mean ${close}?` : ''
}

export function parseArgs(argv: string[], spec: Record<string, FlagSpec>): ParsedArgs {
  const values = new Map<string, string[]>()
  const known = Object.keys(spec)
  for (let i = 0; i < argv.length; i++) {
    const [name, inline] = argv[i].startsWith('--') && argv[i].includes('=')
      ? [argv[i].slice(0, argv[i].indexOf('=')), argv[i].slice(argv[i].indexOf('=') + 1)]
      : [argv[i], undefined]
    const kind = spec[name]
    if (!kind) {
      throw new ArgError(name.startsWith('-')
        ? `Unknown option ${name}.${suggestion(name, known)} Run with --help to see options.`
        : `Unexpected argument "${name}". Run with --help to see options.`)
    }
    if (kind === 'boolean') {
      values.set(name, ['true'])
      continue
    }
    const value = inline ?? argv[i + 1]
    if (value === undefined || (inline === undefined && value.startsWith('--'))) throw new ArgError(`${name} needs a value.`)
    if (inline === undefined) i++
    const parts = kind === 'list' ? value.split(',').map(v => v.trim()).filter(Boolean) : [value]
    values.set(name, kind === 'list' ? [...(values.get(name) ?? []), ...parts] : parts)
  }
  return {
    has: flag => values.has(flag),
    value: flag => values.get(flag)?.[0],
    list: flag => values.get(flag) ?? [],
  }
}
