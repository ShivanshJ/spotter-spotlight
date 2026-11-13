import { createUI } from './ui'
import { NavigatorController } from './navigator'
import { sendQuery } from './client'
import type { SpotterQuery } from '../types'

export interface SpotterInitOptions {
  proxyUrl: string
  sessionToken?: () => string | undefined
  role?: string
  onUnhandled?: (query: string) => void
  spotterKey?: string
}

let ui: ReturnType<typeof createUI> | null = null
let navController: NavigatorController | null = null

export const Spotter = {
  init(options: SpotterInitOptions): void {
    if (ui) return

    ui = createUI()
    navController = new NavigatorController()
    document.body.appendChild(ui.container)

    ui.onSubmit(async (queryText) => {
      const body: SpotterQuery = {
        query: queryText,
        url: window.location.href,
        sessionToken: options.sessionToken?.(),
        role: options.role,
      }

      try {
        const response = await sendQuery(options.proxyUrl, body)

        if (response.type === 'navigate') {
          ui!.showSteps(response.steps)
          if (response.steps[0]) navController!.highlightStep(response.steps[0])
        } else if (response.type === 'answer') {
          ui!.showMessage(response.content)
        } else if (response.type === 'unhandled') {
          if (options.onUnhandled) {
            options.onUnhandled(queryText)
          } else {
            ui!.showMessage("I can only help with navigating this app.")
          }
        } else if (response.type === 'error') {
          ui!.showMessage("Something went wrong. Please try again.")
        }
      } catch {
        ui!.showMessage("Couldn't reach Spotter. Check your connection.")
      }
    })
  },

  destroy(): void {
    navController?.clear()
    ui?.destroy()
    ui = null
    navController = null
  },
}
