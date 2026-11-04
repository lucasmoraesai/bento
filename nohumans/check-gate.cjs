// Smoke test for the password gate: opens the site, proves the login screen
// comes first, submits the password, proves the deck comes after.
//   node nohumans/check-gate.cjs <url> <password> [outPrefix]
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL_ = process.argv[2];
const PASSWORD = process.argv[3];
const PREFIX = process.argv[4] || path.join(__dirname, 'gate');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP = 9225;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox', '--no-first-run',
  `--remote-debugging-port=${CDP}`, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-g-' + Date.now()),
  '--window-size=1440,900', URL_,
], { stdio: 'ignore' });

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
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const myId = ++id; pending.set(myId, res); ws.send(JSON.stringify({ id: myId, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
    return r.result?.result?.value;
  };
  const shot = async (file) => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(s.result.data, 'base64'));
    console.log('screenshot:', file, fs.statSync(file).size);
  };

  await sleep(2500);
  await send('Page.enable');
  console.log('title before:', await evalJs('document.title'));
  console.log('login screen?', await evalJs(`!!document.querySelector('input[name=password]')`));
  await shot(`${PREFIX}-login.png`);

  // fill and submit the unlock form
  await evalJs(`(() => {
    const i = document.querySelector('input[name=password]');
    i.value = ${JSON.stringify(PASSWORD)};
    i.form.submit();
    return true;
  })()`);
  await sleep(5000);
  console.log('title after:', await evalJs('document.title'));
  console.log('deck loaded?', await evalJs(`(() => { const d = window.bento?.doc; return d ? d.title + ' · ' + d.slides.length + ' slides' : 'no deck'; })()`));
  await shot(`${PREFIX}-deck.png`);

  ws.close(); chrome.kill(); process.exit(0);
})().catch((e) => { console.error('FAILED', e.message); try { chrome.kill(); } catch {} process.exit(1); });
