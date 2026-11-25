import { isValidSelector, locate } from './locate'

export interface WaitOptions {
  timeoutMs?: number
  root?: Document | Element
}

export function waitForElement(
  selector: string,
  { timeoutMs = 3000, root = document }: WaitOptions = {}
): Promise<HTMLElement | null> {
  const existing = locate(selector, root)
  if (existing || !isValidSelector(selector, root)) return Promise.resolve(existing)

  return new Promise((resolve) => {
    const finish = (value: HTMLElement | null) => {
      clearTimeout(timer)
      observer.disconnect()
      resolve(value)
    }
    const observer = new MutationObserver(() => {
      const found = locate(selector, root)
      if (found) finish(found)
    })
    const timer = setTimeout(() => finish(null), timeoutMs)
    observer.observe(root, { childList: true, subtree: true, attributes: true })
  })
}
