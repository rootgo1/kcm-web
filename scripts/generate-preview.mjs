/** npm install 이후 최신 src/를 독립 HTML로 묶습니다. 원본은 항상 src/입니다. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = (name, resolver = require) => path.dirname(resolver.resolve(`${name}/package.json`));
const reactRoot = packageRoot('react');
const domRoot = packageRoot('react-dom');
const domRequire = createRequire(path.join(domRoot, 'index.js'));
const schedulerRoot = packageRoot('scheduler', domRequire);
const read = p => fs.readFileSync(p, 'utf8');
const vendor = {
  react: read(path.join(reactRoot, 'cjs/react.production.min.js')),
  'react-dom': read(path.join(domRoot, 'cjs/react-dom.production.min.js')),
  scheduler: read(path.join(schedulerRoot, 'cjs/scheduler.production.min.js')),
  'react-dom/client': "module.exports = require('react-dom');",
};
const modules = Object.entries(vendor).map(([id, code]) => `${JSON.stringify(id)}:function(module,exports,require){\n${code}\n}`);
const diagnostics = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (!/\.[tj]sx?$/.test(file) || file.endsWith('.d.ts')) continue;
    const id = path.relative(root, file).replaceAll('\\', '/').replace(/\.[tj]sx?$/, '');
    const transformed = ts.transpileModule(read(file), {
      fileName: file,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React, jsxFactory: '__React.createElement',
        jsxFragmentFactory: '__React.Fragment', esModuleInterop: true,
      },
    });
    for (const item of transformed.diagnostics ?? []) {
      if (item.category === ts.DiagnosticCategory.Error) diagnostics.push(ts.flattenDiagnosticMessageText(item.messageText, '\n'));
    }
    modules.push(`${JSON.stringify(id)}:function(module,exports,require){const __React=require('react');\n${transformed.outputText}\n}`);
  }
}
walk(path.join(root, 'src'));
if (diagnostics.length) throw new Error(diagnostics.join('\n'));
const script = `(function(){'use strict';
const process={env:{NODE_ENV:'production'}};
const modules={${modules.join(',\n')}};const cache={};
function load(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;
function require(p){if(p.endsWith('.css'))return {};if(!p.startsWith('.'))return load(p);const parts=[...id.split('/').slice(0,-1),...p.split('/')];const out=[];for(const part of parts){if(part==='.'||part==='')continue;if(part==='..')out.pop();else out.push(part);}return load(out.join('/').replace(/\\.(tsx?|jsx?)$/,''));}
if(!modules[id])throw new Error('Missing module '+id);modules[id](m,m.exports,require);return m.exports;}
// Standalone is the employee demo only. Retell requires Vite's proxy + the Node backend.
const React=load('react');
load('react-dom/client').createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(load('src/App').default)));})();`;
const html = `<!doctype html><html lang="ko" data-kcm-standalone="true"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="theme-color" content="#d92535"><title>KCM · 워크스페이스 v0.3 (독립 미리보기)</title><style>${read(path.join(root, 'src/styles.css'))}</style></head><body><div id="root"></div><!-- Generated from src/. React/ReactDOM/Scheduler: Copyright Meta Platforms, Inc. and affiliates, MIT License. See THIRD_PARTY_NOTICES.txt. No font files are embedded. --><script>${script.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
const output = path.join(root, '00_KCM_미리보기.html');
fs.writeFileSync(output, html, 'utf8');
console.log(`독립 미리보기를 갱신했습니다: ${output}`);
console.log('전체 타입 검사와 Vite 빌드는 별도로 npm run check를 실행하세요.');
