// Mede o painel do copilot renderizado (geometria + cores), sem depender de screenshot.
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const URL_ = process.argv[2] || 'http://127.0.0.1:4399/';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP = 9229;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${CDP}`, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-m' + Date.now()),
  '--window-size=1440,900', URL_], { stdio: 'ignore' });

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
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const myId = ++id; pending.set(myId, res); ws.send(JSON.stringify({ id: myId, method, params })); });
  const js = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await sleep(4500);
  await js("document.querySelector('.ed-btn-copilot').click()");
  await sleep(500);
  console.log(await js(`(() => {
    const panel = document.querySelector('.nhc');
    const box = panel.getBoundingClientRect();
    const cs = getComputedStyle(panel);
    const btn = document.querySelector('.ed-btn-copilot').getBoundingClientRect();
    return JSON.stringify({
      painel: { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) },
      fundo: cs.backgroundColor, cor: cs.color, posicao: cs.position, z: cs.zIndex,
      botaoNaBarra: { x: Math.round(btn.x), y: Math.round(btn.y), w: Math.round(btn.width) },
      chips: [...panel.querySelectorAll('.nhc-chip')].map((c) => c.textContent.trim()),
    }, null, 1);
  })()`));

  // fecha de novo (o botão alterna)
  await js("document.querySelector('.ed-btn-copilot').click()");
  await sleep(300);
  console.log('fecha ao clicar de novo?', (await js("!document.querySelector('.nhc')")) === true);
  ws.close(); chrome.kill(); process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); try { chrome.kill(); } catch {} process.exit(1); });
