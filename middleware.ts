/**
 * Acesso ao slides.nohumans.com.br: quem manda é a sessão do work.
 *
 * O deck não tem login próprio. O fluxo é um handshake de três passos:
 *
 *   1. sem cookie → 302 para https://work.nohumans.com.br/slides-sso?next=<aqui>
 *   2. a rota do work confere a sessão do Supabase E a linha em `work.profiles`
 *      (perfil ativo — a fonte de verdade de acesso do work), cunha um JWT de
 *      60s assinado com SLIDES_SSO_SECRET e devolve a pessoa para /__sso
 *   3. /__sso valida assinatura e validade e emite o cookie DESTE site (2h,
 *      assinado com o mesmo segredo) e manda para o caminho pedido
 *
 * Por que assim: os dois apps são origens diferentes e o cookie de sessão do
 * work é host-only. Um segredo compartilhado e um token curto é o caminho mais
 * simples que não exige mudar a sessão do work nem abrir o cookie dele para o
 * domínio inteiro — e o deck nunca fala com o banco de ninguém.
 *
 * FAIL CLOSED: sem SLIDES_SSO_SECRET o site responde 503 em vez de abrir.
 * Revogação: 2h. Depois disso o browser repete o handshake sozinho — se a
 * sessão do work tiver caído, a pessoa para no login do work.
 */
import { next } from '@vercel/functions'
import { createHmac, timingSafeEqual } from 'node:crypto'

const COOKIE_NAME = 'nh_slide'
const SSO_PATH = '/__sso'
const WORK_SSO = 'https://work.nohumans.com.br/slides-sso'
const SITE = 'slides.nohumans.com.br'
/** How long this site trusts a completed handshake. Short enough that a work
 *  logout effectively ends access; long enough to be invisible. */
const SESSION_TTL = 60 * 60 * 2

const b64url = (value: string): string => Buffer.from(value).toString('base64url')

const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

type Claims = { sub?: string; aud?: string; exp?: number }

const signToken = (claims: Record<string, unknown>, secret: string): string => {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify(claims))
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}

/** Verifies signature, audience and expiry. Returns the claims or null. */
function verifyToken(token: string, secret: string): Claims | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, payload, signature] = parts
  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  if (!safeEqual(signature, expected)) return null
  let claims: Claims
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Claims
  } catch {
    return null
  }
  if (claims.aud !== SITE) return null
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) return null
  return claims
}

const cookieHeader = (value: string, secure: boolean): string =>
  `${COOKIE_NAME}=${value}; Max-Age=${SESSION_TTL}; Path=/; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax`

const clearCookie = (secure: boolean): string =>
  `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax`

const readCookie = (request: Request): string | null => {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq !== -1 && part.slice(0, eq).trim() === COOKIE_NAME) return part.slice(eq + 1).trim()
  }
  return null
}

/** Only ever bounce back to this origin (the deck is a single page at `/`). */
const safeNext = (raw: string | null): string => {
  if (raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\') && !/[\u0000-\u001f\u007f]/.test(raw)) return raw
  return '/'
}

const html = (body: string, status: number): Response =>
  new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' },
  })

export default async function middleware(request: Request): Promise<Response> {
  const secret = process.env.SLIDES_SSO_SECRET
  if (!secret) {
    return html(
      '<!doctype html><meta charset="utf-8"><title>slides</title><p>SSO não configurado — falta SLIDES_SSO_SECRET.</p>',
      503,
    )
  }

  const url = new URL(request.url)
  const secure = url.protocol === 'https:'

  // --- step 3: the work just handed us a token ------------------------------
  if (url.pathname === SSO_PATH) {
    const token = url.searchParams.get('token') ?? ''
    const claims = verifyToken(token, secret)
    const target = safeNext(url.searchParams.get('next'))
    if (!claims) {
      // Expired (60s) or tampered: start over instead of looping on a dead token.
      const retry = new URL(WORK_SSO)
      retry.searchParams.set('next', `${url.origin}/`)
      return new Response(null, { status: 303, headers: { location: retry.toString(), 'set-cookie': clearCookie(secure), 'cache-control': 'no-store' } })
    }
    const session = signToken(
      { iss: 'slides.nohumans.com.br', aud: SITE, sub: claims.sub, exp: Math.floor(Date.now() / 1000) + SESSION_TTL },
      secret,
    )
    return new Response(null, {
      status: 303,
      headers: { location: new URL(target, url).toString(), 'set-cookie': cookieHeader(session, secure), 'cache-control': 'no-store' },
    })
  }

  // --- already unlocked -----------------------------------------------------
  const cookie = readCookie(request)
  if (cookie && verifyToken(cookie, secret)) {
    // The shell is a private document: never let an edge/proxy cache keep a copy.
    return next({ headers: { 'cache-control': 'private, max-age=0, must-revalidate' } })
  }

  // --- step 1: send the browser to the work login ---------------------------
  const handshake = new URL(WORK_SSO)
  handshake.searchParams.set('next', `${url.origin}${url.pathname}${url.search}`)
  return new Response(null, {
    status: 302,
    headers: { location: handshake.toString(), ...(cookie ? { 'set-cookie': clearCookie(secure) } : {}), 'cache-control': 'no-store' },
  })
}

export const config = {
  // Node runtime: HMAC lives in node:crypto, absent from the edge runtime.
  runtime: 'nodejs',
  // The whole site is one HTML file — nothing static to exempt. `/favicon.ico`
  // is the exception the browser asks for before any navigation.
  matcher: ['/((?!favicon\\.ico$).*)'],
}
