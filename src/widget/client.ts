import type { SpotterQuery, SpotterResponse } from '../types'

export async function sendQuery(proxyUrl: string, body: SpotterQuery): Promise<SpotterResponse> {
  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Spotter proxy error: ${res.status}`)
  return res.json() as Promise<SpotterResponse>
}
