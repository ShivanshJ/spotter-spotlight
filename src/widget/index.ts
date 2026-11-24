import { createSpotter } from './spotter'

export type { SpotterInitOptions } from './spotter'
export type { FlowEvent } from './flow-runner'

export const Spotter = createSpotter(() => ({
  location: window.location,
  now: () => Date.now(),
}))
