const ROLE_PATTERN = /^role=([a-z]+)\[name="((?:[^"\\]|\\.)*)"\]$/

const ROLE_ELEMENTS: Record<string, string> = {
  button: 'button, [role="button"], input[type="button"], input[type="submit"]',
  link: 'a[href], [role="link"]',
  menuitem: '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
  tab: '[role="tab"]',
  checkbox: 'input[type="checkbox"], [role="checkbox"]',
  switch: '[role="switch"]',
}

function normalize(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function accessibleName(el: HTMLElement): string {
  const labelledBy = el.getAttribute('aria-labelledby')
  const labelledText = labelledBy
    ? labelledBy.split(/\s+/).map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '').join(' ')
    : ''
  return normalize(
    el.getAttribute('aria-label') || labelledText || el.textContent || (el as HTMLInputElement).value || el.title
  )
}

function byRole(root: Document | Element, role: string, rawName: string): HTMLElement | null {
  const name = normalize(rawName.replace(/\\(.)/g, '$1'))
  const candidates = [...root.querySelectorAll<HTMLElement>(ROLE_ELEMENTS[role] ?? `[role="${role}"]`)]
  const named = candidates.map((el) => ({ el, text: accessibleName(el) }))
  return (
    named.find((c) => c.text === name)?.el ??
    named.find((c) => c.text.startsWith(name))?.el ??
    named.find((c) => c.text.includes(name))?.el ??
    null
  )
}

export function isValidSelector(selector: string, root: Document | Element = document): boolean {
  if (ROLE_PATTERN.test(selector)) return true
  try {
    root.querySelector(selector)
    return true
  } catch {
    return false
  }
}

export function locate(selector: string, root: Document | Element = document): HTMLElement | null {
  const role = selector.match(ROLE_PATTERN)
  if (role) return byRole(root, role[1], role[2])
  try {
    return root.querySelector<HTMLElement>(selector)
  } catch {
    return null
  }
}
