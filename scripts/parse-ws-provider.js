const fs = require('fs');
const path = require('path');
const text = fs.readFileSync(path.join(__dirname, 'ws-provider.txt'), 'utf8');

const keys = [
  'socket.csrestored',
  'Phoenix',
  'new Socket',
  'channel.push',
  'joinQueue',
  'leaveQueue',
  'leaveGroup',
  'createGroup',
  'invite',
  'queue_type',
  'live',
  'active_players',
  'players_in_queue',
  'jwt',
  'params:',
  'user:',
  'lobby:',
  'match:',
  'group:',
];

for (const key of keys) {
  let idx = 0;
  let n = 0;
  while (n < 3) {
    idx = text.indexOf(key, idx);
    if (idx < 0) break;
    console.log('\n---', key, '---');
    console.log(text.slice(Math.max(0, idx - 80), idx + 200));
    idx += key.length;
    n++;
  }
}

// All channel.push event names
const pushes = [...text.matchAll(/push\("([a-z_]+)"/g)].map((m) => m[1]);
console.log('\nPUSH EVENTS:', [...new Set(pushes)].sort().join(', '));

// All channel.on or handle
const ons = [...text.matchAll(/on\("([a-z_]+)"/g)].map((m) => m[1]);
console.log('ON EVENTS:', [...new Set(ons)].sort().join(', '));
