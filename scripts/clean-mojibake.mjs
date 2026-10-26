import fs from 'fs';

let content = fs.readFileSync('worker.js', 'utf8');

content = content.replace(/ΓÇö/g, '—');
content = content.replace(/ΓÇó/g, '•');

fs.writeFileSync('worker.js', content, 'utf8');
console.log('Cleaned all mojibake in worker.js!');
