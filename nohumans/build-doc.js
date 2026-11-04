// Load a COMPACT deck into the built shell, print what the runtime complained
// about, and write the FULL document JSON (what the file will embed).
//   node nohumans/build-doc.js
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const SHELL = path.join(ROOT, 'slides', 'dist-single', 'index.html');
const COMPACT = path.join(__dirname, 'deck.compact.json');
const OUT_FULL = path.join(__dirname, 'deck.full.json');
const SHOT = path.join(__dirname, 'preview.png');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 4399;
const CDP = 9223;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const html = fs.readFileSync(SHELL);
const server = http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  })
  .listen(PORT, '127.0.0.1');

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-sandbox',
    '--no-first-run',
    `--remote-debugging-port=${CDP}`,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-doc-' + Date.now()),
    '--window-size=1440,900',
    `http://127.0.0.1:${PORT}/`,
  ],
  { stdio: 'ignore' },
);

(async () => {
  let target = null;
  for (let i = 0; i < 50; i++) {
    await sleep(400);
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && t.url.includes(String(PORT)));
      if (target) break;
    } catch {}
  }
  if (!target) throw new Error('no CDP target');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res) => {
      const myId = ++id;
      pending.set(myId, res);
      ws.send(JSON.stringify({ id: myId, method, params }));
    });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
    return r.result?.result?.value;
  };

  await sleep(3500);
  await send('Page.enable');

  const compact = fs.readFileSync(COMPACT, 'utf8');
  const report = await evalJs(
    `(() => { const r = window.bento.loadDoc(${JSON.stringify(compact)});
       if (!r) return 'loadDoc returned false';
       const out = { ok: !!r.ok, dropped: (r.dropped||[]).length, droppedSample: (r.dropped||[]).slice(0,12),
                     expanded: r.expanded, fitted: r.fitted, laidOut: r.laidOut };
       out.findings = r.findings;
       return JSON.stringify(out); })()`,
  );
  console.log('LOAD REPORT:', report.slice(0, 3000));
  await sleep(800);

  const full = await evalJs(`JSON.stringify(window.bento.doc)`);
  // A public landing deck must NOT carry live-session keys: anything holding
  // them can join this deck's room and write to it.
  const fullDoc = JSON.parse(full);
  delete fullDoc.collab;
  const fullOut = JSON.stringify(fullDoc);
  fs.writeFileSync(OUT_FULL, fullOut);
  console.log('full doc bytes:', fullOut.length);
  console.log('full doc keys:', Object.keys(fullDoc).join(','));

  const validate = await evalJs(`JSON.stringify(window.bento.validate())`);
  console.log('VALIDATE:', validate.slice(0, 2500));

  // one screenshot per slide: click the thumbnail strip
  const nSlides = await evalJs(`document.querySelectorAll('.ed-thumb').length`);
  console.log('thumbs:', nSlides);
  for (let i = 0; i < nSlides; i++) {
    await evalJs(`(() => { const t = document.querySelectorAll('.ed-thumb')[${i}]; if (t) t.click(); return true; })()`);
    await sleep(700);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, `preview-${i + 1}.png`), Buffer.from(shot.result.data, 'base64'));
  }
  console.log('slides captured:', nSlides);

  ws.close();
  chrome.kill();
  server.close();
  process.exit(0);
})().catch((e) => {
  console.error('FAILED', e.message);
  try { chrome.kill(); } catch {}
  try { server.close(); } catch {}
  process.exit(1);
});
