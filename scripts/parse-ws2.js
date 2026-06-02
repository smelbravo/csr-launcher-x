const fs = require('fs');
const path = require('path');
const text = fs.readFileSync(path.join(__dirname, 'ws-provider.txt'), 'utf8');

for (const key of ['status_update', 'Z(`', 'await Z', 'lobby', 'room:', 'queue:', 'Presence', 'list(']) {
  let idx = 0;
  let n = 0;
  while (n < 5) {
    idx = text.indexOf(key, idx);
    if (idx < 0) break;
    console.log('\n---', key, '---');
    console.log(text.slice(Math.max(0, idx - 60), idx + 280));
    idx += key.length;
    n++;
  }
}
