export function extractSelectors(content: string): Record<string, string> {
  const selectors: Record<string, string> = {}
  for (const match of content.matchAll(/data-testid=["']([^"']+)["']/g)) {
    selectors[toCamelCase(match[1])] = `[data-testid="${match[1]}"]`
  }
  for (const match of content.matchAll(/aria-label=["']([^"']+)["']/g)) {
    selectors[toCamelCase(match[1])] = `[aria-label="${match[1]}"]`
  }
  return selectors
}

export function extractApiCalls(content: string): string[] {
  const calls: string[] = []
  for (const match of content.matchAll(/fetch\(['"]([^'"]+)['"]/g)) {
    if (match[1].startsWith('/api/')) calls.push(match[1])
  }
  for (const match of content.matchAll(/axios\.\w+\(['"]([^'"]+)['"]/g)) {
    if (match[1].startsWith('/api/')) calls.push(match[1])
  }
  return [...new Set(calls)]
}

export function extractPageTitle(content: string): string | undefined {
  const metadataMatch = content.match(/title:\s*["']([^"']+)["']/)
  if (metadataMatch) return metadataMatch[1]
  const titleTagMatch = content.match(/<title>([^<]+)<\/title>/)
  if (titleTagMatch) return titleTagMatch[1]
  return undefined
}

function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toLowerCase())
}
