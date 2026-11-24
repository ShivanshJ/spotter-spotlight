import { createUI } from './ui'
import { NavigatorController } from './navigator'
import { sendQuery } from './client'
import { createFlowStore } from './flow-store'
import { waitForElement } from './element-waiter'
import { createFlowRunner } from './flow-runner'
import type { FlowEvent, FlowLocation, FlowMode, FlowRunner } from './flow-runner'
import type { SpotterQuery } from '../types'

export interface SpotterInitOptions {
  proxyUrl: string
  sessionToken?: () => string | undefined
  role?: string
  onUnhandled?: (query: string) => void
  mode?: FlowMode
  onFlowEvent?: (event: FlowEvent) => void
}

export interface SpotterEnvironment {
  location: FlowLocation
  now: () => number
  waitTimeoutMs?: number
}

interface Instance {
  ui: ReturnType<typeof createUI>
  navigator: NavigatorController
  runner: FlowRunner
}

function safely(handler: ((event: FlowEvent) => void) | undefined): (event: FlowEvent) => void {
  return (event) => {
    try {
      handler?.(event)
    } catch {
      return
    }
  }
}

function buildRunner(options: SpotterInitOptions, navigator: NavigatorController, env: SpotterEnvironment): FlowRunner {
  return createFlowRunner({
    highlighter: navigator,
    store: createFlowStore(),
    waitForElement: (selector) => waitForElement(selector, { timeoutMs: env.waitTimeoutMs }),
    location: env.location,
    mode: options.mode ?? 'guided',
    onEvent: safely(options.onFlowEvent),
    now: env.now,
  })
}

function handleSubmit(instance: Instance, options: SpotterInitOptions): (queryText: string) => Promise<void> {
  const { ui, runner } = instance
  return async (queryText) => {
    const body: SpotterQuery = {
      query: queryText,
      url: window.location.href,
      sessionToken: options.sessionToken?.(),
      role: options.role,
    }

    try {
      const response = await sendQuery(options.proxyUrl, body)

      if (response.type === 'navigate') {
        ui.showSteps(response.steps)
        void runner.start(response.steps)
      } else if (response.type === 'answer') {
        ui.showMessage(response.content)
      } else if (response.type === 'unhandled') {
        if (options.onUnhandled) {
          options.onUnhandled(queryText)
        } else {
          ui.showMessage("I can only help with navigating this app.")
        }
      } else if (response.type === 'error') {
        ui.showMessage("Something went wrong. Please try again.")
      }
    } catch {
      ui.showMessage("Couldn't reach Spotter. Check your connection.")
    }
  }
}

export function createSpotter(getEnvironment: () => SpotterEnvironment) {
  let instance: Instance | null = null

  return {
    init(options: SpotterInitOptions): void {
      if (instance) return

      const navigator = new NavigatorController()
      const runner = buildRunner(options, navigator, getEnvironment())
      const ui = createUI()
      instance = { ui, navigator, runner }
      document.body.appendChild(ui.container)

      ui.onSubmit(handleSubmit(instance, options))
      void runner.resume()
    },

    destroy(): void {
      instance?.runner.cancel()
      instance?.navigator.clear()
      instance?.ui.destroy()
      instance = null
    },
  }
}
