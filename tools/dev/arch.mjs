/* The shape of the code, measured: what imports what, where the cycles are, how big each file is, which
   functions have grown past a screen, what reaches across modules by a global, and how deep the CSS has to
   climb to win. docs/architecture.md is written from these numbers; docs/framework.md sets the targets.

     node tools/dev/arch.mjs            the report, in plain lines
     node tools/dev/arch.mjs --json     the same as JSON, for a before and an after
     node tools/dev/arch.mjs --check    exit non-zero where a number is past its line (LINES below)
     node tools/dev/arch.mjs --graph    every edge, one line each: from -> to (static | dynamic | worker | html)

   What it reads: the site's own modules (assets/*.js, sw.js, worker/*.js), the pages (index.html, explore.html,
   privacy.html, admin.html) and the stylesheets (assets/*.css). Nothing is fetched, nothing is written.

   How it measures:
     edges     `import ... from './x.js'` and `export ... from` are static; `import('./x.js')` and
               lazy('./x.js') are dynamic; `new Worker(new URL('./x.js'` is a worker; a page's <script src> and
               <link rel=modulepreload> are html. The router's lazy('./' + route + '.js') (assets/app.js modOf)
               is read off the ROUTES table in assets/kinds.js: one dynamic edge per open route, trade -> tradepage.
     cycles    strongly connected components over the static edges, then over static plus dynamic
     first paint  index.html, its stylesheets, the modules it preloads and everything they import statically,
               and the two fonts it preloads: raw bytes and gzip, which is what the wire carries
     functions a function is `function name(`, `name = (...) => {`, `name: (...) => {` or a method `name(...) {`;
               its length is the lines to its closing brace, with strings and comments blanked first so a brace
               in a string is not counted. Over LINES.fn (80) is long
     globals   window.NAME read or written, and the storage keys each module reads or writes
     dom ids   getElementById('x') / $('#x') / '#x' selectors: an id that two modules reach for is a seam
     kind code in the frame's own modules, a kind letter compared or spelt into a key ('c:' +) is per-kind code
     css       per file: rules, `html:not(#_)` rules and the deepest chain, !important, raw colours outside a
               token definition, tokens defined, used, used but never defined, defined but never used, and
               defined in more than one file; every @media query and how often; transitions and animations and
               how many sit outside a prefers-reduced-motion guard; the distinct durations and easings */
