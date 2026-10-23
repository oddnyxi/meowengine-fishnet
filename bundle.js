import fs from 'fs';

const header = fs.readFileSync('./header.js', 'utf8');
const script = fs.readFileSync('./dist/index.js', 'utf8');

fs.writeFileSync('./dist/meowengine.user.js', header + script);
