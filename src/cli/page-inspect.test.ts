import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fsp from 'fs/promises'
import os from 'os'
import path from 'path'
import { inspectPages, isResourceOnly } from './page-inspect'

let dir: string

async function write(file: string, content: string) {
  await fsp.mkdir(path.dirname(path.join(dir, file)), { recursive: true })
  await fsp.writeFile(path.join(dir, file), content)
}

beforeEach(async () => { dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'spotter-inspect-')) })
afterEach(async () => { await fsp.rm(dir, { recursive: true, force: true }) })

function route(p: string, file: string) {
  return { path: p, componentFile: path.join(dir, file), selectors: {}, apiCalls: [] }
}

describe('inspectPages', () => {
  it('collects controls from the page and the components it imports', async () => {
    await write('app/routes/billing.tsx', `
      import { PlanCard } from '~/components/plan-card'
      import { formatMoney } from '~/lib/money'
      export default function Billing() { return <PlanCard /> }`)
    await write('app/components/plan-card.tsx', `
      import { InvoiceList } from './invoice-list'
      export function PlanCard() { return <div><Button>Change plan</Button><InvoiceList /></div> }`)
    await write('app/components/invoice-list.tsx', `
      export function InvoiceList() { return <button aria-label="Download invoice">↓</button> }`)
    await write('app/lib/money.ts', 'export const formatMoney = (n: number) => String(n)')

    const [billing] = inspectPages([route('/billing', 'app/routes/billing.tsx')], dir)
    expect(billing.files.map(f => path.relative(dir, f))).toEqual([
      'app/routes/billing.tsx', 'app/components/plan-card.tsx', 'app/components/invoice-list.tsx',
    ])
    expect(billing.selectors).toEqual({
      changePlanButton: 'role=button[name="Change plan"]',
      downloadInvoice: '[aria-label="Download invoice"]',
    })
  })

  it('leaves out components shared by most pages', async () => {
    await write('app/components/nav.tsx', 'export function Nav() { return <Button>Log out</Button> }')
    for (const name of ['a', 'b', 'c', 'd']) {
      await write(`app/routes/${name}.tsx`, `import { Nav } from '../components/nav'\nexport default () => <><Nav /><Button>Do ${name}</Button></>`)
    }
    const routes = inspectPages(['a', 'b', 'c', 'd'].map(n => route(`/${n}`, `app/routes/${n}.tsx`)), dir)
    expect(Object.keys(routes[0].selectors)).toEqual(['doAButton'])
  })

  it('flags resource routes', async () => {
    expect(isResourceOnly('export async function action({ request }) { return null }')).toBe(true)
    expect(isResourceOnly('export const loader = () => null')).toBe(true)
    expect(isResourceOnly('export const loader = () => null\nexport default function P() {}')).toBe(false)
    expect(isResourceOnly('export default function P() {}')).toBe(false)
  })
})
