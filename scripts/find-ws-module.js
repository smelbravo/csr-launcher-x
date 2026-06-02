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
  for (const chunk of chunks) {
    const text = await fetchText(`https://csrestored.fun${chunk}`);
    if (/WebSocket|websocket|jwt_websocket|joinQueue|leaveGroup|createGroup/i.test(text)) {
      console.log('\n===', chunk, '===');
      const idx = text.indexOf('joinQueue');
      if (idx >= 0) console.log(text.slice(Math.max(0, idx - 200), idx + 400));
      const widx = text.search(/wss|WebSocket|socket\.io/i);
      if (widx >= 0) console.log(text.slice(Math.max(0, widx - 100), widx + 300));
    }
  }
})();
