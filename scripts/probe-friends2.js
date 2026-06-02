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
  for (const page of ['app', 'app/friends', 'app/inventory']) {
    const html = await fetchText(`https://csrestored.fun/${page}`);
    const chunks = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]))];
    for (const chunk of chunks) {
      const text = await fetchText(`https://csrestored.fun${chunk}`);
      if (!/useFriends|\/friends|friendData/i.test(text)) continue;
      console.log('\n===', page, chunk, '===');
      const apis = [...text.matchAll(/https:\/\/api\.csrestored\.fun[^"'`\s)]+/g)].map((m) => m[0]);
      const paths = [...text.matchAll(/["'`](\/[a-zA-Z@_./-]*friend[a-zA-Z@_./-]*)["'`]/gi)].map((m) => m[1]);
      console.log('apis', [...new Set(apis)]);
      console.log('paths', [...new Set(paths)].slice(0, 20));
      const idx = text.indexOf('useFriends');
      if (idx >= 0) console.log(text.slice(idx, idx + 600));
    }
  }
})();
