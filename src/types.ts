import { z } from 'zod'

export const PageActionSchema = z.object({
  name: z.string(),
  description: z.string(),
  selector: z.string(),
})

export const RouteSchema = z.object({
  path: z.string(),
  description: z.string(),
  title: z.string().optional(),
  reachableFrom: z.array(z.string()).optional(),
  actions: z.array(PageActionSchema).optional(),
  selectors: z.record(z.string()).default({}),
  role: z.string().optional(),
})

export const ActionSchema = z.object({
  intent: z.string(),
  type: z.literal('api'),
  endpoint: z.string(),
  auth: z.literal('session'),
  role: z.string().optional(),
})

export const MCPServerSchema = z.object({
  url: z.string().url(),
  allowedTools: z.array(z.string()).optional(),
})

export const SpotterConfigSchema = z.object({
  version: z.literal('1'),
  routes: z.array(RouteSchema),
  actions: z.array(ActionSchema),
  mcpServers: z.array(MCPServerSchema).default([]),
})

export type Route = z.infer<typeof RouteSchema>
export type PageAction = z.infer<typeof PageActionSchema>
export type Action = z.infer<typeof ActionSchema>
export type MCPServer = z.infer<typeof MCPServerSchema>
export type SpotterConfig = z.infer<typeof SpotterConfigSchema>

export type NavigateStep = {
  selector: string
  description: string
  interactionType: 'click' | 'expand' | 'none'
}

export type SpotterQuery = {
  query: string
  url: string
  sessionToken?: string
  role?: string
}

export type SpotterResponse =
  | { type: 'navigate'; steps: NavigateStep[] }
  | { type: 'answer'; content: string }
  | { type: 'unhandled'; query: string }
  | { type: 'error'; message: string }
