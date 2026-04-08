// worker_template.js + plan_context.txt → worker.js
const fs = require('fs');
const path = require('path');

const tpl = fs.readFileSync(path.join(__dirname, 'worker_template.js'), 'utf-8');
const ctx = fs.readFileSync(path.join(__dirname, 'plan_context.txt'), 'utf-8');

// テンプレートリテラル内に埋め込むのでバッククォート・${ をエスケープ
const escaped = ctx.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const out = tpl.replace('`__PLAN_CONTEXT__`', '`' + escaped + '`');

const outPath = path.join(__dirname, 'worker.js');
fs.writeFileSync(outPath, out, 'utf-8');
console.log(`✓ Wrote ${outPath} (${out.length} chars)`);
