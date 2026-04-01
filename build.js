const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const buildStamp = new Date().toISOString();
const files = [
    'main.js',
    'storage/schema.js',
    'storage/adapter.js',
    'runtime/logger.js',
    'runtime/state.js',
    'runtime/selectors.js',
    'network/providers.js',
    'network/bridge.js',
    'ui/css.js',
    'ui/html.js',
    'ui/panel.js',
    'automation/video.js',
    'automation/quiz.js',
    'automation/navigator.js',
    'stealth/bypass.js',
    'init.js',
];

function ensureFilesExist() {
    const missing = files.filter(file => !fs.existsSync(path.join(srcDir, file)));
    if (missing.length) {
        console.error('[build] Missing source files:', missing.join(', '));
        process.exit(1);
    }
}

function build() {
    ensureFilesExist();
    let out = `// content.js - LMSX build\n(function () {\n    'use strict';\n    const __LMSX_BUILD_STAMP__ = ${JSON.stringify(buildStamp)};\n`;

    for (const file of files) {
        const fullPath = path.join(srcDir, file);
        const content = fs.readFileSync(fullPath, 'utf8');
        out += `\n    // -- ${file} --\n`;
        out += content.split('\n').map(line => line ? `    ${line}` : '').join('\n');
        out += '\n';
        console.log(`[build] added ${file}`);
    }

    out += '})();\n';
    fs.writeFileSync(path.join(__dirname, 'content.js'), out, 'utf8');
    console.log(`[build] content.js updated (${buildStamp})`);
}

function watch() {
    build();
    console.log('[build] watching src/ for changes...');
    fs.watch(srcDir, { recursive: true }, (eventType, filename) => {
        if (!filename || !filename.endsWith('.js')) return;
        console.log(`[build] ${eventType}: ${filename}`);
        try { build(); } catch (error) { console.error('[build] failed', error); }
    });
}

if (process.argv.includes('--watch')) watch();
else build();
