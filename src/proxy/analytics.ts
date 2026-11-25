export type SpotterEvent = {
  type: 'query'
  query: string
  responseType: 'navigate' | 'answer' | 'unhandled' | 'error'
  url: string
  role?: string
  error?: string  // set when the LLM call failed, e.g. a bad key or model name
}

export type AnalyticsHandler = (event: SpotterEvent) => void

export const noopAnalytics: AnalyticsHandler = () => {}
