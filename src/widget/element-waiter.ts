export interface WaitOptions {
  timeoutMs?: number
  root?: Document | Element
}

function find(root: Document | Element, selector: string): HTMLElement | null {
  try {
    return root.querySelector<HTMLElement>(selector)
  } catch {
    return null
  }
}

function isValidSelector(root: Document | Element, selector: string): boolean {
  try {
    root.querySelector(selector)
    return true
  } catch {
    return false
  }
}

export function waitForElement(
  selector: string,
  { timeoutMs = 3000, root = document }: WaitOptions = {}
): Promise<HTMLElement | null> {
  const existing = find(root, selector)
  if (existing || !isValidSelector(root, selector)) return Promise.resolve(existing)

  return new Promise((resolve) => {
    const finish = (value: HTMLElement | null) => {
      clearTimeout(timer)
      observer.disconnect()
      resolve(value)
    }
    const observer = new MutationObserver(() => {
      const found = find(root, selector)
      if (found) finish(found)
    })
    const timer = setTimeout(() => finish(null), timeoutMs)
    observer.observe(root, { childList: true, subtree: true, attributes: true })
  })
}
