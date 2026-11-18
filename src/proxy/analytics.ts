export type SpotterEvent = {
  type: 'query'
  query: string
  responseType: 'navigate' | 'answer' | 'unhandled' | 'error'
  url: string
  role?: string
}

export type AnalyticsHandler = (event: SpotterEvent) => void

export const noopAnalytics: AnalyticsHandler = () => {}
