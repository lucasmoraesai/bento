/**
 * Password gate for slides.nohumans.com.br.
 *
 * WHY. The deck carries the commercial offer (price, SLA, scope) and the user
 * asked for a login+password in front of it. Vercel's own Password Protection
 * is not sold on the Hobby plan, so this is the DIY equivalent: Vercel Routing
 * Middleware (framework-agnostic, runs before the static shell), a scrypt hash
 * in an env var, and a signed cookie that unlocks once.
 *
 * WHAT IT IS NOT. A shared password is a speed bump, not access control: no
 * per-user identity, no audit trail, no rate limiting. Fine for a deck; not
 * fine for anything behind which real accounts or data live.
 *
 * CONFIG (Vercel env, Production): DEPLOY_GATE_PASSWORD_HASH — `s2:<salt>:<hex>`
 * from `node nohumans/hash-password.mjs`. Only the hash is ever stored; the
 * plaintext never reaches this repo, a file or a log.
 *
 * Unset/malformed config FAILS CLOSED (503): this gate is deliberate, so a
 * missing secret must not silently publish the deck.
 */
import { next } from '@vercel/functions'
import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto'

const COOKIE_NAME = 'nh_slide'
const UNLOCK_PATH = '/__unlock'
const NEXT_PARAM = 'from'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // one year — "unlock once, stays in"
// Bounds the scrypt input on unlock POSTs (its PBKDF2 pre-hash scales with
// input length). hash-password.mjs enforces the same cap.
const MAX_PASSWORD_LENGTH = 256
// scrypt cost — memory-hard, paid only on unlock attempts, never per request.
const SCRYPT = { N: 16384, r: 8, p: 1 } as const

type Hash = { salt: string; hash: string }

let cached: Hash | 'malformed' | 'absent' | undefined
const gateConfig = (): Hash | 'malformed' | 'absent' => {
  if (cached !== undefined) return cached
  const raw = process.env.DEPLOY_GATE_PASSWORD_HASH
  if (raw === undefined || raw.trim() === '') {
    cached = raw === undefined ? 'absent' : 'malformed'
    return cached
  }
  const m = /^s2:([0-9a-f]+):([0-9a-f]{64})$/i.exec(raw.trim())
  cached = m ? { salt: m[1], hash: m[2].toLowerCase() } : 'malformed'
  return cached
}

const hashPassword = (salt: string, password: string): string =>
  scryptSync(password, salt, 32, SCRYPT).toString('hex')

const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

/** The unlock cookie is an HMAC keyed on the stored hash: rotating the password
 *  revokes every cookie it issued, with no second secret to keep in sync. */
const mintCookie = (hash: Hash): string => createHmac('sha256', hash.hash).update('nh-slide:unlocked:v1').digest('hex')

const cookieHeader = (value: string, secure: boolean): string =>
  `${COOKIE_NAME}=${value}; Max-Age=${COOKIE_MAX_AGE}; Path=/; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax`

const getCookie = (request: Request): string | null => {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq !== -1 && part.slice(0, eq).trim() === COOKIE_NAME) return part.slice(eq + 1).trim()
  }
  return null
}

/** Same-origin relative paths only — `//host` and `\` are protocol-relative in
 *  a browser, and control characters survive the URL parser's normalisation. */
