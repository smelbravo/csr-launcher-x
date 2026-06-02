const fs = require('fs');
const path = require('path');
const text = fs.readFileSync(path.join(__dirname, 'ws-provider.txt'), 'utf8');
const idx = text.indexOf('status_update');
console.log(text.slice(idx - 200, idx + 400));
// search for queue counts in UI component chunk
const ui = fs.readFileSync(path.join(__dirname, 'mm-ui.txt'), 'utf8');
for (const pat of ['queueTypes', 'queue_type', 'getQueue', 'online', 'v.queue', 'status.v']) {
  const i = ui.indexOf(pat);
  if (i >= 0) console.log('\n', pat, ui.slice(i, i + 200));
}
