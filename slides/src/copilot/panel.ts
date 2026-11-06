// SPDX-License-Identifier: MIT
/**
 * Painel do copilot: um botão na barra abre esta janela flutuante; ela guarda a
 * chave do OmniRoute no browser, mostra atalhos e aplica o deck devolvido pelo
 * modelo no editor aberto (window.bento.loadDoc).
 *
 * Textos em português direto, sem `t()`: o catálogo de i18n é por string-chave e
 * uma chave nova exigiria tradução nos 8 catálogos — o painel é uma adição
 * local, não uma string do produto para traduzir.
 */
import { askCopilot, loadSettings, saveSettings, type CopilotSettings } from './client'

const QUICK: Array<{ label: string; prompt: string; useCurrent: boolean }> = [
  { label: 'Novo deck a partir de um tema', prompt: 'Crie um deck de 5 slides sobre ', useCurrent: false },
  { label: 'Adicionar um slide', prompt: 'Adicione um slide ao final resumindo os pontos principais em 3 bullets.', useCurrent: true },
  { label: 'Melhorar os textos', prompt: 'Reescreva os textos do deck para ficarem mais diretos e comerciais, sem mudar o layout.', useCurrent: true },
  { label: 'Deixar mais visual', prompt: 'Deixe o deck mais visual: destaque os números, use os acentos da marca e reduza o texto por slide.', useCurrent: true },
]

let panel: HTMLElement | null = null
let controller: AbortController | null = null

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  return node
}

const status = (text: string, kind: 'info' | 'ok' | 'err' = 'info'): void => {
  const box = panel?.querySelector<HTMLElement>('.nhc-status')
  if (!box) return
  box.textContent = text
  box.dataset.kind = kind
}

export function closeCopilot(): void {
  controller?.abort()
  panel?.remove()
  panel = null
}

