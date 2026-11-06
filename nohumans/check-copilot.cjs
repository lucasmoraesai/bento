// Abre o shell local, clica no botão do Copilot e confere o painel.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL_ = process.argv[2];
const OUT = process.argv[3];
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP = 9227;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox', '--no-first-run',
  `--remote-debugging-port=${CDP}`, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-cop-' + Date.now()),
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
  if (!target) throw new Error('sem target CDP');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const myId = ++id; pending.set(myId, res); ws.send(JSON.stringify({ id: myId, method, params })); });
  const js = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await sleep(4500);
  await send('Page.enable');
  console.log('titulo:', await js('document.title'));
  console.log('botão existe?', await js(`!!document.querySelector('.ed-btn-copilot')`));
  await js(`document.querySelector('.ed-btn-copilot')?.click()`);
  await sleep(600);
  const state = await js(`(() => {
    const p = document.querySelector('.nhc');
    if (!p) return 'painel não abriu';
    return JSON.stringify({
      visivel: !!p.offsetParent,
      titulo: p.querySelector('.nhc-title')?.innerText.replace(/\\s+/g,' '),
      chips: [...p.querySelectorAll('.nhc-chip')].map(c => c.textContent).length,
      temChave: !!p.querySelector('input[type=password]'),
      status: p.querySelector('.nhc-status')?.textContent,
    });
  })()`);
  console.log('painel:', state);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));
  console.log('screenshot:', OUT, fs.statSync(OUT).size);
  ws.close(); chrome.kill(); process.exit(0);
})().catch((e) => { console.error('FALHOU', e.message); try { chrome.kill(); } catch {} process.exit(1); });
