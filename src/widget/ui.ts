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

  function appendMessage(html: string): void {
    const bubble = document.createElement('div')
    bubble.setAttribute('data-spotter-bubble', '')
    bubble.innerHTML = html
    messages.appendChild(bubble)
    messages.scrollTop = messages.scrollHeight
  }

  return {
    container,
    onSubmit(handler) { submitHandler = handler },
    showMessage(text) { appendMessage(text) },
    showSteps(steps) {
      const list = steps
        .map((s, i) => `${i + 1}. ${s.description}`)
        .join('<br>')
      appendMessage(list)
    },
    destroy() { container.remove() },
  }
}
