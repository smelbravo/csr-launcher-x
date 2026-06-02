const https = require('https');

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
  const hits = new Set();
  for (const chunk of chunks) {
    const text = await fetchText(`https://csrestored.fun${chunk}`);
    for (const m of text.matchAll(/api\.csrestored\.fun[^"'`\s)]+/g)) hits.add(m[0]);
    for (const m of text.matchAll(/["'`](\/[a-zA-Z0-9@_./-]+)["'`]/g)) {
      const p = m[1];
      if (/queue|match|lobby|party|team|region|mode|live|join|wingman|hostage|competitive/i.test(p)) {
        hits.add(p);
      }
    }
    if (/joinQueue|matchmaking|Players in Queue|Active Players/i.test(text)) {
      hits.add(`[chunk has MM UI] ${chunk}`);
    }
  }
  console.log([...hits].sort().join('\n'));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
