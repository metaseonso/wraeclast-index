/* Wraeclast Index: the app's door. What was one 215 KiB module is the files under assets/core/ (the shell: the
   store, the data, the router, the boot), assets/frame/ (the card, its field types, the popup, Connections) and
   assets/pages/home.js (docs/framework.md, stage 9 of docs/migration.md). This file boots the site and re-exports
   every name assets/app.js ever exported, from where each lives now, so the pages, the panels and the drill-down
   page keep importing './app.js' until stage 10 rewrites every import; then it shrinks to the boot line. */
import './core/boot.js';
export { $, esc, onType } from './core/html.js';
export { MODE, leadFirst, noPrice } from './core/store.js';
export { D, manifest, prices, wake, need, leagues, hist, first, searching, ready, have, whole, named, priceOf, usageOf, find } from './core/data.js';
export { money, isUnit, moneyHTML, change, spark, ago, iconHTML } from './core/format.js';
export { craftHref, hrefOf, TYPE } from './frame/types/index.js';
export { GEM_LEVELS, gemReq } from './frame/types/reqs.js';
export { MARKS, markHTML, buildsHref } from './frame/types/damage.js';
export { table, mkRow, divText, pct, utcHour, mkTip, mkSource, leagueColours, dayLines } from './frame/types/market.js';
export { patchName, patchesOf, foldHTML, diffRowsHTML, diffLinesHTML } from './frame/types/patches.js';
export { slotsOf, card } from './frame/card.js';
export { detailExtras, actPanel, openBox, openDetail, isPinned, pinnedKeys, onPinChange, togglePin, actHTML, runAct, repaint } from './frame/popup.js';
export { keywordCard, keywordIdOf, flow } from './frame/related.js';
export { BEEN, words } from './core/seen.js';
export { mountTopSearch, fillCounts } from './ui/topsearch.js';
export { params } from './core/router.js';
export { later, registerSW } from './core/boot.js';
export { hits } from './rank.js';   // the search's own hit test, lent to the Currency tab and the Map through this door as before
