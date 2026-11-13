import type { NavigateStep } from '../types'

export interface UIController {
  container: HTMLElement
  onSubmit: (handler: (query: string) => void) => void
  showMessage: (text: string) => void
  showSteps: (steps: NavigateStep[]) => void
  destroy: () => void
}

export function createUI(): UIController {
  const container = document.createElement('div')
  container.setAttribute('data-spotter-root', '')

  const toggle = document.createElement('button')
  toggle.setAttribute('data-spotter-toggle', '')
  toggle.textContent = '✦ Ask Spotter'

  const panel = document.createElement('div')
  panel.setAttribute('data-spotter-panel', '')

  const messages = document.createElement('div')
  messages.setAttribute('data-spotter-messages', '')

  const form = document.createElement('form')
  form.setAttribute('data-spotter-form', '')

  const input = document.createElement('input')
  input.setAttribute('data-spotter-input', '')
  input.placeholder = 'Ask anything...'
  input.autocomplete = 'off'

  const submit = document.createElement('button')
  submit.type = 'submit'
  submit.textContent = '→'

  form.appendChild(input)
  form.appendChild(submit)
  panel.appendChild(messages)
  panel.appendChild(form)
  container.appendChild(toggle)
  container.appendChild(panel)

  toggle.addEventListener('click', () => {
    const isOpen = panel.getAttribute('data-open') === 'true'
    panel.setAttribute('data-open', isOpen ? 'false' : 'true')
  })

  let submitHandler: ((query: string) => void) | null = null

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const query = input.value.trim()
    if (!query) return
    input.value = ''
    submitHandler?.(query)
  })

  function appendBubble(node: Node): void {
    const bubble = document.createElement('div')
    bubble.setAttribute('data-spotter-bubble', '')
    bubble.appendChild(node)
    messages.appendChild(bubble)
    messages.scrollTop = messages.scrollHeight
  }

  return {
    container,
    onSubmit(handler) { submitHandler = handler },
    showMessage(text) {
      const span = document.createElement('span')
      span.textContent = text
      appendBubble(span)
    },
    showSteps(steps) {
      const ol = document.createElement('ol')
      steps.forEach((s) => {
        const li = document.createElement('li')
        li.textContent = s.description
        ol.appendChild(li)
      })
      appendBubble(ol)
    },
    destroy() { container.remove() },
  }
}
