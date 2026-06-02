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
  const html = await fetchText('https://csrestored.fun/app/friends');
  const chunks = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]))];
  const hits = new Set();
  for (const chunk of chunks) {
    const text = await fetchText(`https://csrestored.fun${chunk}`);
    for (const m of text.matchAll(/api\.csrestored\.fun[^"'`\s)]+/g)) hits.add(m[0]);
    for (const m of text.matchAll(/["'`](\/friends[^"'`]*)["'`]/g)) hits.add(m[1]);
    for (const m of text.matchAll(/invite_user|useFriends|friendData/g)) hits.add(m[0]);
  }
  console.log([...hits].sort().join('\n'));
})();
