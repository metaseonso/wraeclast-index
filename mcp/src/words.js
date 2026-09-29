/* A card in plain words, and a price with its age: the same words as the site's own plain-text files
   (worker/seo.js itemWords, factsOf, money, priceSource, ago). The tests hold itemWords to the words files the
   site ships, so the two cannot drift apart unseen. */
import { KINDS } from './wi.js';

export const SITE = 'https://wraeclastindex.fyi';
export const pageOf = e => SITE + '/item/' + e.slug;

const GEM_LEVELS = [0, 3, 6, 10, 14, 18, 22, 26, 31, 36, 41, 46, 52, 58, 64, 66, 72, 78, 84, 90];
function gemReq(w, gemLevel){
  const lv = GEM_LEVELS[Math.min(gemLevel, 20) - 1];
  const attr = x => x ? Math.floor((5 + (lv - 3) * 1.7) * Math.pow(x / 100, 0.9) + 0.5) + 4 : 0;
  return [lv, attr(w[0]), attr(w[1]), attr(w[2])];
}
const ATTR = ['Str', 'Dex', 'Int'];
export function reqText(rq){
  const out = [];
  if(rq[0] > 1) out.push('level ' + rq[0]);
  ATTR.forEach((a, i) => { if(rq[i + 1]) out.push(rq[i + 1] + ' ' + a); });
  return out.length ? out.join(', ') : 'none';
}
function costWords([v, res]){
  const pct = /Percent/.test(res);
  const words = res.replace('Percent', '').replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
  return v + (pct ? '%' : '') + ' ' + words.map((w, i) => i ? w.toLowerCase() : w).join(' ');
}
export function factsOf(it){
  const f = [];
  if(it.k === 'g'){
    if(it.ct) f.push(+(it.ct / 1000).toFixed(2) + ' s use time');
    if(it.cost) f.push(costWords(it.cost) + ' at gem level 20');
    if(it.sp !== undefined) f.push(it.sp + ' Spirit');
  }
  if((it.k === 'u' || it.k === 'b') && it.pr) f.push(...it.pr);
  if(it.k === 'r'){
    if(it.wp) f.push('Waypoint');
    if(it.town) f.push('Town');
    if(it.rs) f.push(it.rs + '% to all Elemental Resistances');
    f.push(...(it.bio || []), ...(it.mc || []));
  }
  if(it.k === 'j'){
    if(it.gb) f.push('Given by ' + it.gb);
    if(it.rf) f.push('Reward from ' + it.rf);
  }
  if(it.k === 'w' && it.use){
    const parts = [];
    for(const [k, one, many] of [['gems', 'gem', 'gems'], ['uniques', 'unique', 'uniques'], ['passives', 'passive', 'passives']])
      if(it.use[k]) parts.push(it.use[k] + ' ' + (it.use[k] === 1 ? one : many));
    if(parts.length) f.push('Used by ' + parts.join(', '));
  }
  return f;
}
/* worker/seo.js itemWords: "### name", "sub · url", then the card's fixed lines */
export function itemWords(e){
  const it = e.it, out = ['### ' + it.n, (it.s || KINDS[e.k].one) + ' · ' + pageOf(e)];
  if(e.k === 'g') out.push(it.w ? 'Requires at gem level 20: ' + reqText(gemReq(it.w, 20)) : 'No requirements');
  if(e.k === 'u' && it.rq) out.push('Requires: ' + reqText(it.rq) + (it.cor ? ' · Corrupted' : ''));
  if(e.k === 'p' && it.asc) out.push(it.asc + ' ascendancy');
  else if(e.k === 'p' && it.reg) out.push(it.reg + ' region');
  if(e.k === 'c' && it.dl) out.push('Drops from area level ' + it.dl);
  if(e.k === 'b' && it.rq) out.push('Requires: ' + reqText(it.rq));
  const f = factsOf(it);
  if(f.length) out.push(f.join(' · '));
  if(it.ls) out.push(...it.ls);
  else if(it.t) out.push(it.t);
  if(it.o) out.push('Choose one: ' + it.o.join(' / '));
  if(it.kp) out.push('Permanent: ' + it.kp.join(' / '));
  if(it.tags) out.push('Tags: ' + it.tags.join(', '));
  return out.join('\n');
}
/* what the card is, in one line: its kind, then its own sub line where that does not already say it */
export function kindLine(e){
  const one = KINDS[e.k].one, s = e.it.s || '';
  if(!s) return one;
  return s.toLowerCase().includes(one.toLowerCase()) ? s : one + ' · ' + s;
}

/* ---------- money and time ---------- */
const fmt = v => { const [i, f] = String(v).split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : ''); };
/* a number as a price reads: whole from 100, 1 place from 10, 2 from 1, 3 figures below */
export const plain = v => v >= 100 ? fmt(Math.round(v)) : String(v >= 1 ? +v.toFixed(v >= 10 ? 1 : 2) : +v.toPrecision(3));
/* stored in divine; below one divine it reads better in exalted. unit forces one: "divine" or "exalted" */
export function money(div, rate, unit){
  if(div === null || div === undefined || !isFinite(div)) return null;
  const inDiv = () => plain(div);
  const inEx = () => { const e = div * rate; return e >= 100 ? fmt(Math.round(e)) : String(+e.toFixed(e >= 10 ? 0 : e >= 1 ? 1 : 3)); };
  if(unit === 'exalted' && rate) return inEx() + ' ex';
  if(unit === 'divine' || div >= 1 || !rate) return inDiv() + ' div';
  return inEx() + ' ex';
}
export function changeText(ch){
  if(ch === null || ch === undefined || !isFinite(ch)) return '';
  const r = Math.round(ch);
  return r > 0 ? 'up ' + r + '% in 7 days' : r < 0 ? 'down ' + -r + '% in 7 days' : 'flat over 7 days';
}
export const isoTime = s => { const t = Date.parse(s); return isFinite(t) ? new Date(t).toISOString().replace(/\.\d+Z$/, 'Z') : ''; };
export const when = iso => { const t = isoTime(iso || ''); return t ? t.slice(0, 16).replace('T', ' ') + ' UTC' : ''; };
export function ago(now, iso){
  const t = Date.parse(iso || '');
  if(!isFinite(t)) return '';
  const s = Math.max(0, (now - t) / 1000);
  if(s < 90) return 'just now';
  if(s < 3600) return Math.round(s / 60) + ' min ago';
  if(s < 48 * 3600) return Math.round(s / 3600) + ' h ago';
  return Math.round(s / 86400) + ' d ago';
}
/* "2026-09-29 06:38 UTC, 1 h ago" */
export const age = (now, iso) => { const w = when(iso); return w ? w + ', ' + ago(now, iso) : 'time not given'; };
/* where a price came from: the league, then the Currency Exchange or the trade site's listings */
export function priceSource(m, px){
  const lg = m.league ? m.league + ' league, ' : '';
  if(px.src === 'cx') return lg + 'the in-game Currency Exchange';
  return lg + 'live trade site listings' + (px.ls !== undefined ? ', ' + fmt(px.ls) + (px.as ? ' ' + px.as : '') + ' listed' : '');
}
export const checkedAt = (m, px) => px.at || m.updated || '';
