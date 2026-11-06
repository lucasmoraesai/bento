// SPDX-License-Identifier: MIT
/**
 * Copilot de slides: fala com o OmniRoute (gateway OpenAI-compatible da
 * nohumans) e aplica o documento devolvido no editor aberto.
 *
 * O deck é JSON puro dentro do arquivo (bloco #bento-doc), e o runtime expõe
 * `window.bento.loadDoc()`, `compact()` e `validate()` — então o modelo edita o
 * deck devolvendo o documento COMPLETO em forma compacta, e nada aqui precisa
 * entender o editor.
 *
 * A chave do OmniRoute é de quem usa, guardada no localStorage deste browser
 * (nunca no bundle, nunca no repositório). O endpoint público aceita CORS para
 * clientes no browser — é o mesmo caminho que o playground do OmniRoute usa.
 */
export interface CopilotSettings {
  baseUrl: string
  apiKey: string
  model: string
}

const STORE_KEY = 'nh-copilot-settings'
const DEFAULTS: CopilotSettings = {
  baseUrl: 'https://api-tokens.nohumans.com.br',
  apiKey: '',
  model: 'auto',
}

export const loadSettings = (): CopilotSettings => {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<CopilotSettings>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

export const saveSettings = (settings: CopilotSettings): void => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings))
  } catch {
    /* origem opaca (file://) — só não persiste */
  }
}

/** O que o modelo precisa saber para escrever um deck que o runtime aceite. */
const SYSTEM_PROMPT = `Você é o copilot de slides do editor "nohumans slide" (formato bento/slides).
Responda SEMPRE com um único objeto JSON válido — sem markdown, sem texto fora do JSON.

Formato (compacto):
{"compact": true, "title": "<título do deck>", "slides": [
  {"id": "s1", "elements": [
    {"type": "text", "x": 88, "y": 96, "w": 1100, "h": "auto", "html": "Título", "fontSize": 64, "fontWeight": 800, "color": "#FFFFFF", "align": "left"},
    {"type": "shape", "shape": "rect", "x": 88, "y": 200, "w": 400, "h": 2, "fill": "#00E5FF"}
  ]}
]}

Regras técnicas:
- Canvas 1280×720. Mantenha margem de 88px nas laterais.
- Elementos: text, shape, image, svg, chart, table. Em text, "h" pode ser "auto" (o runtime mede).
- Em shape, "shape" é "rect" | "ellipse" | "line". "radius" e "fill" são pixels/cor.
- "id" é opcional (o runtime gera). Não invente campos fora deste formato.
- Quando o pedido for uma alteração pontual, devolva o documento COMPLETO já alterado, preservando o que não foi pedido.

Identidade visual da nohumans: fundo #0A0A0A, texto #FFFFFF, secundário #9AA0A8,
acentos #00E5FF (ciano), #FF2EC4 (magenta), #A3FF12 (lima). Tipografia sem serifa, títulos pesados.
Escreva em português do Brasil, direto, sem enrolação.`

const stripFences = (text: string): string =>
  text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

/** Acha o objeto JSON na resposta, mesmo que o modelo tenha escrito algo antes. */
export function extractDocument(text: string): string | null {
  const clean = stripFences(text)
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  const candidate = clean.slice(start, end + 1)
  try {
    const parsed = JSON.parse(candidate) as { slides?: unknown; compact?: unknown }
    if (!parsed || typeof parsed !== 'object') return null
    if (!Array.isArray((parsed as { slides?: unknown }).slides)) return null
    return candidate
  } catch {
    return null
  }
}

export interface CopilotReply {
  ok: boolean
  /** Texto cru do modelo, para mostrar quando não deu para aplicar. */
  text: string
  /** Documento aplicado, quando deu certo. */
  applied?: { slides: number; title: string }
  error?: string
}

/** Uma chamada ao OmniRoute (OpenAI-compatible). */
async function chat(settings: CopilotSettings, messages: Array<{ role: string; content: string }>, signal?: AbortSignal): Promise<string> {
  const url = `${settings.baseUrl.replace(/\/$/, '')}/v1/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${settings.apiKey}`,
      // Roteamento automático do OmniRoute: categoria e origem aparecem no painel dele.
      'x-auto-categoria': 'design',
      'x-auto-origem': 'nohumans-slide-copilot',
    },
    body: JSON.stringify({ model: settings.model || 'auto', messages, temperature: 0.4, max_tokens: 8000 }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OmniRoute ${res.status}${body ? `: ${body.slice(0, 300)}` : ''}`)
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new Error('resposta vazia do modelo')
  return content
}

/** O documento aberto, em forma compacta (é o que o modelo lê). */
function currentDocument(): string {
  const bento = (window as any).bento
  if (!bento || typeof bento.compact !== 'function') throw new Error('editor não exposto em window.bento')
  return bento.compact() as string
}

export interface AskOptions {
  /** `true`: o pedido parte do deck aberto; `false`: começa um deck novo. */
  useCurrent: boolean
  signal?: AbortSignal
}

/** Pede ao modelo e aplica o resultado no editor. */
export async function askCopilot(prompt: string, settings: CopilotSettings, opts: AskOptions): Promise<CopilotReply> {
  if (!settings.apiKey) return { ok: false, text: '', error: 'cole sua chave do OmniRoute nas configurações do copilot' }
  const current = opts.useCurrent ? currentDocument() : ''
  const user = opts.useCurrent
    ? `Pedido: ${prompt}\n\nDocumento atual (compacto):\n${current}`
    : `Pedido: ${prompt}\n\nCrie um documento novo do zero.`
  let text: string
  try {
    text = await chat(
      settings,
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      opts.signal,
    )
  } catch (err) {
    return { ok: false, text: '', error: err instanceof Error ? err.message : String(err) }
  }

  const doc = extractDocument(text)
  if (!doc) return { ok: false, text, error: 'o modelo não devolveu um documento JSON válido' }

  const bento = (window as any).bento
  if (!bento || typeof bento.loadDoc !== 'function') return { ok: false, text: doc, error: 'editor não exposto em window.bento' }
  const report = bento.loadDoc(doc)
  if (!report) return { ok: false, text: doc, error: 'o runtime recusou o documento' }

  const state = (window as any).bento.doc as { title?: string; slides?: unknown[] } | undefined
  return {
    ok: true,
    text,
    applied: { slides: state?.slides?.length ?? 0, title: state?.title ?? '' },
  }
}
