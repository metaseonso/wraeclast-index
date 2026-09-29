/* The six answers. Each is short plain text: what the card says, then its price on lines of its own with the time
   it was checked and where from, then Wraeclast Index and the card's page. No game ids, no stat ids. */
import { KINDS, ORDER, kindOf, slugify, didOf } from './wi.js';
import { SITE, pageOf, itemWords, kindLine, money, plain, changeText, age, priceSource, checkedAt, when } from './words.js';

export const TERMS = 'Site data CC BY 4.0: credit Wraeclast Index and link the page. Game text © Grinding Gear Games.';
const source = url => 'Source: Wraeclast Index, ' + url;
const SEARCH_MAX = 10, LINE_MAX = 12, PATCH_MAX = 5, PATCH_LINES = 6, PATCH_CARDS = 20, DAYS_SHOWN = 14;

export class NotFound extends Error {}

/* ---------- GGG's patch notes (assets/app.js patchName, patchesOf; assets/kinds.js namedIn) ---------- */
export const patchName = p => {
  const t = String(p.title || '');
  const cu = /^Content Update (\S+)/.exec(t);
  return cu ? cu[1] : t.replace(/\s+Patch ?notes\b.*$/i, '') || t || p.id || '';
};
const WHOLE = new Set(['w', 'd']);   // kinds whose name is the game's own word: only a whole-word mention counts
const CAPWORD = /^[A-Z][\w']*$/;
export function namedIn(key, line){
  const at = key.indexOf(':'), name = key.slice(at + 1);
  if(!WHOLE.has(key.slice(0, at))) return true;
  const re = new RegExp("(^|[^\\w'-])" + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "(?:'s|s)?(?!\\w)", 'g');
  for(let m; (m = re.exec(line)); ){
    const s = m.index + m[1].length, e = m.index + m[0].length;
    const pre = /([A-Za-z][\w']*) $/.exec(line.slice(0, s)), post = /^ ([A-Za-z][\w']*)/.exec(line.slice(e));
    const open = pre && (pre.index === 0 || /[.:;!?"(] ?$/.test(line.slice(0, pre.index)));
    if(!(pre && !open && CAPWORD.test(pre[1])) && !(post && CAPWORD.test(post[1]))) return true;
    re.lastIndex = e;
  }
  return false;
}
function patchesOf(t, key){
  const by = new Map();
  for(const i of (t && t.on && t.on[key]) || []){
    const l = t.lines[i];
    if(!l || !namedIn(key, l[2])) continue;
    if(!by.has(l[0])) by.set(l[0], []);
    by.get(l[0]).push(l[2]);
  }
  return [...by.entries()].sort((a, b) => b[0] - a[0]);
}
const clip = (s, n) => s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';

export class Answers {
  constructor(index, {now = () => Date.now()} = {}){
    this.ix = index;
    this.now = now;
  }

  /* ---------- finding a card ---------- */
  async rank(words, k, full = true){
    const q = String(words || '').trim().toLowerCase(), qs = slugify(q), qw = q.split(/\s+/).filter(Boolean);
    if(!qw.length) return [];
    const hits = [];
    for(const kk of k ? [k] : ORDER){
      for(const e of await this.ix.list(kk)){
        const n = e.it.n.toLowerCase(), s = (e.it.s || '').toLowerCase();
        const score = n === q ? 100 : e.slug === qs ? 95 : n.startsWith(q) ? 80 : qw.every(w => n.includes(w)) ? 60 :
          qw.every(w => (n + ' ' + s).includes(w)) ? 40 : 0;
        if(score) hits.push({e, score});
      }
    }
    // nothing in the names: the cards' own lines
    if(!hits.length && full) for(const kk of k ? [k] : ORDER){
      for(const e of await this.ix.words(kk)){
        const low = e.words.toLowerCase();
        if(!qw.every(w => low.includes(w))) continue;
        const lines = e.words.split('\n'), s = lines[1] ? lines[1].replace(/ · https?:\S+$/, '') : '';
        hits.push({e: {...e, it: {...e.it, s}}, score: 20, line: lines.slice(2).find(l => l.toLowerCase().includes(qw[0]))});
      }
    }
    return hits.sort((a, b) => b.score - a.score || KINDS[a.e.k].rank - KINDS[b.e.k].rank ||
      a.e.it.n.length - b.e.it.n.length || (a.e.it.n < b.e.it.n ? -1 : a.e.it.n > b.e.it.n ? 1 : 0));
  }

  async find(name, kind){
    const k = kindOf(kind);
    const q = String(name || '').trim();
    if(!q) throw new NotFound('A card name is needed.');
    const s = slugify(q), ql = q.toLowerCase();
    let e = await this.ix.entry(s);
    if(e && (!k || e.k === k)) return e;
    if(k){
      e = await this.ix.entry(s + '-' + KINDS[k].word);
      if(e && e.k === k) return e;
    }
    for(const kk of k ? [k] : ORDER){
      const hit = (await this.ix.list(kk)).find(r => r.it.n.toLowerCase() === ql || String(r.it.id).toLowerCase() === ql);
      if(hit) return this.ix.entry(hit.slug);
    }
    const hits = await this.rank(q, k, false);
    if(hits.length && hits[0].score >= 60 && (hits.length === 1 || hits[1].score < hits[0].score)){
      const best = await this.ix.entry(hits[0].e.slug);
      if(best) return best;
    }
    const near = hits.slice(0, 3).map(h => h.e.it.n + ' (' + KINDS[h.e.k].word + ')');
    throw new NotFound('No card named "' + q + '"' + (k ? ' among ' + KINDS[k].word + ' cards' : '') + '.' +
      (near.length ? ' Closest: ' + near.join(', ') + '.' : ''));
  }

  /* ---------- a price, on lines of its own ---------- */
  async priceLines(e, unit){
    let got;
    try { got = await this.ix.priceOf(e); } catch { return ['Price: the price file did not load.']; }
    const {m, px} = got;
    if(!px) return [];
    const out = [];
    if(px.v === undefined || px.v === null){
      out.push('Price: none. Nobody listed it at the last check.');
    } else {
      const ch = changeText(px.ch);
      out.push('Price: ' + money(px.v, m.rate, unit) + (ch ? ', ' + ch : '') + '.');
    }
    out.push('Checked: ' + age(this.now(), checkedAt(m, px)) + '.');
    out.push('Price source: ' + priceSource(m, px) + '.');
    return out;
  }
  async anointLines(e){
    const it = e.it;
    if(e.k !== 'p' || !it.rec || !it.rec.length) return [];
    const out = ['Anoint: ' + it.rec.join(' + ')];
    let m;
    try { m = await this.ix.market(); } catch { return out; }
    const rows = it.rec.map(n => m.M['c:' + n]);
    if(rows.every(x => x && x.v !== undefined && x.v !== null)){
      const div = rows.reduce((a, x) => a + x.v, 0);
      const at = rows.map(x => x.at).filter(Boolean).sort().pop() || m.updated;
      out.push('Anoint cost: ' + money(div, m.rate) + '.', 'Checked: ' + age(this.now(), at) + '.',
        'Price source: ' + (m.league ? m.league + ' league, ' : '') + 'oils on the in-game Currency Exchange.');
    }
    return out;
  }

  /* ---------- the tools ---------- */
  async search({words, kind}){
    const k = kindOf(kind);
    const hits = await this.rank(words, k);
    const q = String(words || '').trim();
    if(!hits.length) return 'No cards for "' + q + '"' + (k ? ' among ' + KINDS[k].word + ' cards' : '') + '.\n\n' + source(SITE);
    const out = ['Search "' + q + '"' + (k ? ', ' + KINDS[k].word + ' cards' : '') + ': ' + hits.length +
      (hits.length === 1 ? ' card' : ' cards') + (hits.length > SEARCH_MAX ? ', first ' + SEARCH_MAX + ' shown' : '') + '.'];
    for(const h of hits.slice(0, SEARCH_MAX)){
      out.push('- ' + h.e.it.n + ' · ' + kindLine(h.e) + ' · ' + pageOf(h.e));
      if(h.line) out.push('  ' + clip(h.line, 140));
    }
    out.push('', source(SITE));
    return out.join('\n');
  }

  async card({name, kind}){
    const e = await this.find(name, kind);
    const body = itemWords(e).split('\n').slice(2);
    const out = [e.it.n, kindLine(e) + ' · Path of Exile 2'];
    out.push(...body.slice(0, LINE_MAX));
    if(body.length > LINE_MAX) out.push('… ' + (body.length - LINE_MAX) + ' more lines on the page.');
    for(const g of e.group || []) out.push('Other version: ' + g.it.n + ', ' + g.it.s + ' · ' + pageOf(g));
    const an = await this.anointLines(e);
    if(an.length) out.push('', ...an);
    const px = await this.priceLines(e);
    if(px.length) out.push('', ...px);
    const base = await this.ix.base().catch(() => null);
    out.push('', source(pageOf(e)), 'Game data: the Path of Exile 2 game files' + (base && base.patch ? ', patch ' + base.patch : '') + '.', TERMS);
    return out.join('\n');
  }

  async price({name, kind, unit}){
    const e = await this.find(name, kind);
    const px = await this.priceLines(e, unit);
    const out = [e.it.n + ' · ' + kindLine(e)];
    if(px.length) out.push(...px);
    else out.push('Wraeclast Index has no price for it.');
    out.push('', source(pageOf(e)), TERMS);
    return out.join('\n');
  }

  async history({name, kind}){
    const e = await this.find(name, kind);
    const {m, px} = await this.ix.priceOf(e);
    const out = [e.it.n + ' · ' + kindLine(e)];
    if(!px){
      out.push('Wraeclast Index has no price for it, and no price line.', '', source(pageOf(e)), TERMS);
      return out.join('\n');
    }
    const days = px.src === 'cx' ? await this.leagueDays(e, m).catch(() => null) : null;
    if(days){
      const lg = (m.leagues || []).find(l => l.name === days.league);
      // the market files price the Divine Orb itself in exalted, everything else in divines
      const ex = e.it.n === 'Divine Orb', say = v => ex ? plain(v) + ' ex' : money(v, m.rate, 'divine');
      out.push('Price by league day, ' + days.league + (lg && lg.start ? ' (day 1: ' + lg.start + ')' : '') + '. Prices in ' +
        (ex ? 'exalted' : 'divine') + ' orbs.');
      const pts = days.line.map((v, i) => [i + 1, v]);
      for(const [d, v] of pts.slice(-DAYS_SHOWN)) out.push('Day ' + d + ': ' + (v === null || v === undefined ? 'no trade' : say(v)));
      const real = pts.filter(p => p[1] !== null && p[1] !== undefined);
      if(real.length > 1){
        const lo = real.reduce((a, b) => b[1] < a[1] ? b : a), hi = real.reduce((a, b) => b[1] > a[1] ? b : a);
        out.push('League low: ' + say(lo[1]) + ', day ' + lo[0] + '.', 'League high: ' + say(hi[1]) + ', day ' + hi[0] + '.');
      }
      out.push('Line updated: ' + age(this.now(), days.updated) + '.', 'Line source: the in-game Currency Exchange, one price a league day.');
    } else if(px.sp && px.sp.length){
      out.push('Last ' + px.sp.length + (px.sp.length === 1 ? ' day' : ' days') + ', one price a day, oldest first. Prices in divine orbs.');
      out.push(px.sp.map(v => v === null || v === undefined ? 'no price' : money(v, m.rate, 'divine')).join(' · '));
      out.push('Last point checked: ' + age(this.now(), checkedAt(m, px)) + '.', 'Line source: ' + priceSource(m, px) + '.');
    } else out.push('No day-by-day line yet.');
    const now = await this.priceLines(e);
    if(now.length) out.push('', ...now);
    out.push('', source(pageOf(e)), TERMS);
    return out.join('\n');
  }
  /* a currency's line this league, from the daily market files: the bundle data/market/index.json names for it */
  async leagueDays(e, m){
    const idx = await this.ix.marketIndex();
    const did = e.it.did || didOf(e.it.n), at = idx.site && idx.site.cards && idx.site.cards[did];
    if(!at) return null;
    const bundle = await this.ix.marketFile('cards-' + at + '.json');
    const card = bundle && bundle.cards && bundle.cards[did];
    const row = card && (card.days || []).find(([lg]) => lg === m.league);
    return row && row[1] && row[1].length ? {league: row[0], line: row[1], updated: card.updated || bundle.updated} : null;
  }

  async changes({card, kind, patch}){
    if(patch) return this.patchChanges(String(patch).trim());
    if(card) return this.cardChanges(card, kind);
    return this.latestPatches();
  }
  async cardChanges(name, kind){
    const e = await this.find(name, kind);
    const t = await this.ix.patchnotes();
    const list = patchesOf(t, e.k + ':' + e.it.n);
    const out = [e.it.n + ' · ' + kindLine(e)];
    if(!list.length) out.push('No GGG patch-note line names it.');
    else out.push('Named in ' + list.length + (list.length === 1 ? ' patch' : ' patches') + ', newest first' +
      (list.length > PATCH_MAX ? ', ' + PATCH_MAX + ' shown' : '') + '.');
    for(const [pi, lines] of list.slice(0, PATCH_MAX)){
      const p = t.patches[pi] || {};
      out.push('', patchName(p) + (p.posted ? ', ' + when(p.posted) : '') + (p.notes ? ': ' + p.notes : ''));
      for(const l of lines.slice(0, PATCH_LINES)) out.push('- ' + clip(l, 300));
      if(lines.length > PATCH_LINES) out.push('- … ' + (lines.length - PATCH_LINES) + ' more lines in the notes.');
    }
    out.push('', 'Patch notes: GGG' + (t.source && t.source.url ? ', ' + t.source.url : '') + '.', source(pageOf(e)), TERMS);
    return out.join('\n');
  }
  async patchChanges(q){
    const ql = q.toLowerCase().replace(/^patch\s+/, '');
    const t = await this.ix.patchnotes();
    const pi = (t.patches || []).findIndex(p => [p.id, p.title, patchName(p)].some(x => x && String(x).toLowerCase() === ql));
    if(pi < 0){
      const log = await this.ix.changelog().catch(() => []);
      const v = ql.replace(/^(?:wraeclast index|wi|site)\s*/, '');
      const note = (Array.isArray(log) ? log : []).find(x => String(x.v) === v || (v === '' && x === log[0]));
      if(note) return this.siteNotes(note);
      const ids = [...(t.patches || [])].sort((a, b) => (b.posted || '').localeCompare(a.posted || '')).slice(0, 5).map(p => p.id);
      return 'No patch "' + q + '". Latest: ' + ids.join(', ') + '.\n\n' + source(SITE + '/#/patches');
    }
    const p = t.patches[pi];
    const reg = await this.ix.patches().catch(() => null);
    const row = reg && (reg.patches || []).find(x => x.id === p.id);
    const keys = [];
    for(const [key, list] of Object.entries(t.on || {})){
      if(list.some(i => t.lines[i] && t.lines[i][0] === pi && namedIn(key, t.lines[i][2]))) keys.push(key);
    }
    const out = [p.title || p.id];
    out.push('Posted: ' + (when(p.posted) || 'no time given') + '.' + (row && row.league ? ' League: ' + row.league + '.' : ''));
    if(p.notes) out.push('Notes: ' + p.notes);
    out.push('Cards its notes name: ' + keys.length + '.');
    let shown = 0;
    for(const key of keys){
      if(shown >= PATCH_CARDS) break;
      const k = key.slice(0, key.indexOf(':')), n = key.slice(key.indexOf(':') + 1);
      if(!KINDS[k]) continue;
      const e = (await this.ix.list(k)).find(r => r.it.n === n);
      if(!e) continue;
      out.push('- ' + n + ' · ' + KINDS[k].one + ' · ' + pageOf(e));
      shown++;
    }
    if(keys.length > shown) out.push('- … ' + (keys.length - shown) + ' more on the site.');
    out.push('', 'Patch notes: GGG' + (t.source && t.source.url ? ', ' + t.source.url : '') + '.', source(SITE + '/#/patches'), TERMS);
    return out.join('\n');
  }
  siteNotes(note){
    const out = ['Wraeclast Index ' + note.v + ', ' + note.date + (note.title ? ': ' + note.title : '')];
    for(const l of note.items || []) out.push('- ' + l);
    out.push('', source(SITE + '/data/changelog.json'));
    return out.join('\n');
  }
  async latestPatches(){
    const reg = await this.ix.patches();
    const t = await this.ix.patchnotes().catch(() => null);
    const byId = new Map(((t && t.patches) || []).map(p => [p.id, p]));
    const rows = [...(reg.patches || [])].sort((a, b) => (b.posted || b.live || '').localeCompare(a.posted || a.live || '')).slice(0, PATCH_MAX);
    const out = ['Latest game patches:'];
    for(const r of rows){
      const p = byId.get(r.id) || r;
      out.push('- ' + (p.title ? patchName(p) : r.v || r.id) + ', ' + (when(r.posted) || r.live || '') + (r.league ? ', ' + r.league : '') +
        (r.notes ? ': ' + r.notes : ''));
    }
    const log = await this.ix.changelog().catch(() => null);
    if(Array.isArray(log) && log[0]) out.push('', 'Wraeclast Index ' + log[0].v + ', ' + log[0].date + (log[0].title ? ': ' + log[0].title : '') + '.');
    out.push('', source(SITE + '/#/patches'));
    return out.join('\n');
  }

  async compare({names, kind}){
    const list = [...new Set((names || []).map(n => String(n).trim()).filter(Boolean))];
    if(list.length < 2) throw new NotFound('Two or more card names are needed.');
    const cards = [];
    for(const n of list.slice(0, 5)) cards.push(await this.find(n, kind));
    const rows = [];
    for(const e of cards){
      const body = itemWords(e).split('\n').slice(2);
      const req = body.find(l => /^(Requires|No requirements)/.test(l)) || '';
      let m = null, px = null;
      try { ({m, px} = await this.ix.priceOf(e)); } catch {}
      rows.push({e, body: body.filter(l => l !== req), req, m, px});
    }
    const cell = f => rows.map(f).join(' | ');
    const out = ['Compare: ' + cell(r => r.e.it.n)];
    out.push('Kind: ' + cell(r => kindLine(r.e)));
    out.push('Requires: ' + cell(r => r.req.replace(/^Requires(?: at gem level 20)?: /, '') || '—'));
    out.push('Price: ' + cell(r => r.px && r.px.v !== undefined && r.px.v !== null ? money(r.px.v, r.m.rate) : r.px ? 'none listed' : 'no price'));
    out.push('Checked: ' + cell(r => r.px ? age(this.now(), checkedAt(r.m, r.px)) : '—'));
    out.push('Price source: ' + cell(r => r.px ? priceSource(r.m, r.px) : '—'));
    for(const r of rows){
      out.push('', r.e.it.n + ' · ' + pageOf(r.e));
      for(const l of r.body.slice(0, 8)) out.push('- ' + l);
      if(r.body.length > 8) out.push('- … ' + (r.body.length - 8) + ' more lines on the page.');
    }
    if(list.length > 5) out.push('', 'Five cards at most: ' + list.slice(5).join(', ') + ' left out.');
    out.push('', 'Source: Wraeclast Index, ' + cards.map(pageOf).join(', '), TERMS);
    return out.join('\n');
  }
}
