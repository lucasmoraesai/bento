// Drives the SSO handshake in a real browser: mints the token the work would
// mint, opens /__sso in Chrome, and checks that the deck renders afterwards.
//   SLIDES_SSO_SECRET=... node nohumans/check-sso-browser.cjs https://slides.nohumans.com.br
const { spawn } = require('child_process');
const { createHmac } = require('node:crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = (process.argv[2] || 'https://slides.nohumans.com.br').replace(/\/$/, '');
const SECRET = process.env.SLIDES_SSO_SECRET;
const OUT = process.argv[3] || path.join(__dirname, 'sso-browser.png');
if (!SECRET) { console.error('falta SLIDES_SSO_SECRET'); process.exit(1); }

const b64url = (v) => Buffer.from(v).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
const payload = b64url(JSON.stringify({ iss: 'work.nohumans.com.br', aud: 'slides.nohumans.com.br', sub: 'browser-test', iat: now, exp: now + 60 }));
const token = `${header}.${payload}.${createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url')}`;
const start = `${BASE}/__sso?token=${encodeURIComponent(token)}&next=%2F`;

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP = 9226;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox', '--no-first-run',
  `--remote-debugging-port=${CDP}`, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-sso-' + Date.now()),
  '--window-size=1440,900', start], { stdio: 'ignore' });

(async () => {
  let target = null;
  for (let i = 0; i < 50; i++) {
    await sleep(400);
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && t.url.startsWith('http'));
      if (target) break;
    } catch {}
  }
  if (!target) throw new Error('no CDP target');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const myId = ++id; pending.set(myId, res); ws.send(JSON.stringify({ id: myId, method, params })); });
  const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.result?.value; };
  await sleep(6000);
  console.log('url:', await evalJs('location.href'));
  console.log('title:', await evalJs('document.title'));
  console.log('deck:', await evalJs(`(() => { const d = window.bento?.doc; return d ? d.title + ' · ' + d.slides.length + ' slides' : 'sem deck'; })()`));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));
  console.log('screenshot:', OUT, fs.statSync(OUT).size);
  ws.close(); chrome.kill(); process.exit(0);
})().catch((e) => { console.error('FAILED', e.message); try { chrome.kill(); } catch {} process.exit(1); });
