import { D } from '../core/data.js';
import { esc } from '../core/html.js';
import { KIND, INDEX, pageKind } from '../kinds.js';

/* ---------- formatting ---------- */
// prices are stored in divine; below one divine they read better in exalted
export function money(div){
  if(div === null || div === undefined || !isFinite(div)) return null;
  const ex = D.market && D.market.rates && D.market.rates.exalted;
  if(div >= 1 || !ex) return {v: div >= 100 ? Math.round(div).toLocaleString() : trim(div, div >= 10 ? 1 : 2), u: 'div'};
  const e = div * ex;
  return {v: e >= 100 ? Math.round(e).toLocaleString() : trim(e, e >= 10 ? 0 : 1), u: 'ex'};
}
function trim(v, dp){ return (+v.toFixed(dp)).toString(); }
/* The Divine Orb is what every price is counted in, so its own price is always 1 and its line always flat: its
   card says what one is worth in exalted instead, off the same rate the prices are converted with */
export const isUnit = it => it.k === 'c' && it.id === 'Divine Orb';
function unitHTML(){
  const ex = D.market && D.market.rates && D.market.rates.exalted;
  return ex ? '<b>' + (ex >= 100 ? Math.round(ex).toLocaleString() : trim(ex, 1)) + '<small>ex</small></b>' : '';
}
export function moneyHTML(div){
  const m = money(div);
  return m ? m.v + '<small>' + m.u + '</small>' : '';
}
export function change(ch){
  if(ch === null || ch === undefined || !isFinite(ch)) return '';
  const r = Math.round(ch);
  const cls = r > 0 ? 'up' : r < 0 ? 'down' : 'flat';
  const arrow = r > 0 ? '▲' : r < 0 ? '▼' : '•';
  return '<span class="chg ' + cls + '" title="Change over the last 7 days">' + arrow + ' ' + Math.abs(r) + '%</span>';
}
export function spark(pts, ch){
  const p = (pts || []).filter(x => x !== null && isFinite(x));
  if(p.length < 2) return '';
  const lo = Math.min(...p), hi = Math.max(...p), span = hi - lo || 1, w = 84, h = 22;
  const xy = p.map((v, i) => [(i / (p.length - 1)) * (w - 2) + 1, h - 2 - ((v - lo) / span) * (h - 4)]);
  const d = xy.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('');
  const col = ch > 0.5 ? 'var(--pos)' : ch < -0.5 ? 'var(--neg)' : 'var(--faint)';
  return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><path d="' + d +
    '" fill="none" stroke="' + col + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>';
}
export function ago(iso){
  if(!iso) return '';
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if(m < 1) return 'just now';
  if(m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  return h < 48 ? h + ' h ago' : Math.round(h / 24) + ' days ago';
}
// a price's age, on its own line under the price: never in the same sentence as anything else
const pxAge = iso => iso && Date.parse(iso) ? '<span class="card-pxage">' + esc(ago(iso)) + '</span>' : '';

/* ---------- icons ---------- */
export function iconHTML(it){
  if(it.img) return '<img src="' + esc(it.img) + '" alt="" loading="lazy" decoding="async">';
  const S = D.index && D.index.sprites;
  const sp = S && S[(KIND[it.k] || {}).sprite];   // the sheet this kind's art is cut from (KINDS sprite)
  // its cell: the card's own, or for a card the page makes itself (a boss) its name on the sheet
  const cell = sp && (it.ic || (sp.at && sp.at[it.n]));
  if(cell){
    const sc = Math.min(34 / sp.cw, 38 / sp.ch), w = sp.cw * sc, h = sp.ch * sc;
    // a screen of one pixel per point takes the sheet cut to this size (tools/sprites.py); the grid is the same
    const url = 'url(sprites/' + sp.file + ')', lo = sp.lo ? ';background-image:image-set(url(sprites/' + sp.lo + ') 1x,' + url + ' 2x)' : '';
    return '<span class="ic" style="width:' + w + 'px;height:' + h + 'px;background-image:' + url + lo +
      ';background-size:' + (sp.w * sc) + 'px ' + (sp.h * sc) + 'px;background-position:' + (-cell[0] * w) + 'px ' + (-cell[1] * h) + 'px"></span>';
  }
  // no art of its own: its kind's mark from the index (assets/kinds.js INDEX), never a letter
  const ic = KIND_ICON[it.k];
  return ic ? '<span class="glyph"><i class="ti ti-' + ic + '" aria-hidden="true"></i></span>'
    : '<span class="glyph">' + esc((it.n || '?').replace(/^[^A-Za-z]+/, '').charAt(0)) + '</span>';
}
/* each kind's mark: the icon of the index page that lists it */
const KIND_ICON = Object.fromEntries(INDEX.flatMap(s => s.pages).filter(p => pageKind(p)).map(p => [pageKind(p), p.icon]));

export { trim, unitHTML, pxAge };