/** Abre (ou fecha) o painel do copilot. */
export function toggleCopilot(): void {
  if (panel) {
    closeCopilot()
    return
  }
  const settings = loadSettings()
  const root = el('div', 'nhc')
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-label', 'Copilot de slides')

  // ── cabeçalho ────────────────────────────────────────────────────────────
  const head = el('div', 'nhc-head')
  const title = el('div', 'nhc-title')
  title.innerHTML = '<span class="nhc-ring" aria-hidden="true"></span><b>Copilot</b><span class="nhc-sub">OmniRoute</span>'
  const gear = el('button', 'nhc-icon')
  gear.type = 'button'
  gear.title = 'Configurar OmniRoute'
  gear.textContent = '⚙'
  const close = el('button', 'nhc-icon')
  close.type = 'button'
  close.title = 'Fechar'
  close.textContent = '×'
  close.addEventListener('click', closeCopilot)
  head.append(title, gear, close)

  // ── configurações ────────────────────────────────────────────────────────
  const settingsBox = el('form', 'nhc-settings')
  settingsBox.hidden = true
  const mk = (label: string, type: string, value: string, placeholder = ''): HTMLInputElement => {
    const wrap = el('label', 'nhc-field')
    wrap.textContent = label
    const input = el('input', 'nhc-input')
    input.type = type
    input.value = value
    input.placeholder = placeholder
    input.autocomplete = 'off'
    wrap.appendChild(input)
    settingsBox.appendChild(wrap)
    return input
  }
  const keyInput = mk('Chave do OmniRoute', 'password', settings.apiKey, 'sk-…')
  const modelInput = mk('Modelo', 'text', settings.model, 'auto')
  const baseInput = mk('Endpoint', 'text', settings.baseUrl, 'https://api-tokens.nohumans.com.br')
  const saveBtn = el('button', 'nhc-primary')
  saveBtn.type = 'submit'
  saveBtn.textContent = 'Salvar'
  settingsBox.appendChild(saveBtn)
  const hint = el('p', 'nhc-hint')
  hint.innerHTML = 'A chave fica só neste navegador. Gere em <a href="https://router.nohumans.com.br" target="_blank" rel="noopener">router.nohumans.com.br</a> → API Keys.'
  settingsBox.appendChild(hint)
  settingsBox.addEventListener('submit', (ev) => {
    ev.preventDefault()
    const next: CopilotSettings = {
      apiKey: keyInput.value.trim(),
      model: modelInput.value.trim() || 'auto',
      baseUrl: baseInput.value.trim() || settings.baseUrl,
    }
    saveSettings(next)
    settingsBox.hidden = true
    status(next.apiKey ? 'Configuração salva.' : 'Sem chave: o copilot não consegue falar com o OmniRoute.', next.apiKey ? 'ok' : 'err')
  })
  gear.addEventListener('click', () => {
    settingsBox.hidden = !settingsBox.hidden
    if (!settingsBox.hidden) keyInput.focus()
  })

  // ── atalhos ──────────────────────────────────────────────────────────────
  const chips = el('div', 'nhc-chips')
  const promptBox = el('textarea', 'nhc-prompt')
  promptBox.placeholder = 'O que você quer no deck? Ex.: “5 slides de proposta comercial para uma agência, com preço e CTA”'
  promptBox.rows = 3

  for (const quick of QUICK) {
    const chip = el('button', 'nhc-chip')
    chip.type = 'button'
    chip.textContent = quick.label
    chip.addEventListener('click', () => {
      promptBox.value = quick.prompt
      useCurrent.checked = quick.useCurrent
      promptBox.focus()
      promptBox.selectionStart = promptBox.value.length
    })
    chips.appendChild(chip)
  }

  // ── rodapé ───────────────────────────────────────────────────────────────
  const foot = el('div', 'nhc-foot')
  const useCurrent = el('input') as HTMLInputElement
  useCurrent.type = 'checkbox'
  useCurrent.checked = true
  const useLabel = el('label', 'nhc-check')
  useLabel.append(useCurrent, document.createTextNode(' usar o deck aberto'))
  const run = el('button', 'nhc-primary')
  run.type = 'button'
  run.textContent = 'Gerar'
  foot.append(useLabel, run)

  const box = el('div', 'nhc-status')
  box.textContent = loadSettings().apiKey ? 'Pronto.' : 'Cole sua chave do OmniRoute (⚙) para começar.'

  // ── ação ─────────────────────────────────────────────────────────────────
  const go = async (): Promise<void> => {
    const prompt = promptBox.value.trim()
    if (!prompt) {
      status('Escreva o que você quer.', 'err')
      promptBox.focus()
      return
    }
    if (!loadSettings().apiKey) {
      settingsBox.hidden = false
      keyInput.focus()
      status('Falta a chave do OmniRoute.', 'err')
      return
    }
    controller?.abort()
    controller = new AbortController()
    run.disabled = true
    run.textContent = 'Gerando…'
    status(useCurrent.checked ? 'Lendo o deck aberto e pedindo ao OmniRoute…' : 'Pedindo um deck novo ao OmniRoute…')
    try {
      const reply = await askCopilot(prompt, loadSettings(), { useCurrent: useCurrent.checked, signal: controller.signal })
      if (reply.ok && reply.applied) {
        status(`Aplicado: ${reply.applied.slides} slide(s) · “${reply.applied.title}”. Ctrl+Z desfaz.`, 'ok')
      } else {
        status(reply.error ?? 'Não deu para aplicar o que o modelo devolveu.', 'err')
        if (reply.text) {
          const pre = el('pre', 'nhc-raw')
          pre.textContent = reply.text.slice(0, 1500)
          box.after(pre)
        }
      }
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError'
      status(aborted ? 'Cancelado.' : `Falhou: ${err instanceof Error ? err.message : String(err)}`, aborted ? 'info' : 'err')
    } finally {
      run.disabled = false
      run.textContent = 'Gerar'
    }
  }
  run.addEventListener('click', () => void go())
  promptBox.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') void go()
  })

  root.append(head, settingsBox, chips, promptBox, foot, box)
  document.body.appendChild(root)
  panel = root
  promptBox.focus()
}
