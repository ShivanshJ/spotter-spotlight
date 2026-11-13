import type { NavigateStep } from '../types'

export class NavigatorController {
  private overlay: HTMLElement | null = null
  private tooltip: HTMLElement | null = null
  private completeHandler: (() => void) | null = null
  private clickHandler: (() => void) | null = null
  private currentTarget: HTMLElement | null = null

  onComplete(handler: () => void): void {
    this.completeHandler = handler
  }

  highlightStep(step: NavigateStep): void {
    this.clear()
    const target = document.querySelector<HTMLElement>(step.selector)
    if (!target) return

    this.currentTarget = target
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })

    const rect = target.getBoundingClientRect()
    const scrollX = window.scrollX
    const scrollY = window.scrollY

    this.overlay = document.createElement('div')
    this.overlay.setAttribute('data-spotter-overlay', '')
    Object.assign(this.overlay.style, {
      position: 'absolute',
      top: `${rect.top + scrollY - 4}px`,
      left: `${rect.left + scrollX - 4}px`,
      width: `${rect.width + 8}px`,
      height: `${rect.height + 8}px`,
      pointerEvents: 'none',
      zIndex: '999998',
    })
    document.body.appendChild(this.overlay)

    this.tooltip = document.createElement('div')
    this.tooltip.setAttribute('data-spotter-tooltip', '')
    this.tooltip.textContent = step.description
    Object.assign(this.tooltip.style, {
      position: 'absolute',
      top: `${rect.bottom + scrollY + 8}px`,
      left: `${rect.left + scrollX}px`,
      zIndex: '999999',
    })
    document.body.appendChild(this.tooltip)

    this.clickHandler = () => {
      this.clear()
      this.completeHandler?.()
    }
    target.addEventListener('click', this.clickHandler, { once: true })
  }

  clear(): void {
    this.overlay?.remove()
    this.tooltip?.remove()
    this.overlay = null
    this.tooltip = null
    if (this.currentTarget && this.clickHandler) {
      this.currentTarget.removeEventListener('click', this.clickHandler)
    }
    this.currentTarget = null
    this.clickHandler = null
  }
}
