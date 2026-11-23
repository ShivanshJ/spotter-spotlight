function ancestorPaths(routePath: string): string[] {
  const segments = routePath.split('/').filter(Boolean)
  return segments
    .slice(0, -1)
    .map((_, index) => '/' + segments.slice(0, segments.length - 1 - index).join('/'))
}

export function deriveReachableFrom(paths: string[]): Map<string, string[]> {
  const known = new Set(paths)
  const reachable = new Map<string, string[]>()
  for (const routePath of paths) {
    const parent = ancestorPaths(routePath).find((ancestor) => known.has(ancestor))
    if (parent) reachable.set(routePath, [parent])
  }
  return reachable
}