const safeFrom = (raw: string | null): string => {
  if (raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\') && !/[\u0000-\u001f\u007f]/.test(raw)) return raw
  return '/'
}

const escapeHtml = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** The unlock screen — nohumans palette, pt-BR, phone-first. */
function unlockPage(from: string, failed: boolean): string {
  const action = `${UNLOCK_PATH}?${NEXT_PARAM}=${encodeURIComponent(from)}`
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex, nofollow" />
<meta name="color-scheme" content="dark" />
<title>nohumans slide — acesso</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;
       background:#0a0a0a;color:#ededed;
       font:400 16px/1.5 'Instrument Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  main{width:min(360px,100%)}
  .word{display:flex;align-items:center;gap:12px;margin:0 0 34px}
  .mark{display:grid;grid-template-columns:10px 1fr;grid-template-rows:22px 22px;gap:4px;width:26px;height:48px}
  .mark i{border-radius:5px}
  .m1{grid-row:1/3;background:#00e5ff}
  .m2{background:#ff2ec4}
  .m3{background:#a3ff12}
  .name{font-weight:700;letter-spacing:-.01em;font-size:17px}
  .name span{color:#00e5ff}
  h1{font-size:26px;line-height:1.15;font-weight:800;letter-spacing:-.02em;margin:0 0 8px}
  p{margin:0 0 24px;color:#9aa0a8;font-size:14px}
  label{display:block;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#9aa0a8;margin:0 0 8px}
  input{width:100%;font:inherit;font-size:16px;padding:14px 16px;border-radius:12px;
        background:#141414;border:1px solid rgba(255,255,255,.12);color:#fff;outline:none}
  input:focus{border-color:#00e5ff}
  button{width:100%;margin-top:14px;font:inherit;font-weight:700;font-size:16px;padding:14px 16px;
         border-radius:12px;border:0;background:#00e5ff;color:#0a0a0a;cursor:pointer}
  button:hover{background:#58eeff}
  .err{margin:0 0 16px;color:#ff2ec4;font-size:14px}
  footer{margin-top:26px;color:#5f666e;font-size:12px}
</style>
</head>
<body>
<main>
  <div class="word">
    <span class="mark" aria-hidden="true"><i class="m1"></i><i class="m2"></i><i class="m3"></i></span>
    <span class="name">nohumans <span>slide</span></span>
  </div>
  <h1>Acesso restrito.</h1>
  <p>Este deck é privado. Digite a senha para abrir.</p>
  ${failed ? '<p class="err" role="alert">Senha incorreta. Tente de novo.</p>' : ''}
  <form method="post" action="${escapeHtml(action)}">
    <label for="pw">Senha</label>
    <input id="pw" type="password" name="password" required autofocus
           autocomplete="current-password" maxlength="${MAX_PASSWORD_LENGTH}" />
    <button type="submit">Abrir deck</button>
  </form>
  <footer>nohumans slide · slides.nohumans.com.br</footer>
</main>
</body>
</html>`
}

const html = (body: string, status: number): Response =>
  new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' },
  })

const redirect = (location: string, setCookie: string): Response =>
  new Response(null, { status: 303, headers: { location, 'set-cookie': setCookie, 'cache-control': 'no-store' } })

export default async function middleware(request: Request): Promise<Response> {
  const config = gateConfig()

  if (config === 'absent') {
    return html('<!doctype html><meta charset="utf-8"><title>gate</title><p>Gate não configurado — falta DEPLOY_GATE_PASSWORD_HASH.</p>', 503)
  }
  if (config === 'malformed') {
    return html('<!doctype html><meta charset="utf-8"><title>gate</title><p>Configuração do gate inválida — regenere o hash com nohumans/hash-password.mjs.</p>', 503)
  }

  const url = new URL(request.url)
  const secure = url.protocol === 'https:'

  const cookie = getCookie(request)
  if (cookie && safeEqual(cookie, mintCookie(config))) {
    // The shell is a private document: never let an edge/proxy cache keep a copy.
    return next({ headers: { 'cache-control': 'private, max-age=0, must-revalidate' } })
  }

  if (request.method === 'POST' && url.pathname === UNLOCK_PATH) {
    const form = await request.formData().catch(() => null)
    const attempt = form?.get('password')
    const from = safeFrom(url.searchParams.get(NEXT_PARAM))
    if (typeof attempt === 'string' && attempt.length > 0 && attempt.length <= MAX_PASSWORD_LENGTH && safeEqual(hashPassword(config.salt, attempt), config.hash)) {
      return redirect(new URL(from, url).toString(), cookieHeader(mintCookie(config), secure))
    }
    return html(unlockPage(from, true), 401)
  }

  return html(unlockPage(safeFrom(url.pathname + url.search), false), 401)
}

export const config = {
  // Node runtime: scrypt/HMAC live in node:crypto, absent from the edge runtime.
  runtime: 'nodejs',
  // The whole site is ONE html file — there are no static assets to exempt, so
  // everything is gated. (Exempting *.js/*.css would be wrong here anyway: a
  // static bundle's content is the thing being protected.)
  matcher: ['/((?!favicon\\.ico$).*)'],
}
