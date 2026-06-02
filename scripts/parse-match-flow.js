const fs = require('fs');
const text = fs.readFileSync(__dirname + '/ws-provider.txt', 'utf8');

const keys = [
  'map_pick_update',
  'map_pick_finished',
  'server_prepared',
  'match_everyone_accepted',
  'acceptMatch',
  'submitBanVotes',
  'submit_ban_votes',
  'ea=async',
  'map_pick',
  'final_map',
  'connect',
  'steam',
  'Hidden',
];

for (const key of keys) {
  let idx = 0;
  for (let n = 0; n < 2; n++) {
    idx = text.indexOf(key, idx);
    if (idx < 0) break;
    console.log('\n===', key, '===');
    console.log(text.slice(Math.max(0, idx - 100), idx + 450));
    idx += key.length;
  }
}

// push events on match channel
const pushes = [...text.matchAll(/push\("([a-z_]+)"/g)].map((m) => m[1]);
console.log('\nALL PUSH:', [...new Set(pushes)].sort().join(', '));
