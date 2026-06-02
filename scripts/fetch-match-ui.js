const https = require('fs').readFileSync;
const fs = require('fs');
const path = require('path');
const httpsMod = require('https');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    httpsMod.get(url, (r) => {
      let d = '';
      r.on('data', (c) => { d += c; });
      r.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

(async () => {
  const html = await fetchText('https://csrestored.fun/app');
  const chunks = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]))];
  for (const chunk of chunks) {
    const text = await fetchText('https://csrestored.fun' + chunk);
    if (!/submit_ban_votes|Connect using Steam|map_pick_update|It's the other team/i.test(text)) continue;
    fs.writeFileSync(path.join(__dirname, 'match-ui-chunk.txt'), text);
    console.log('chunk', chunk, 'len', text.length);
    for (const k of ['submit_ban_votes', 'accept', 'Connect using Steam', 'steam://', 'connect_command', 'server_ip', 'other team', 'Maps banned']) {
      const i = text.indexOf(k);
      if (i >= 0) console.log('\n', k, text.slice(i, i + 200));
    }
  }
})();
