// A control is something a user can click or change on a page, with a selector the widget can find.
// Selectors are CSS (`[data-testid="x"]`, `[aria-label="x"]`, `#x`) or, for buttons whose only
// handle is their visible text, `role=button[name="Upgrade plan"]`, which the widget resolves by
// accessible role and name.
export type Control = {
  key: string
  selector: string
  label: string
  role?: string
}

type JsxElement = { tag: string; attrs: Map<string, string>; text: string }

const BUTTON_TAG = /^(button|[A-Z]\w*Button|Button)$/
const MENU_ITEM_TAG = /^([A-Z]\w*)?MenuItem$/
const TAB_TAG = /^(Tab|TabsTrigger)$/
const MAX_LABEL = 40

function roleOf(tag: string, attrs: Map<string, string>): string | undefined {
  const explicit = attrs.get('role')
  if (explicit) return explicit
  if (BUTTON_TAG.test(tag)) return 'button'
  if (MENU_ITEM_TAG.test(tag)) return 'menuitem'
  if (TAB_TAG.test(tag)) return 'tab'
  return undefined
}

function readAttributes(src: string, start: number): { attrs: Map<string, string>; end: number; selfClosing: boolean } {
  const attrs = new Map<string, string>()
  let i = start
  let depth = 0
  let quote: string | null = null
  let top = ''
  for (; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === quote && src[i - 1] !== '\\') quote = null
    } else if (c === '"' || c === "'" || (c === '`' && depth > 0)) {
      quote = c
    } else if (c === '{') {
      depth++
    } else if (c === '}') {
      depth--
    } else if (c === '>' && depth === 0) {
      break
    }
    if (depth === 0 && c !== '}') top += c
  }
  for (const m of top.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs.set(m[1], m[2] ?? m[3] ?? '')
  for (const m of src.slice(start, i).matchAll(/([\w-]+)\s*=\s*\{\s*(["'])([^"'{}]*)\2\s*\}/g)) {
    if (!attrs.has(m[1])) attrs.set(m[1], m[3])
  }
  return { attrs, end: i, selfClosing: src[i - 1] === '/' }
}

function innerText(src: string, from: number, tag: string): string {
  const close = src.indexOf(`</${tag}`, from)
  if (close === -1 || close - from > 400) return ''
  const inner = src.slice(from, close)
  if (inner.includes('{')) return ''
  return inner.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function jsxElements(src: string): JsxElement[] {
  const elements: JsxElement[] = []
  const open = /<([A-Za-z][\w.]*)(?=[\s>/])/g
  let m: RegExpExecArray | null
  while ((m = open.exec(src))) {
    const tag = m[1]
    const { attrs, end, selfClosing } = readAttributes(src, m.index + m[0].length)
    const text = selfClosing ? '' : innerText(src, end + 1, tag)
    if (attrs.size > 0 || text) elements.push({ tag, attrs, text })
    open.lastIndex = Math.max(open.lastIndex, m.index + m[0].length)
  }
  return elements
}

function cssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function controlOf(el: JsxElement): Control | null {
  const role = roleOf(el.tag, el.attrs)
  const testId = el.attrs.get('data-testid') ?? el.attrs.get('data-test-id') ?? el.attrs.get('data-cy')
  const ariaLabel = el.attrs.get('aria-label')
  const id = el.attrs.get('id')
  const text = el.text.length <= MAX_LABEL && /[A-Za-z]/.test(el.text) ? el.text : ''
  const label = ariaLabel || text || testId || id || ''
  const base = { label, ...(role ? { role } : {}) }

  if (testId) {
    const attr = el.attrs.has('data-testid') ? 'data-testid' : el.attrs.has('data-test-id') ? 'data-test-id' : 'data-cy'
    return { key: toCamelCase(testId), selector: `[${attr}="${cssString(testId)}"]`, ...base }
  }
  if (ariaLabel) return { key: toCamelCase(ariaLabel), selector: `[aria-label="${cssString(ariaLabel)}"]`, ...base }
  if (id && /^[A-Za-z][\w-]*$/.test(id) && (role || text)) return { key: toCamelCase(id), selector: `#${id}`, ...base }
  if (role && text) {
    return { key: toCamelCase(`${text} ${role}`), selector: `role=${role}[name="${cssString(text)}"]`, ...base }
  }
  return null
}

export function extractControls(content: string): Control[] {
  const byKey = new Map<string, Control>()
  for (const el of jsxElements(content)) {
    const control = controlOf(el)
    if (control && control.key && !byKey.has(control.key)) byKey.set(control.key, control)
  }
  return [...byKey.values()]
}

export function extractSelectors(content: string): Record<string, string> {
  return Object.fromEntries(extractControls(content).map(c => [c.key, c.selector]))
}

export function extractApiCalls(content: string): string[] {
  const calls: string[] = []
  for (const match of content.matchAll(/fetch\(['"]([^'"]+)['"]/g)) {
    if (match[1].startsWith('/api/')) calls.push(match[1])
  }
  for (const match of content.matchAll(/axios\.\w+\(['"]([^'"]+)['"]/g)) {
    if (match[1].startsWith('/api/')) calls.push(match[1])
  }
  return [...new Set(calls)]
}

export function extractPageTitle(content: string): string | undefined {
  const metadataMatch = content.match(/title:\s*["']([^"']+)["']/)
  if (metadataMatch) return metadataMatch[1]
  const titleTagMatch = content.match(/<title>([^<]+)<\/title>/)
  if (titleTagMatch) return titleTagMatch[1]
  return undefined
}

function toCamelCase(str: string): string {
  return str
    .replace(/[^A-Za-z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (_, c) => c.toLowerCase())
}
