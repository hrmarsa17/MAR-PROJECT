import fs from 'fs';

let workerCode = fs.readFileSync('worker.js', 'utf8');

const html = fs.readFileSync('scripts/built-index.html', 'utf8');
const css = fs.readFileSync('scripts/built-style.css', 'utf8');
const app = fs.readFileSync('scripts/patched-app.js', 'utf8');

console.log('Sizes -> HTML:', html.length, 'CSS:', css.length, 'APP:', app.length);

const jsonHtml = JSON.stringify(html);
const jsonCss = JSON.stringify(css);
const jsonApp = JSON.stringify(app);

// Replace in workerCode
workerCode = workerCode.replace(/'index\.html':\s*"[\s\S]*?",\s*'style\.css'/, `'index.html': ${jsonHtml},\n  'style.css'`);
workerCode = workerCode.replace(/'style\.css':\s*"[\s\S]*?",\s*'app\.js'/, `'style.css': ${jsonCss},\n  'app.js'`);
workerCode = workerCode.replace(/'app\.js':\s*"[\s\S]*?",\s*'data\.js'/, `'app.js': ${jsonApp},\n  'data.js'`);

fs.writeFileSync('worker.js', workerCode, 'utf8');
console.log('Successfully written final worker.js!');
