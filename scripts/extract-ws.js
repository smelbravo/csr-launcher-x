const https = require('https');
const fs = require('fs');
const path = require('path');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (r) => {
      let d = '';
      r.on('data', (c) => { d += c; });
      r.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

(async () => {
  const html = await fetchText('https://csrestored.fun/app');
  const chunks = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]))];
  const all = new Set();
  for (const chunk of chunks) {
    const text = await fetchText(`https://csrestored.fun${chunk}`);
    for (const m of text.matchAll(/wss?:\/\/[^"'`\s)]+/g)) all.add(m[0]);
    for (const m of text.matchAll(/["']joinQueue[^"']*["']/g)) all.add(m[0]);
    for (const m of text.matchAll(/type:\s*["'][a-zA-Z_]+["']/g)) {
      const s = m[0];
      if (/queue|group|match|lobby|invite|leave/i.test(s)) all.add(s);
    }
  }
  const out = [...all].sort().join('\n');
  fs.writeFileSync(path.join(__dirname, 'ws-hits.txt'), out);
  console.log(out || '(none)');
})();
