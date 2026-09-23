/* The voice, enforced.

   Every word a player reads is the game's, not an assistant's. The owner, 23 September 2026, on copy that
   explained the interface to the reader: "we need it to keep with ggg language. thats as important as any
   technical parameter. users need to be able to maintain the same headspace when reading and your language
   throws them off."

   So this reads the site's own copy and fails a build that talks like a helper. What it looks for is not bad
   writing in general — it is the handful of shapes that give an assistant away:
     * narrating the interface to the reader   "this is where it says…", "here you can…", "and this says…"
     * speaking as the site's author          "we'll", "I'll", "let's"
     * coaching                               "simply", "just click", "feel free", "don't worry", "make sure to"
     * selling the feature                    "helps you", "allows you to", "makes it easy", "handy"
     * essay glue                             "keep in mind", "note that", "in other words", "as you can see"
   An empty panel says "No modifier selected." A player does not need to be told what the panel is for.

   Comments are stripped first: the code explains itself to whoever reads it next, in whatever words suit, and
   that is not what a player sees. What is left is the strings, the markup and the page text.

   Run on its own:  node tools/dev/voice.mjs        ...or as the guard's "voice" check. */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

/* Every file whose words reach a player. The worker's crawler pages are in it too: a search engine reads
   them, and so does anyone who lands on one. */
export const FILES = [
  'index.html', 'explore.html', 'privacy.html',
  'assets/app.js', 'assets/craft.js', 'assets/craftsim.js', 'assets/engine.js', 'assets/trade.js',
  'assets/tradepage.js', 'assets/build.js', 'assets/currency.js', 'assets/farms.js', 'assets/atlas.js',
  'assets/bosses.js', 'assets/map.js', 'assets/basepool.js', 'assets/bridge.js', 'assets/edges.js',
  'assets/kinds.js', 'assets/keys.js', 'assets/league.js', 'assets/marks.js', 'assets/notes.js',
  'assets/suggest.js', 'assets/support.js', 'assets/track.js',
  'worker/seo.js', 'tools/mechanics.py',
];

/* The shapes, each with the plain reason it is wrong, because a fail that only says "no" teaches nobody. */
export const SHAPES = [
  [/\bthis is where\b/i,        'narrates the interface'],
  [/\bhere you can\b/i,         'narrates the interface'],
  [/\band this says\b/i,        'narrates the interface'],
  [/\bis where it says\b/i,     'narrates the interface'],
  [/\byou'?ll see\b/i,          'narrates the interface'],
  [/\bwe['’]ll\b/i,             'speaks as the author'],   // the apostrophe is required: "well" is an ordinary word
  [/\bI['’]ll\b/,               'speaks as the author'],   // required here too: "Ill" is an ordinary word
  [/let[’']s/i,            'speaks as the author'],   // the contraction only: "lets" is an ordinary verb
  [/\bsimply\b/i,               'coaches the reader'],
  [/\bjust (click|pick|tap|choose|select)\b/i, 'coaches the reader'],
  [/\bfeel free\b/i,            'coaches the reader'],
  [/\bdon'?t worry\b/i,         'coaches the reader'],
  [/\b(make|be) sure to\b/i,    'coaches the reader'],
  [/\bhelps? you\b/i,           'sells the feature'],
  [/\ballows? you to\b/i,       'sells the feature'],
  [/\bmakes it easy\b/i,        'sells the feature'],
  [/lets you/i,             'sells the feature'],
  [/\bhandy\b/i,                'sells the feature'],
  [/\bkeep in mind\b/i,         'essay glue'],
  [/\bnote that\b/i,            'essay glue'],
  [/\bin other words\b/i,       'essay glue'],
  [/\bas you can see\b/i,       'essay glue'],
  /* A label is a word, not a sentence. "Suffix · A desecration adds it · 3 kinds of item" reads as someone
     explaining the row; "Suffix · Desecration · 3 kinds of item" is the row. */
  [/\b(a|an) [\w-]+ (adds|guarantees|gives|puts|makes|carries) it\b/i, 'a sentence where a label belongs'],
  /* An empty search or filter is a fact, not a support ticket. "Nothing matches. Try fewer words." coaches the
     reader on how to use the search box they are already looking at; "Nothing matches." is the fact. */
  [/\btry fewer\b/i,            'coaches the reader on their own search'],
  [/\bloosen a filter\b/i,      'coaches the reader on their own search'],
  /* Pointing at the page instead of stating the fact on it. "Pick one of the bases above" and "tap one" name
     a direction and a gesture, as if the reader could not see the button they are being told to press. */
  [/\btap one\b/i,              'points at the page instead of the fact'],
  [/\b(pick|choose|select|add|tap|search)\b[^.!?<]{0,40}\b(above|below)\b/i, 'points at the page instead of the fact'],
  /* "Select an item class." commands the reader; "No item class selected." says what is true. Every other
     empty state on the site already says what is true — these two were the odd ones out. */
  [/(?:^|[>'`])(select|choose|pick) (?:a|an|the) [a-z][a-z ]*\.(?=['`<])/i, 'a command where a state belongs'],
];

/* What a player never reads: the comments. Block comments go whole; a line comment goes from // to the end of
   its line, except where the // is inside an address. Nothing else is touched, so a line number still counts. */
export function strip(src){
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:"'`\w])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
}

export async function checkVoice(){
  const bad = [];
  let read = 0, lines = 0;
  for(const f of FILES){
    let src = null;
    try { src = await readFile(join(ROOT, f), 'utf8'); } catch { continue; }
    read++;
    const rows = strip(src).split('\n');
    lines += rows.length;
    rows.forEach((row, i) => {
      for(const [re, why] of SHAPES){
        const m = row.match(re);
        if(!m) continue;
        const said = row.trim().replace(/\s+/g, ' ');
        bad.push(f + ':' + (i + 1) + ' ' + why + ' — “' + m[0] + '” in: ' +
          (said.length > 90 ? said.slice(0, 89) + '…' : said));
        break;
      }
    });
  }
  return {bad, said: read + ' files, ' + lines.toLocaleString() + ' lines of copy, ' + SHAPES.length + ' shapes'};
}

if(import.meta.url === 'file:///' + process.argv[1].replace(/\\/g, '/').replace(/^\//, '')){
  const r = await checkVoice();
  for(const b of r.bad) console.log('FAIL ' + b);
  console.log(r.bad.length ? r.bad.length + ' broken' : 'ok   voice   ' + r.said + ' · the game does the talking');
  process.exit(r.bad.length ? 1 : 0);
}
