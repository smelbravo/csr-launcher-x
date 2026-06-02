const https = require('https');
const fs = require('fs');

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
  const chunk = '/_next/static/chunks/17fpwg6ez0sjp.js';
  const text = await fetchText(`https://csrestored.fun${chunk}`);
  const out = require('path').join(__dirname, 'mm-chunk-sample.txt');
  fs.writeFileSync(out, text.slice(0, 120000));
  const patterns = [
    /wss?:\/\/[^"'`\s)]+/g,
    /https:\/\/api[^"'`\s)]+/g,
    /["'`]\/[^"'`\s]{3,60}["'`]/g,
    /join[A-Za-z]*/g,
    /queue[A-Za-z]*/gi,
    /lobby[A-Za-z]*/gi,
    /matchmaking[A-Za-z]*/gi,
  ];
  for (const re of patterns) {
    const m = [...text.matchAll(re)].map((x) => x[0]);
    const uniq = [...new Set(m)].slice(0, 40);
    if (uniq.length) console.log('\n', re, '\n', uniq.join('\n'));
  }
})();
