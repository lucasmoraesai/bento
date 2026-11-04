// Embeds nohumans/deck.full.json into slides/index.html's `#bento-doc` block —
// the deck the published shell boots with instead of the upstream starter deck.
//
//   node nohumans/build-doc.js   # authors deck.full.json from deck.compact.json
//   node nohumans/inject.mjs     # writes it into the shell source
//
// Two things this must not do (docs/PLATFORM.md, AGENTS.md hard rules):
//   * never emit a literal `</script>` inside the block — every `<` is escaped
//     as \u003c, which is valid JSON and closes nothing;
//   * never touch the block's id (`bento-doc`) — the splice contract.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const docPath = join(root, 'nohumans', 'deck.full.json');
const shellPath = join(root, 'slides', 'index.html');

const doc = JSON.parse(readFileSync(docPath, 'utf8'));
const json = JSON.stringify(doc).replace(/</g, '\\u003c');

const html = readFileSync(shellPath, 'utf8');
const OPEN = '<script type="application/bento+json" id="bento-doc">';
const CLOSE = '</script>';
const at = html.indexOf(OPEN);
if (at < 0) throw new Error('bento-doc block not found in slides/index.html');
const start = at + OPEN.length;
const end = html.indexOf(CLOSE, start);
if (end < 0) throw new Error('bento-doc block is not closed');
const next = html.slice(0, start) + json + html.slice(end);
writeFileSync(shellPath, next);
console.log('embedded', json.length, 'bytes of document into slides/index.html');