import { readFile, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, dirname, basename, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const args = process.argv.slice(2);
const AS_JSON = args.includes('--json'), CHECK = args.includes('--check'), GRAPH = args.includes('--graph');

/* The lines (--check). Set at today's numbers, so the check holds the shape where it is and a stage of
   docs/migration.md tightens one line at a time. A line is a ceiling, never a target. */
export const LINES = {
  staticCycles: 1,       // the worker's dash <-> files <-> health ring (worker/); the site's modules have none
  fileKB: 220,           // the biggest module today is assets/app.js at 215 KiB
  fn: 80,                // lines a function may run to
  longFns: 12,           // functions over LINES.fn across every module (12 today)
  appExports: 73,        // what assets/app.js exports (73 today: it is the hub)
  htmlNot: 109,          // `html:not(#_)` selectors across the stylesheets (109 today, 105 of them in look.css)
  tokensUndefined: 1,    // a var(--x) no stylesheet or page defines (--sunk, cards.css: falls back to its rgba)
  tokensMultiFile: 21,   // a token defined in more than one stylesheet (the colour layers: app.css, theme.css, the page)
  rawColours: 240,       // hex, rgb() and hsl() colours written outside a token definition (240 today)
  firstPaintKB: 245,     // index.html + its stylesheets + the preloaded modules and their imports + two fonts, gzip of the
                         // source (241 today; the wire carries them minified and brotli: about 166 KiB, docs/architecture.md)
};

const rel = p => relative(ROOT, p).replace(/\\/g, '/');
const KB = n => Math.round(n / 1024 * 10) / 10;
async function files(dir, re){
  const out = [];
  for(const f of await readdir(join(ROOT, dir))) if(re.test(f)) out.push(join(ROOT, dir, f));
  return out.sort();
}
const text = async f => readFile(f, 'utf8');
const gz = s => gzipSync(Buffer.from(s)).length;

/* ---------- strings and comments blanked, newlines kept ---------- */
function blank(src){
  let out = '', i = 0, n = src.length;
  const keep = ch => (out += ch === '\n' ? '\n' : ' ');
  // a slash starts a regex when what came before it cannot end an expression
  const regexOK = () => {
    const before = out.replace(/\s+$/, '');
    if(!before) return true;
    const c = before[before.length - 1];
    if('(,=:[!&|?{};+-*%<>~^'.includes(c)) return true;
    return /(?:^|[^\w$.])(?:return|typeof|case|do|else|in|of|new|delete|void|throw)$/.test(before);
  };
  while(i < n){
    const c = src[i], d = src[i + 1];
    if(c === '/' && d === '/'){ while(i < n && src[i] !== '\n') { keep(src[i]); i++; } continue; }
    if(c === '/' && d === '*'){ while(i < n && !(src[i] === '*' && src[i + 1] === '/')) { keep(src[i]); i++; } keep(' '); keep(' '); i += 2; continue; }
    if(c === '\'' || c === '"'){
      out += c; i++;
      while(i < n && src[i] !== c){ if(src[i] === '\\'){ keep(src[i]); i++; } keep(src[i]); i++; }
      out += c; i++; continue;
    }
    if(c === '`'){
      out += c; i++;
      let depth = 0;
      while(i < n){
        if(depth === 0 && src[i] === '`') break;
        if(src[i] === '\\'){ keep(src[i]); i++; keep(src[i]); i++; continue; }
        if(src[i] === '$' && src[i + 1] === '{'){ depth++; out += '${'; i += 2; continue; }
        if(depth && src[i] === '{'){ depth++; out += '{'; i++; continue; }
        if(depth && src[i] === '}'){ depth--; out += '}'; i++; continue; }
        if(depth) out += src[i]; else keep(src[i]);
        i++;
      }
      out += '`'; i++; continue;
    }
    if(c === '/' && regexOK()){
      out += '/'; i++;
      let cls = false;
      while(i < n && src[i] !== '\n' && (cls || src[i] !== '/')){
        if(src[i] === '\\'){ keep(src[i]); i++; }
        else if(src[i] === '[') cls = true;
        else if(src[i] === ']') cls = false;
        keep(src[i]); i++;
      }
      out += '/'; i++;
      while(i < n && /[gimsuyd]/.test(src[i])){ out += src[i]; i++; }
      continue;
    }
    out += c; i++;
  }
  return out;
}

/* ---------- the module graph ---------- */
function edgesOf(file, src, plain){
  const out = [];
  const here = dirname(file);
  const add = (spec, how) => {
    if(!/^\.\.?\/.*\.js$/.test(spec)) return;   // a path built at run time ('./' + route + '.js') is read off the table below
    out.push({to: rel(join(here, spec)), how});
  };
  for(const m of src.matchAll(/^\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm)) add(m[1], 'static');
  for(const m of src.matchAll(/^\s*export\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/gm)) add(m[1], 'static');
  for(const m of src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) add(m[1], 'dynamic');
  for(const m of src.matchAll(/\blazy\(\s*['"]([^'"]+)['"]/g)) add(m[1], 'dynamic');
  for(const m of src.matchAll(/new Worker\(\s*new URL\(\s*['"]([^'"]+)['"]/g)) add(m[1], 'worker');
  return out;
}
function htmlEdges(file, src){
  const out = [];
  for(const m of src.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) out.push({to: m[1], how: 'html'});
  for(const m of src.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)) out.push({to: m[1], how: 'preload'});
  for(const m of src.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)) out.push({to: m[1], how: 'css'});
  for(const m of src.matchAll(/<link rel="preload" href="([^"]+)" as="font"/g)) out.push({to: m[1], how: 'font'});
  return out;
}
// strongly connected components (Tarjan), over the edges `ok` lets through
function cycles(nodes, edges, ok){
  const adj = new Map(nodes.map(n => [n, []]));
  for(const e of edges) if(ok(e) && adj.has(e.from) && adj.has(e.to)) adj.get(e.from).push(e.to);
  let index = 0;
  const idx = new Map(), low = new Map(), on = new Set(), stack = [], out = [];
  const go = v => {
    idx.set(v, index); low.set(v, index); index++; stack.push(v); on.add(v);
    for(const w of adj.get(v)){
      if(!idx.has(w)){ go(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if(on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if(low.get(v) === idx.get(v)){
      const comp = [];
      let w;
      do { w = stack.pop(); on.delete(w); comp.push(w); } while(w !== v);
      if(comp.length > 1) out.push(comp.sort());
    }
  };
  for(const n of nodes) if(!idx.has(n)) go(n);
  return out;
}
// the longest static chain from a module (depth of the import graph under it)
function depth(from, edges, seen = new Set()){
  if(seen.has(from)) return 0;
  seen.add(from);
  let d = 0;
  for(const e of edges) if(e.from === from && e.how === 'static') d = Math.max(d, 1 + depth(e.to, edges, seen));
  seen.delete(from);
  return d;
}
function closure(start, edges, hows){
  const out = new Set(), todo = [...start];
  while(todo.length){
    const f = todo.pop();
    if(out.has(f)) continue;
    out.add(f);
    for(const e of edges) if(e.from === f && hows.includes(e.how)) todo.push(e.to);
  }
  return out;
}

/* ---------- functions ---------- */
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'else', 'do', 'try', 'with', 'typeof', 'await', 'new', 'throw', 'case']);
function functions(plain){
  const out = [];
  const lineOf = pos => plain.slice(0, pos).split('\n').length;
  const closeFrom = open => {   // the index of the brace that closes the one at `open`
    let d = 0;
    for(let i = open; i < plain.length; i++){
      if(plain[i] === '{') d++;
      else if(plain[i] === '}' && --d === 0) return i;
    }
    return -1;
  };
  const bodyAfterParams = at => {   // `(` at `at`: the `{` after its matching `)`
    let d = 0;
    for(let i = at; i < plain.length; i++){
      if(plain[i] === '(') d++;
      else if(plain[i] === ')' && --d === 0){
        const rest = plain.slice(i + 1, i + 40);
        const m = rest.match(/^\s*(?:=>\s*)?\{/);
        return m ? i + 1 + m[0].length - 1 : -1;
      }
    }
    return -1;
  };
  const take = (name, open, kind) => {
    if(open < 0) return;
    const close = closeFrom(open);
    if(close < 0) return;
    const start = lineOf(open), lines = lineOf(close) - start + 1;
    out.push({name, line: start, lines, kind});
  };
  for(const m of plain.matchAll(/\bfunction\s*(\w*)\s*\(/g)){
    take(m[1] || '(anonymous)', bodyAfterParams(m.index + m[0].length - 1), 'function');
  }
  for(const m of plain.matchAll(/(\w+)\s*(?:=|:)\s*(?:async\s*)?\(/g)){
    const at = m.index + m[0].length - 1;
    // only an arrow with a block body
    let d = 0, i = at;
    for(; i < plain.length; i++){
      if(plain[i] === '(') d++;
      else if(plain[i] === ')' && --d === 0) break;
    }
    if(!/^\s*=>\s*\{/.test(plain.slice(i + 1, i + 12))) continue;
    take(m[1], bodyAfterParams(at), 'arrow');
  }
  for(const m of plain.matchAll(/(\w+)\s*(?:=|:)\s*(?:async\s*)?(\w+)\s*=>\s*\{/g)){
    if(KEYWORDS.has(m[1])) continue;
    take(m[1], m.index + m[0].length - 1, 'arrow');
  }
  for(const m of plain.matchAll(/^\s*(?:async\s+)?(\w+)\s*\(([^()]*)\)\s*\{/gm)){
    if(KEYWORDS.has(m[1])) continue;
    take(m[1], m.index + m[0].length - 1, 'method');
  }
  // the same body found two ways is one function
  const seen = new Set();
  return out.filter(f => { const k = f.line + ':' + f.lines; if(seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.line - b.line);
}

/* ---------- css ---------- */
function cssReport(name, src){
  const plain = src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  const rules = (plain.match(/\{/g) || []).length;
  const htmlNot = (plain.match(/html:not\(#_\)/g) || []).length;
  let deepest = 0;
  for(const m of plain.matchAll(/(?:html:not\(#_\)\s*)+/g)) deepest = Math.max(deepest, (m[0].match(/html:not/g) || []).length);
  const important = (plain.match(/!important/g) || []).length;
  const defined = new Map();   // token -> how many times defined here
  for(const m of plain.matchAll(/(--[\w-]+)\s*:/g)) defined.set(m[1], (defined.get(m[1]) || 0) + 1);
  const used = new Set();
  for(const m of plain.matchAll(/var\(\s*(--[\w-]+)/g)) used.add(m[1]);
  // a colour written out, in a declaration that is not a token's own definition
  let raw = 0;
  for(const line of plain.split('\n')){
    for(const decl of line.split(';')){
      if(/^\s*--[\w-]+\s*:/.test(decl) || /[{,]\s*--[\w-]+\s*:/.test(decl)) continue;
      raw += (decl.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) || []).length;
    }
  }
  const media = {};
  for(const m of plain.matchAll(/@media\s*([^{]+)\{/g)){ const q = m[1].replace(/\s+/g, ' ').trim(); media[q] = (media[q] || 0) + 1; }
  const container = (plain.match(/@container/g) || []).length;
  // motion: every transition and animation, and how many sit inside a reduced-motion block
  let motion = 0, guarded = 0;
  const durations = new Set(), easings = new Set();
  for(const m of plain.matchAll(/@media[^{]*prefers-reduced-motion[^{]*\{([\s\S]*?)\}\s*\}/g)) guarded += (m[1].match(/transition|animation/g) || []).length;
  motion = (plain.match(/\b(?:transition|animation)(?:-\w+)?\s*:/g) || []).length;
  for(const m of plain.matchAll(/\b(?:transition|animation)\s*:([^;}]+)/g)){
    for(const d of m[1].matchAll(/(\d*\.?\d+m?s)\b/g)) durations.add(d[1]);
    for(const e of m[1].matchAll(/\b(ease(?:-in|-out|-in-out)?|linear|steps\([^)]*\)|cubic-bezier\([^)]*\))/g)) easings.add(e[1]);
  }
  const keyframes = (plain.match(/@keyframes/g) || []).length;
  return {file: name, bytes: Buffer.byteLength(src), gzip: gz(src), lines: src.split('\n').length, rules, htmlNot, deepest, important,
    raw, defined: [...defined.keys()], used: [...used], media, container, motion, guarded, keyframes,
    durations: [...durations].sort(), easings: [...easings].sort()};
}

/* ---------- the run ---------- */
const modules = [...await files('assets', /\.js$/), join(ROOT, 'sw.js'), ...await files('worker', /\.js$/)];
const pages = ['index.html', 'explore.html', 'privacy.html', 'admin.html'].map(p => join(ROOT, p));
const sheets = await files('assets', /\.css$/);
const kinds = await import(pathToFileURL(join(ROOT, 'assets', 'kinds.js')).href);

const mod = {};
const edges = [];
for(const f of modules){
  const src = await text(f), plain = blank(src), name = rel(f);
  const fns = functions(plain);
  const exportsList = [...src.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function|class)\s+(\w+)/gm)].map(m => m[1]);
  for(const m of src.matchAll(/^export\s*\{([^}]+)\}/gm)) for(const e of m[1].split(',')) exportsList.push(e.trim().split(/\s+as\s+/).pop());
  const globals = new Set();
  for(const m of plain.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)/g)) if(!/^(addEventListener|removeEventListener|scrollTo|scrollY|scrollX|innerWidth|innerHeight|location|top|self|requestIdleCallback|visualViewport|matchMedia|getComputedStyle|open|caches|AudioContext|webkitAudioContext|doNotTrack|navigator|setTimeout|dispatchEvent|history|document)$/.test(m[1])) globals.add(m[1]);
  for(const m of src.matchAll(/\b(WI_[A-Z_]+|PoE|__wi\w+|wiLive)\b/g)) globals.add(m[1]);
  const storage = new Set();
  for(const m of src.matchAll(/(localStorage|sessionStorage)\.(?:get|set|remove)Item\(\s*(?:'([^']+)'|(\w+))/g)){
    let key = m[2];
    if(!key){ const c = src.match(new RegExp('(?:const|let)\\s+' + m[3] + '\\s*=\\s*\'([^\']+)\'')); key = c ? c[1] : '<' + m[3] + '>'; }
    storage.add(m[1][0] + ':' + key);
  }
  const ids = new Set();
  for(const m of src.matchAll(/getElementById\(\s*'([^']+)'/g)) ids.add(m[1]);
  for(const m of src.matchAll(/\$\(\s*'#([\w-]+)'/g)) ids.add(m[1]);
  for(const m of src.matchAll(/querySelector(?:All)?\(\s*'#([\w-]+)'/g)) ids.add(m[1]);
  // per-kind code: a kind letter compared, or spelt into a key. Not in assets/kinds.js, which is the table itself
  const kindCode = [];
  if(name !== 'assets/kinds.js') for(const [i, line] of src.split('\n').entries()){
    if(/\.k\s*===?\s*'[a-z]'|'[a-z]:'\s*\+|k:\s*'[a-z]'\s*[,}]|KIND\.[a-z]\b|=== 'c' &&/.test(line) && !/^\s*(\/\/|\/\*|\*)/.test(line)) kindCode.push(i + 1);
  }
  mod[name] = {bytes: Buffer.byteLength(src), gzip: gz(src), lines: src.split('\n').length, exports: exportsList, fns: fns.length,
    long: fns.filter(x => x.lines > LINES.fn).map(x => ({name: x.name, line: x.line, lines: x.lines})),
    globals: [...globals].sort(), storage: [...storage].sort(), ids: [...ids].sort(), kindCode};
  for(const e of edgesOf(f, src, plain)) edges.push({from: name, ...e});
}
// the router: one dynamic edge per open route (assets/app.js modOf)
for(const r of Object.keys(kinds.ROUTES)){
  if(r === 'home' || r in kinds.SHUT) continue;
  edges.push({from: 'assets/app.js', to: 'assets/' + ({trade: 'tradepage'}[r] || r) + '.js', how: 'dynamic', via: 'route ' + r});
}
const page = {};
for(const f of pages){
  const src = await text(f), name = rel(f);
  const es = htmlEdges(f, src);
  for(const e of es) edges.push({from: name, to: e.to, how: e.how});
  const inline = [...src.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  page[name] = {bytes: Buffer.byteLength(src), gzip: gz(src), inlineScripts: inline.length, inlineBytes: inline.reduce((a, s) => a + s.length, 0),
    globals: [...new Set([...src.matchAll(/\b(WI_[A-Z_]+|PoE|__wi\w+)\b/g)].map(m => m[1]))].sort()};
}
const names = Object.keys(mod);
const seen = new Set();
const uniqueEdges = edges.filter(e => { const k = e.from + '>' + e.to + ':' + e.how; if(seen.has(k)) return false; seen.add(k); return true; });
const fanIn = {}, fanOut = {};
for(const e of uniqueEdges){
  if(!(e.from in mod)) continue;
  fanOut[e.from] = (fanOut[e.from] || 0) + 1;
  fanIn[e.to] = (fanIn[e.to] || 0) + 1;
}
const staticCycles = cycles(names, uniqueEdges, e => e.how === 'static');
const allCycles = cycles(names, uniqueEdges, e => e.how !== 'html');

// what each export of the hub is used by
const hubUse = {};
const appSrc = await text(join(ROOT, 'assets', 'app.js'));
for(const name of mod['assets/app.js'].exports) hubUse[name] = [];
for(const f of modules){
  const name = rel(f);
  if(name === 'assets/app.js') continue;
  const src = await text(f);
  const m = src.match(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/app\.js['"]/g);
  if(!m) continue;
  for(const im of m) for(const x of im.replace(/import\s*\{|\}\s*from.*/g, '').split(',')){
    const n = x.trim().split(/\s+as\s+/)[0];
    if(n in hubUse) hubUse[n].push(name);
  }
}
// exported, named in no static import, and not reached as m.NAME after a dynamic import (assets/bridge.js) either
const others = (await Promise.all(modules.filter(f => rel(f) !== 'assets/app.js').map(text))).join('\n');
const unusedHub = Object.entries(hubUse).filter(([k, v]) => !v.length && !new RegExp('\\.' + k + '\\b').test(others)).map(([k]) => k);

// first paint: index.html, its stylesheets, fonts, and the modules it preloads with their static closure
const fp = uniqueEdges.filter(e => e.from === 'index.html');
const fpMods = closure(fp.filter(e => e.how === 'preload' || e.how === 'html').map(e => e.to), uniqueEdges, ['static']);
const fpFiles = ['index.html', ...fp.filter(e => e.how === 'css' || e.how === 'font').map(e => e.to), ...fpMods];
let fpRaw = 0, fpGz = 0;
const fpList = [];
for(const f of fpFiles){
  const p = join(ROOT, f);
  let bytes, gzip;
  if(/\.woff2$/.test(f)){ bytes = (await stat(p)).size; gzip = bytes; }
  else { const s = await text(p); bytes = Buffer.byteLength(s); gzip = gz(s); }
  fpRaw += bytes; fpGz += gzip;
  fpList.push({file: f, bytes, gzip});
}

const css = [];
for(const f of sheets) css.push(cssReport(rel(f), await text(f)));
// tokens, across every sheet and the pages' inline styles
const pageStyles = [];
for(const f of pages) for(const m of (await text(f)).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) pageStyles.push(m[1]);
const definedIn = {};
for(const c of css) for(const t of c.defined) (definedIn[t] = definedIn[t] || []).push(c.file);
for(const s of pageStyles) for(const m of s.matchAll(/(--[\w-]+)\s*:/g)) (definedIn[m[1]] = definedIn[m[1]] || []).push('(page)');
// a token a module sets in a style attribute or with setProperty counts as defined by that module
for(const f of modules){ const src = await text(f); for(const m of src.matchAll(/(?:setProperty\(\s*'|style="[^"]*?|style\.setProperty\(')(--[\w-]+)\s*[:'",]/g)) (definedIn[m[1]] = definedIn[m[1]] || []).push(rel(f)); }
const usedAll = new Set(css.flatMap(c => c.used));
const undefinedTokens = [...usedAll].filter(t => !definedIn[t]).sort();
const unusedTokens = Object.keys(definedIn).filter(t => !usedAll.has(t) && !definedIn[t].includes('(page)')).sort();
const multiFile = Object.entries(definedIn).filter(([, fs]) => new Set(fs.filter(x => x !== '(page)')).size > 1).map(([t, fs]) => t + ' (' + [...new Set(fs)].map(x => basename(x)).join(', ') + ')').sort();
const mediaAll = {};
for(const c of css) for(const [q, n] of Object.entries(c.media)) mediaAll[q] = (mediaAll[q] || 0) + n;

const sharedIds = {};
for(const [name, m] of Object.entries(mod)) for(const id of m.ids) (sharedIds[id] = sharedIds[id] || []).push(name);
const seams = Object.entries(sharedIds).filter(([, fs]) => fs.length > 1).sort((a, b) => b[1].length - a[1].length);
const globalsAll = {};
for(const [name, m] of Object.entries(mod)) for(const g of m.globals) (globalsAll[g] = globalsAll[g] || []).push(name);
for(const [name, p] of Object.entries(page)) for(const g of p.globals) (globalsAll[g] = globalsAll[g] || []).push(name);
const storageAll = {};
for(const [name, m] of Object.entries(mod)) for(const k of m.storage) (storageAll[k] = storageAll[k] || []).push(name);

const table = {kinds: Object.keys(kinds.KINDS || {}).length, fields: Object.keys(kinds.FIELDS).length,
  types: new Set(Object.values(kinds.FIELDS).map(f => f.type)).size, rels: Object.keys(kinds.REL).length,
  acts: Object.keys(kinds.ACTS).length, routes: Object.keys(kinds.ROUTES).length, shut: Object.keys(kinds.SHUT).length,
  caps: kinds.FRAME.cap};
// the routes: each one's module, its size and its lifecycle exports
const routes = {};
for(const r of Object.keys(kinds.ROUTES)){
  if(r === 'home') continue;
  const file = 'assets/' + ({trade: 'tradepage'}[r] || r) + '.js', m = mod[file];
  routes[r] = {file, shut: r in kinds.SHUT, kb: m ? KB(m.bytes) : null, lifecycle: m ? m.exports.filter(x => /^(mount|unmount|update)$/.test(x)) : []};
}

const longAll = Object.entries(mod).flatMap(([f, m]) => m.long.map(x => ({file: f, ...x}))).sort((a, b) => b.lines - a.lines);
const out = {
  at: new Date().toISOString(),
  modules: Object.fromEntries(Object.entries(mod).map(([k, m]) => [k, {kb: KB(m.bytes), gzipKb: KB(m.gzip), lines: m.lines, exports: m.exports.length, fns: m.fns, long: m.long.length,
    fanIn: fanIn[k] || 0, fanOut: fanOut[k] || 0, depth: depth(k, uniqueEdges), kindCode: m.kindCode.length}])),
  pages: Object.fromEntries(Object.entries(page).map(([k, p]) => [k, {kb: KB(p.bytes), gzipKb: KB(p.gzip), inlineScripts: p.inlineScripts, inlineKb: KB(p.inlineBytes), globals: p.globals}])),
  edges: uniqueEdges,
  cycles: {static: staticCycles, all: allCycles},
  hub: {exports: mod['assets/app.js'].exports.length, importers: [...new Set(uniqueEdges.filter(e => e.to === 'assets/app.js' && e.how === 'static').map(e => e.from))].length,
    importedByNone: unusedHub, mostImported: Object.entries(hubUse).map(([k, v]) => [k, v.length]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).slice(0, 12)},
  firstPaint: {files: fpList, rawKb: KB(fpRaw), gzipKb: KB(fpGz)},
  longFunctions: longAll,
  globals: globalsAll, storage: storageAll, sharedIds: Object.fromEntries(seams),
  kindCode: Object.fromEntries(Object.entries(mod).filter(([, m]) => m.kindCode.length).map(([k, m]) => [k, m.kindCode])),
  css: css.map(c => ({...c, defined: c.defined.length, used: c.used.length})),
  tokens: {defined: Object.keys(definedIn).length, used: usedAll.size, undefined: undefinedTokens, unused: unusedTokens, multiFile},
  media: Object.entries(mediaAll).sort((a, b) => b[1] - a[1]),
  table, routes,
};

/* ---------- the check ---------- */
const over = [];
const line = (name, v, cap, more = v > cap) => { if(more) over.push(name + ' ' + v + ' > ' + cap); };
line('staticCycles', staticCycles.length, LINES.staticCycles);
for(const [k, m] of Object.entries(mod)) line('fileKB ' + k, KB(m.bytes), LINES.fileKB);
line('longFns', longAll.length, LINES.longFns);
line('appExports', mod['assets/app.js'].exports.length, LINES.appExports);
line('htmlNot', css.reduce((a, c) => a + c.htmlNot, 0), LINES.htmlNot);
line('tokensUndefined', undefinedTokens.length, LINES.tokensUndefined);
line('tokensMultiFile', multiFile.length, LINES.tokensMultiFile);
line('rawColours', css.reduce((a, c) => a + c.raw, 0), LINES.rawColours);
line('firstPaintKB', KB(fpGz), LINES.firstPaintKB);
out.over = over;

/* ---------- print ---------- */
if(GRAPH){
  for(const e of uniqueEdges) console.log(e.from + ' -> ' + e.to + '  ' + e.how + (e.via ? ' (' + e.via + ')' : ''));
} else if(AS_JSON){
  console.log(JSON.stringify(out, null, 1));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  const num = (s, n) => String(s).padStart(n);
  console.log('modules  ' + names.length + ' · edges ' + uniqueEdges.length + ' (static ' + uniqueEdges.filter(e => e.how === 'static').length +
    ', dynamic ' + uniqueEdges.filter(e => e.how === 'dynamic').length + ', worker ' + uniqueEdges.filter(e => e.how === 'worker').length + ')');
  console.log('cycles   static ' + staticCycles.length + (staticCycles.length ? ': ' + staticCycles.map(c => c.join(' <-> ')).join('; ') : '') +
    ' · with dynamic ' + allCycles.length + (allCycles.length ? ': ' + allCycles.map(c => c.length + ' modules (' + c.slice(0, 4).join(', ') + (c.length > 4 ? ', ...' : '') + ')').join('; ') : ''));
  console.log('\n' + pad('module', 26) + num('KiB', 7) + num('gzip', 7) + num('lines', 7) + num('exp', 5) + num('fns', 5) + num('long', 5) + num('in', 4) + num('out', 4) + num('depth', 6) + num('kind', 5));
  for(const [k, m] of Object.entries(out.modules).sort((a, b) => b[1].kb - a[1].kb))
    console.log(pad(k, 26) + num(m.kb, 7) + num(m.gzipKb, 7) + num(m.lines, 7) + num(m.exports, 5) + num(m.fns, 5) + num(m.long, 5) + num(m.fanIn, 4) + num(m.fanOut, 4) + num(m.depth, 6) + num(m.kindCode || '', 5));
  console.log('\npages    ' + Object.entries(out.pages).map(([k, p]) => k + ' ' + p.kb + ' KiB (gzip ' + p.gzipKb + ', ' + p.inlineScripts + ' inline scripts, ' + p.inlineKb + ' KiB)').join(' · '));
  console.log('hub      assets/app.js exports ' + out.hub.exports + ', imported by ' + out.hub.importers + ' modules; most used: ' +
    out.hub.mostImported.map(([k, n]) => k + ' ' + n).join(', ') + '; exported and imported by none: ' + (unusedHub.length ? unusedHub.join(', ') : 'none'));
  console.log('first    ' + fpList.length + ' files, ' + out.firstPaint.rawKb + ' KiB raw, ' + out.firstPaint.gzipKb + ' KiB gzip: ' + fpList.map(f => basename(f.file) + ' ' + KB(f.gzip)).join(', '));
  console.log('\nlong functions (over ' + LINES.fn + ' lines): ' + longAll.length);
  for(const f of longAll.slice(0, 40)) console.log('  ' + pad(f.file + ':' + f.line, 30) + pad(f.name, 22) + f.lines);
  if(longAll.length > 40) console.log('  ... and ' + (longAll.length - 40) + ' more (--json for all)');
  console.log('\nglobals  ' + Object.entries(globalsAll).map(([g, fs]) => g + ' (' + [...new Set(fs)].map(x => basename(x)).join(', ') + ')').join(' · '));
  console.log('storage  ' + Object.entries(storageAll).map(([k, fs]) => k + ' (' + fs.map(x => basename(x)).join(', ') + ')').join(' · '));
  console.log('dom ids reached from more than one module: ' + seams.map(([id, fs]) => '#' + id + ' (' + fs.map(x => basename(x)).join(', ') + ')').join(' · '));
  console.log('per-kind code in modules: ' + Object.entries(out.kindCode).map(([k, ls]) => k + ' ' + ls.length + ' lines (' + ls.slice(0, 6).join(', ') + (ls.length > 6 ? ', ...' : '') + ')').join(' · '));
  console.log('\n' + pad('stylesheet', 20) + num('KiB', 6) + num('gzip', 6) + num('rules', 6) + num('html:not', 9) + num('deep', 5) + num('!imp', 5) + num('raw', 5) + num('def', 5) + num('used', 5) + num('media', 6) + num('motion', 7) + num('guard', 6) + num('frames', 7));
  for(const c of out.css) console.log(pad(c.file, 20) + num(KB(c.bytes), 6) + num(KB(c.gzip), 6) + num(c.rules, 6) + num(c.htmlNot, 9) + num(c.deepest, 5) + num(c.important, 5) + num(c.raw, 5) + num(c.defined, 5) + num(c.used, 5) + num(Object.values(c.media).reduce((a, b) => a + b, 0), 6) + num(c.motion, 7) + num(c.guarded, 6) + num(c.keyframes, 7));
  console.log('tokens   defined ' + out.tokens.defined + ' · used ' + out.tokens.used + ' · used but undefined ' + undefinedTokens.length + (undefinedTokens.length ? ' (' + undefinedTokens.join(', ') + ')' : '') +
    ' · defined but unused ' + unusedTokens.length + (unusedTokens.length ? ' (' + unusedTokens.slice(0, 12).join(', ') + (unusedTokens.length > 12 ? ', ...' : '') + ')' : '') +
    ' · defined in more than one sheet ' + multiFile.length + (multiFile.length ? ':\n         ' + multiFile.join('\n         ') : ''));
  console.log('media    ' + out.media.map(([q, n]) => q + ' ×' + n).join(' · '));
  console.log('motion   durations ' + [...new Set(css.flatMap(c => c.durations))].sort((a, b) => parseFloat(a) * (a.endsWith('ms') ? 1 : 1000) - parseFloat(b) * (b.endsWith('ms') ? 1 : 1000)).join(' ') +
    ' · easings ' + [...new Set(css.flatMap(c => c.easings))].join(' '));
  console.log('\ntable    kinds ' + table.kinds + ' · fields ' + table.fields + ' · field types ' + table.types + ' · rels ' + table.rels + ' · acts ' + table.acts +
    ' · routes ' + table.routes + ' (shut ' + table.shut + ') · caps ' + JSON.stringify(table.caps));
  console.log('routes   ' + Object.entries(routes).map(([r, x]) => r + (x.shut ? ' (shut)' : '') + ' ' + basename(x.file) + ' ' + x.kb + ' KiB [' + x.lifecycle.join(' ') + ']').join(' · '));
  console.log('\n' + (over.length ? 'over the line: ' + over.join('; ') : 'within every line'));
}
if(CHECK && over.length) process.exit(1);
