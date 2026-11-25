import { describe, it, expect } from 'vitest'
import { extractControls, extractSelectors, extractApiCalls, extractPageTitle } from './extract'

describe('extractSelectors', () => {
  it('extracts data-testid selectors', () => {
    const content = `<button data-testid="dark-mode-toggle">Toggle</button>`
    expect(extractSelectors(content)).toEqual({
      darkModeToggle: '[data-testid="dark-mode-toggle"]',
    })
  })

  it('extracts aria-label selectors', () => {
    const content = `<button aria-label="Close menu">X</button>`
    expect(extractSelectors(content)).toEqual({
      closeMenu: '[aria-label="Close menu"]',
    })
  })

  it('returns empty object when no selectors found', () => {
    expect(extractSelectors('<div>no selectors</div>')).toEqual({})
  })

  it('deduplicates when same key appears twice', () => {
    const content = `<a data-testid="submit-btn"></a><b data-testid="submit-btn"></b>`
    const result = extractSelectors(content)
    expect(Object.keys(result)).toHaveLength(1)
  })
})

describe('extractApiCalls', () => {
  it('extracts fetch calls starting with /api/', () => {
    const content = `fetch('/api/user/profile')`
    expect(extractApiCalls(content)).toEqual(['/api/user/profile'])
  })

  it('extracts axios calls starting with /api/', () => {
    const content = `axios.get('/api/rewards')`
    expect(extractApiCalls(content)).toEqual(['/api/rewards'])
  })

  it('ignores non-/api/ fetch calls', () => {
    expect(extractApiCalls(`fetch('https://cdn.example.com/image.png')`)).toEqual([])
  })

  it('deduplicates identical calls', () => {
    const content = `fetch('/api/user') \n fetch('/api/user')`
    expect(extractApiCalls(content)).toHaveLength(1)
  })
})

describe('extractPageTitle', () => {
  it('extracts title from Next.js metadata export', () => {
    const content = `export const metadata = { title: 'Appearance Settings' }`
    expect(extractPageTitle(content)).toBe('Appearance Settings')
  })

  it('extracts title from HTML title tag', () => {
    const content = `<title>Billing Page</title>`
    expect(extractPageTitle(content)).toBe('Billing Page')
  })

  it('returns undefined when no title found', () => {
    expect(extractPageTitle('<div>no title</div>')).toBeUndefined()
  })
})

describe('extractControls', () => {
  const page = `
    const [a, setA] = useState<string>('')
    return (<div>
      <Button variant="primary" onClick={() => setOpen(x => !x)}>Upgrade plan</Button>
      <button aria-label={"Close"} onClick={() => a > b}>X</button>
      <IconButton><TrashIcon /> Delete rule</IconButton>
      <Button>{t('save')}</Button>
      <Button>Save {count} items</Button>
      <button data-testid="dark-mode-toggle">Dark Mode</button>
      <DropdownMenuItem onSelect={() => go()}>Rename</DropdownMenuItem>
      <Tab value="a">Members</Tab>
      <p>Just text</p>
    </div>)`

  it('targets buttons, menu items and tabs by visible text when they have no test id', () => {
    const selectors = Object.fromEntries(extractControls(page).map(c => [c.key, c.selector]))
    expect(selectors).toEqual({
      upgradePlanButton: 'role=button[name="Upgrade plan"]',
      close: '[aria-label="Close"]',
      deleteRuleButton: 'role=button[name="Delete rule"]',
      darkModeToggle: '[data-testid="dark-mode-toggle"]',
      renameMenuitem: 'role=menuitem[name="Rename"]',
      membersTab: 'role=tab[name="Members"]',
    })
  })

  it('labels each control with what the user sees', () => {
    const labels = extractControls(page).map(c => c.label)
    expect(labels).toContain('Upgrade plan')
    expect(labels).toContain('Close')
  })
})
