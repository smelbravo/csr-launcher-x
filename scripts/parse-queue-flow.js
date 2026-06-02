const fs = require('fs');
const path = require('path');
const text = fs.readFileSync(path.join(__dirname, 'ws-provider.txt'), 'utf8');

for (const key of ['inviteUser', 'joinQueueAsLeader', 'joinQueue=', 'function ei', 'Q=async', 'availableQueueType']) {
  let idx = 0;
  for (let n = 0; n < 2; n++) {
    idx = text.indexOf(key, idx);
    if (idx < 0) break;
    console.log('\n---', key, '---');
    console.log(text.slice(idx, idx + 500));
    idx += key.length;
  }
}
