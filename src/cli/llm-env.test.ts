import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fsp from 'fs/promises'
import os from 'os'
import path from 'path'
import { parseDotenv, resolveLLMSettings } from './llm-env'

let dir: string
beforeEach(async () => { dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'spotter-env-')) })
afterEach(async () => { await fsp.rm(dir, { recursive: true, force: true }) })

describe('parseDotenv', () => {
  it('reads quoted, exported and commented values', () => {
    expect(parseDotenv('export A="x y"\nB=z # note\n# C=no\nD=\'q\'')).toEqual({ A: 'x y', B: 'z', D: 'q' })
  })
})

describe('resolveLLMSettings', () => {
  it('prefers the environment, then .env files up to the repo root', async () => {
    const app = path.join(dir, 'apps', 'web')
    await fsp.mkdir(app, { recursive: true })
    await fsp.mkdir(path.join(dir, '.git'))
    await fsp.writeFile(path.join(dir, '.env'), 'OPENAI_API_KEY=from-root\nSPOTTER_LLM_MODEL=m1\nOTHER_SECRET=x')
    const fromFile = resolveLLMSettings(app, {})
    expect(fromFile.config).toEqual({ apiKey: 'from-root', baseURL: undefined, model: 'm1' })
    expect(fromFile.keySource).toContain('OPENAI_API_KEY in')
    expect(resolveLLMSettings(app, { OPENAI_API_KEY: 'env' }).config?.apiKey).toBe('env')
    expect(resolveLLMSettings(app, { SPOTTER_LLM_API_KEY: 'sp', OPENAI_API_KEY: 'oa' }).config?.apiKey).toBe('sp')
    expect(resolveLLMSettings(app, {}, 'override').config?.model).toBe('override')
  })

  it('returns no config without a key', () => {
    expect(resolveLLMSettings(dir, {}).config).toBeNull()
  })
})
