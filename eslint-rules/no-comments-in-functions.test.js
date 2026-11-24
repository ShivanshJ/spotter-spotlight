import { describe, it, expect } from 'vitest'
import { Linter } from 'eslint'
import rule from './no-comments-in-functions.js'

const linter = new Linter()
const config = [{ plugins: { spotter: { rules: { r: rule } } }, rules: { 'spotter/r': 'error' } }]

function lint(code) {
  return linter.verify(code, config)
}

describe('no-comments-in-functions', () => {
  it('allows comments outside functions', () => {
    expect(lint('// header\nfunction a() { return 1 }\n/* footer */')).toHaveLength(0)
  })

  it('reports a line comment inside a function declaration', () => {
    expect(lint('function a() {\n  // why\n  return 1\n}')).toHaveLength(1)
  })

  it('reports a block comment inside an arrow function', () => {
    expect(lint('const a = () => {\n  /* why */\n  return 1\n}')).toHaveLength(1)
  })

  it('reports comments inside methods and nested functions', () => {
    const code = 'const o = { m() {\n  const f = () => {\n    // nested\n    return 1\n  }\n  return f()\n} }'
    expect(lint(code)).toHaveLength(1)
  })

  it('does not report a comment between two functions', () => {
    expect(lint('function a() { return 1 }\n// between\nfunction b() { return 2 }')).toHaveLength(0)
  })
})
