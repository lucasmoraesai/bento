// Smoke test do SSO do slides (sem navegador, só curl-equivalente em Node).
//
//   SLIDES_SSO_SECRET=... node nohumans/check-sso.cjs https://slides.nohumans.com.br
//
// Prova, em ordem:
//   1. sem cookie → 302 para work.nohumans.com.br/auth/slides (o handshake)
//   2. com um token assinado pelo mesmo segredo → 303 + cookie de sessão
//   3. com o cookie → 200 e o deck no corpo
// O token do passo 2 é cunhado AQUI, com o segredo: é o que o work faria depois
// de conferir a sessão e o perfil ativo. Não substitui testar o login de
// verdade, mas separa "o deck está gateado" de "o work não está entregando".
const { createHmac } = require('node:crypto');

const BASE = (process.argv[2] || 'https://slides.nohumans.com.br').replace(/\/$/, '');
const SECRET = process.env.SLIDES_SSO_SECRET;
if (!SECRET) {
  console.error('falta SLIDES_SSO_SECRET no ambiente');
  process.exit(1);
}
const b64url = (v) => Buffer.from(v).toString('base64url');
const mint = (claims) => {
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64url(JSON.stringify(claims));
  return `${h}.${p}.${createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
};

(async () => {
  let fail = 0;
  const ok = (cond, msg) => {
    console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`);
    if (!cond) fail++;
  };

  // 1. gated
  const anon = await fetch(`${BASE}/`, { redirect: 'manual' });
  const location = anon.headers.get('location') || '';
  ok(anon.status === 302, `sem cookie → 302 (veio ${anon.status})`);
  ok(location.startsWith('https://work.nohumans.com.br/auth/slides'), `redirect vai para o work (${location.slice(0, 80)})`);

  // 2. handshake token
  const now = Math.floor(Date.now() / 1000);
  const token = mint({ iss: 'work.nohumans.com.br', aud: 'slides.nohumans.com.br', sub: 'smoke-test', iat: now, exp: now + 60 });
  const sso = await fetch(`${BASE}/__sso?token=${encodeURIComponent(token)}&next=%2F`, { redirect: 'manual' });
  const setCookie = sso.headers.get('set-cookie') || '';
  ok(sso.status === 303, `token válido → 303 (veio ${sso.status})`);
  ok(/nh_slide=[^;]+/.test(setCookie), 'cookie nh_slide emitido');

  // 3. unlocked
  const cookie = (setCookie.match(/nh_slide=[^;]+/) || [''])[0];
  const page = await fetch(`${BASE}/`, { headers: { cookie }, redirect: 'manual' });
  const body = await page.text();
  ok(page.status === 200, `com cookie → 200 (veio ${page.status})`);
  ok(body.includes('nohumans slide') || body.includes('Agência'), 'o shell do deck veio no corpo');

  // 4. token forjado não passa
  const forged = token.slice(0, -3) + 'aaa';
  const bad = await fetch(`${BASE}/__sso?token=${encodeURIComponent(forged)}&next=%2F`, { redirect: 'manual' });
  ok(bad.status === 303 && (bad.headers.get('location') || '').includes('work.nohumans.com.br'), 'token forjado → volta para o work');

  console.log(fail ? `\n${fail} falha(s)` : '\ntudo ok');
  process.exit(fail ? 1 : 0);
})();
