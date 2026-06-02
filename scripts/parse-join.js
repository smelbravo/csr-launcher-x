const fs = require('fs');
const path = require('path');
const text = fs.readFileSync(path.join(__dirname, 'ws-provider.txt'), 'utf8');
const idx = text.indexOf('function Z') >= 0 ? text.indexOf('function Z') : text.indexOf('Z=async');
console.log('Z at', idx);
console.log(text.slice(idx, idx + 800));
