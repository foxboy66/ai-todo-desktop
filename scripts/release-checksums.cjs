const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const version = require('../package.json').version;
const root = path.resolve(__dirname, '../release');
const files = ['nsis', 'portable'].map(target => 'AI-ToDo-' + version + '-x64-' + target + '.exe');
const sums = files.map(name => createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex') + '  ' + name);
fs.writeFileSync(path.join(root, 'SHA256SUMS.txt'), sums.join('\n') + '\n');
console.log(sums.join('\n'));
