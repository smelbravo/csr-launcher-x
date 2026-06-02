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
  const text = await fetchText('https://csrestored.fun/_next/static/chunks/17fpwg6ez0sjp.js');
  fs.writeFileSync(path.join(__dirname, 'mm-ui.txt'), text);
  const idx = text.indexOf('mm_online');
  console.log(text.slice(Math.max(0, idx - 400), idx + 800));
})();
