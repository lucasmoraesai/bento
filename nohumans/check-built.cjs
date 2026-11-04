// Sanity check: the BUILT shell carries the nohumans document in #bento-doc.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'slides', 'dist-single', 'index.html'), 'utf8');
const open = '<script type="application/bento+json" id="bento-doc">';
const at = html.indexOf(open);
if (at < 0) { console.log('NO DOC BLOCK'); process.exit(1); }
const start = at + open.length;
const end = html.indexOf('</script>', start);
const raw = html.slice(start, end);
const doc = JSON.parse(raw);
console.log('embedded doc bytes:', raw.length);
console.log(JSON.stringify({
  title: doc.title,
  slides: doc.slides.length,
  collab: !!doc.collab,
  fonts: (doc.fonts || []).map((f) => f.family),
  firstSlideTexts: doc.slides[0].elements.filter((e) => e.type === 'text').map((e) => e.text || e.html),
}, null, 1));
