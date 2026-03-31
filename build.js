const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

const files = [
    'main.js',
    'ui/css.js',
    'ui/html.js',
    'ui/panel.js',
    'automation/video.js',
    'automation/quiz.js',
    'automation/navigator.js',
    'stealth/bypass.js',
    'init.js'
];

let out = `// content.js — LMSX v3.6 (Modular Build)
(function () {
    'use strict';
`;

for (const file of files) {
    try {
        const p = path.join(srcDir, file);
        const content = fs.readFileSync(p, 'utf8');
        out += `\n    // ── ${file.toUpperCase()} ──\n`;
        out += content.split('\n').map(l => l ? '    ' + l : '').join('\n');
        out += '\n';
        console.log(`[+] Added ${file}`);
    } catch (e) {
        console.error(`[-] Failed to load ${file}:`, e.message);
        process.exit(1);
    }
}

out += `})();\n`;

fs.writeFileSync(path.join(__dirname, 'content.js'), out);
console.log('Build complete: content.js updated successfully.');
