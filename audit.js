const fs = require('fs');
const path = require('path');

const projectRoot = 'c:\\digirisepartnerbetav';
const cssFiles = ['css/shared.css', 'css/partner.css', 'css/admin.css', 'css/index.css'];
const jsFiles = ['js/shared.js', 'js/partner.js', 'js/admin.js'];
const htmlFiles = ['index.html', 'partner.html', 'admin.html'];

const out = { fileList: [], dupSelectors: {}, orphanedVars: [], duplicateRoot: [], jsDupFunctions: {}, jsDomContentLoaded: {}, tabMatches: {}, duplicateIds: {} };

// 1.1 File List
function getFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const stat = fs.statSync(path.join(dir, file));
    if (stat.isDirectory()) {
      getFiles(path.join(dir, file), fileList);
    } else {
      const fullPath = path.join(dir, file);
      if (['.js', '.css', '.html', '.json'].includes(path.extname(fullPath))) {
        const lines = fs.readFileSync(fullPath, 'utf8').split('\n').length;
        fileList.push({ file: fullPath.replace(projectRoot + '\\', ''), lines, modified: stat.mtime });
      }
    }
  }
  return fileList;
}
out.fileList = getFiles(projectRoot);

// 1.2 Duplicate selectors in shared.css
const sharedCss = fs.readFileSync(path.join(projectRoot, 'css/shared.css'), 'utf8');
const selectorRegex = /^\s*([a-zA-Z0-9_#\.:,\-\s]+)\s*\{/gm;
let match;
const selectors = {};
const linesArr = sharedCss.split('\n');
linesArr.forEach((line, i) => {
  const m = line.match(/^\s*([a-zA-Z0-9_#\.:,\-\s]+)\s*\{/);
  if (m) {
    const sel = m[1].trim();
    if (!selectors[sel]) selectors[sel] = [];
    selectors[sel].push(i + 1);
  }
});
for (const k in selectors) {
  if (selectors[k].length > 1) out.dupSelectors[k] = selectors[k];
}

// 1.3 Orphaned vars
let allDefinedVars = new Set();
let allUsedVars = new Set();
cssFiles.forEach(f => {
  const css = fs.readFileSync(path.join(projectRoot, f), 'utf8');
  const defs = css.match(/--[a-zA-Z0-9-]+(?=\s*:)/g) || [];
  defs.forEach(v => allDefinedVars.add(v));
  const uses = css.match(/var\((--[a-zA-Z0-9-]+)\)/g) || [];
  uses.forEach(u => allUsedVars.add(u.replace(/var\(|\)/g, '')));
});
allUsedVars.forEach(v => {
  if (!allDefinedVars.has(v)) out.orphanedVars.push(v);
});

// 1.4 Duplicate :root / [data-theme]
cssFiles.forEach(f => {
  const css = fs.readFileSync(path.join(projectRoot, f), 'utf8');
  const lines = css.split('\n');
  lines.forEach((l, i) => {
    if (l.includes(':root') || l.includes('[data-theme')) {
      out.duplicateRoot.push({ file: f, line: i + 1, content: l.trim() });
    }
  });
});

// 1.5 Duplicate JS functions & 1.6 DOMContentLoaded
jsFiles.forEach(f => {
  const js = fs.readFileSync(path.join(projectRoot, f), 'utf8');
  const lines = js.split('\n');
  const funcs = {};
  let domLoad = [];
  lines.forEach((l, i) => {
    const fnMatch = l.match(/function\s+([a-zA-Z0-9_]+)\s*\(/) || l.match(/const\s+([a-zA-Z0-9_]+)\s*=\s*function\s*\(/) || l.match(/globalThis\.([a-zA-Z0-9_]+)\s*=\s*function/);
    if (fnMatch) {
      const name = fnMatch[1];
      if (!funcs[name]) funcs[name] = [];
      funcs[name].push(i + 1);
    }
    if (l.includes("addEventListener('DOMContentLoaded'")) domLoad.push(i + 1);
    if (l.includes('addEventListener("DOMContentLoaded"')) domLoad.push(i + 1);
  });
  for (const k in funcs) {
    if (funcs[k].length > 1) {
      if (!out.jsDupFunctions[f]) out.jsDupFunctions[f] = {};
      out.jsDupFunctions[f][k] = funcs[k];
    }
  }
  out.jsDomContentLoaded[f] = domLoad;
});

// HTML checks (3.1 - 3.5)
htmlFiles.forEach(f => {
  const html = fs.readFileSync(path.join(projectRoot, f), 'utf8');
  const ids = html.match(/id="([^"]+)"/g) || [];
  const idCounts = {};
  ids.forEach(idStr => {
    const id = idStr.replace(/id="|"/g, '');
    idCounts[id] = (idCounts[id] || 0) + 1;
  });
  const dups = [];
  for (const k in idCounts) {
    if (idCounts[k] > 1) dups.push(k);
  }
  out.duplicateIds[f] = dups;
  
  if (f === 'partner.html' || f === 'admin.html') {
    const tabs = [...html.matchAll(/data-target="([^"]+)"/g)].map(m => m[1]);
    const sections = [...html.matchAll(/<section[^>]+id="([^"]+)"/g)].map(m => m[1]);
    out.tabMatches[f] = { tabs, sections };
  }
});

console.log(JSON.stringify(out, null, 2));
