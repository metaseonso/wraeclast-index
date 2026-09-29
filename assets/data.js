/* The Data page (#/data): what the index holds, where it comes from, how fresh it is, and how to build on it.

   Everything here is read, not written down: the counts from the manifest (data/manifest.json), the pages from
   the index table (assets/kinds.js INDEX), the patch from the game-file pull (data/gamedata.json), and each
   data job's cycle and last run from the worker's own health answer (/api/health, worker/health.js). A job the
   site does not run is not on the page, and one that has stopped says so in the same words the owner's
   dashboard uses. The page is its own tab, so none of it is fetched until somebody opens it. */
import { esc, ago, manifest, prices } from './app.js';
import { contentsHTML } from './kinds.js';

let EL = null;
const num = n => (+n || 0).toLocaleString('en');
const every = h => h === 1 ? 'every hour' : h === 24 ? 'every day' : h % 24 === 0 ? 'every ' + (h / 24) + ' days' :
  'every ' + h + ' hours';
const DAY = iso => { const d = new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : '')); return isNaN(d) ? '' :
  d.getUTCDate() + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };

export async function mount(el){
  EL = el;
  const [man, game, health, now] = await Promise.all([
    manifest().catch(() => null),
    fetch('data/gamedata.json').then(r => r.ok ? r.json() : null).catch(() => null),
    fetch('api/health', {cache: 'no-store'}).then(r => r.ok ? r.json() : null).catch(() => null),
    prices().catch(() => null),
  ]);
  if(EL !== el) return;
  el.innerHTML = head(man, game) + held(man) + sources(game, now) + jobs(health) + use();
}
export function unmount(){ EL = null; }

function head(man, game){
  const total = man ? Object.values(man.kinds || {}).reduce((s, K) => s + (+K.n || 0), 0) : 0;
  const bits = [];
  if(game && game.patch) bits.push('Patch ' + esc(game.patch));
  if(total) bits.push(num(total) + ' cards');
  return '<div class="pagehd"><h2>Data</h2><p>What the index holds, where it comes from, and how fresh it is.</p>' +
    (bits.length ? '<p class="dt-sub">' + bits.join(' · ') + '</p>' : '') + '</div>';
}

/* the index, section by section, each page with its count: the same contents the home page shows */
function held(man){
  const counts = Object.fromEntries(Object.entries((man && man.kinds) || {}).map(([k, K]) => [k, K.n]));
  return '<section class="dt-block"><div class="sect"><h3>The index</h3></div>' + contentsHTML(counts).replace(' id="toc"', '') +
    '<p class="note"><a href="#/map">The whole index as a map</a></p></section>';
}

function sources(game, now){
  const lines = [];
  if(game && game.patch) lines.push('<li><b>Game data</b> — GGG\'s own game files, patch ' + esc(game.patch) +
    (game.dated ? ', files of ' + esc(DAY(game.dated)) : '') + (game.pulled ? ', read ' + esc(DAY(game.pulled)) : '') + '.</li>');
  lines.push('<li><b>Currency prices</b> — the in-game Currency Exchange, every hour.</li>');
  lines.push('<li><b>Item prices</b> — live listings on the official trade site, checked every day. Nothing listed: checked again every week.</li>');
  lines.push('<li><b>Anything else</b> — named on the card that shows it.</li>');
  const stamp = now && now.updated ? '<p class="note">Prices: ' + esc(now.league || '') + ' · ' + ago(now.updated) + '</p>' : '';
  return '<section class="dt-block"><div class="sect"><h3>Where it comes from</h3></div><ul class="dt-list">' +
    lines.join('') + '</ul>' + stamp + '</section>';
}

/* every data job the site runs, its cycle and its last run (worker/health.js) */
function jobs(h){
  if(!h) return '';
  const all = [];
  for(const group of ['data', 'prices']) for(const j of Object.values(h[group] || {})) if(j && j.what) all.push(j);
  if(!all.length) return '';
  const rows = all.map(j => '<tr><td>' + esc(j.what) + '</td><td>' + (j.everyHours ? every(+j.everyHours) : '') + '</td><td>' +
    (j.at ? ago(j.at) : '') + '</td><td>' + (j.state === 'ok' ? 'On time' : '<span class="err">' + esc(j.note || 'Late') + '</span>') +
    '</td></tr>').join('');
  return '<section class="dt-block"><div class="sect"><h3>How fresh</h3><p>' + esc(h.note || '') + '</p></div>' +
    '<div class="dt-scroll"><table class="dt-jobs"><thead><tr><th>What</th><th>Checked</th><th>Last run</th><th></th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div></section>';
}

function use(){
  return '<section class="dt-block"><div class="sect"><h3>Build on it</h3></div><ul class="dt-list">' +
    '<li>Free to use under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>. ' +
    'Name Wraeclast Index and link the page. Game text is © Grinding Gear Games.</li>' +
    '<li>Every card as a page and as plain text: <a href="item/divine-orb">/item/divine-orb</a> and ' +
    '<a href="md/item/divine-orb.md">/md/item/divine-orb.md</a>.</li>' +
    '<li>The index for tools and AI: <a href="llms.txt">llms.txt</a>, <a href="llms-full.txt">llms-full.txt</a>, ' +
    '<a href="data/manifest.json">the manifest</a>, <a href="sitemap.xml">the sitemap</a>.</li>' +
    '</ul></section>';
}
