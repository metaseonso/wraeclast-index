/* Every kind of thing the site cards, in one table.
   Nothing here draws anything: it says what a kind is called, which fields its cards carry, which actions they
   offer and which related lists they can build. assets/app.js turns that into a card (one renderer, one
   function per field type) and tools/dev/guard.mjs reads the same table instead of reading names back out of
   the code. A new kind — a new league's items, a new list — is one entry in KINDS plus its rows in the index,
   and no card code.

   There is one card and one map, so a rule written here reaches every card at once. A rule that would reach
   only some of them is the wrong shape: it belongs in a declaration below, never in the drawing code.
   docs/frame.md states the whole frame, and tools/dev/frame.mjs fails a build that breaks it.

   KINDS, per kind:
     k        the letter the index marks it with
     one/many what one of it and a list of it are called
     tone     the palette token it is drawn in where kinds are told apart by colour (assets/theme.css; the
              map of the whole index, tools/map.py). A kind with none gets a colour of its own worked out
              from its letter, so a new kind lands with a colour, a key entry and a count and no one edits it
     place    the tab the gold button opens, if it has one      sec    its section on the drill-down page
     search   a chip over the home page's search                item   an item: it can be traded
     index    its rows live in data/index.json                    crawl  the crawler publishes a page for it
     own      a module that draws its card instead of us
     fields   the fields its card draws, in order (FIELDS)
     acts     the buttons under it (ACTS)
     rel      the groups under Connections it can build (REL), each one worked out from the index itself
     link     where its gold button goes: a template with @field in it, or a form app.js names (LINKS)
     gone     a test: an entry that answers it has nowhere to go yet, so it gets no link
     notitem  a test: an entry that answers it is not an item, whatever the kind says
     sprite   the sheet its art is cut from, where its art is in one
     px       where else its price may be listed: {as} the kind it is listed under, {at} only when it carries it
     few      how thin a market is ignored on the home page's price moves: {at} the count, {under} the floor
     rank     what the search adds to or takes off this kind, where it should not rank beside the rest
     builds   which of poe.ninja's build lists this kind is in: the first test that answers wins
     mark     the field whose lines already carry the index's own marks (tools/nodelinks.py)
     make     fields worked out from the entry itself as the index is read: the field -> one answer in MAKE
     kw       where its keyword id is: 'id' its own id, 'name' the keyword card of the same name
     words    which of its own words open it inside another card's line (assets/marks.js): `n` its name and
              `f` its other spellings, each 'own' (a door wherever it is read) or 'alt' (only on a card whose
              own keyword list names it); `mark` whose words they are, 'ours' (a card we wrote, so the mark is
              the word with a footnote) or 'game' (the game's own word, so the mark is the word underlined);
              `only: 'gate'` where each of its own words carries its own rule for when it counts ("fg" on
              the entry, tools/mechanics.py), instead of being a door wherever it is read
   DECL below is the whole of that list, and nothing else may sit on a kind: a rule that would reach one kind
   goes into the frame instead (tools/dev/frame.mjs fails the build over either).

   FIELDS, per field:
     type     which function draws it (TYPE in app.js)
     at       the field on the index entry it reads, where it reads one (a type drawn from the price reads the
              price row's field instead: `thin` reads how many are listed)
     slot     where it lands on the card: head, pill, fact, body or foot
     box      which box of the head it fills, for a head field: art, name, sub or price
     every    the field is on every card. The shared slots are shared whole, and a kind that drops one fails.
     label    the words beside the value
     lines    how many lines it draws in the grid, where it is itself a list (FRAME.lines otherwise)
     file     a table of its own, fetched the first time a card asks for it and kept for the visit. Nothing of
              it is in the index or in first paint, and a card whose name the table does not hold draws nothing.
              It may carry @field, filled in from the entry the way a gold button's link is, so one field can
              read a table per item class without naming one.
   A field draws nothing when the entry carries nothing for it, so one declaration covers a full entry and a
   bare one. Fields a player must never read (the search words, internal ids) are in no declaration.

   REL, per group under Connections: what it is called, which kind its rows are, which edge builds it, and the
   filter its "see all" link carries to the drill-down (assets/bridge.js reads those names). An edge that
   groups cards by a field of their own names the map it reads in MAPS. */

/* The app's own tabs and the drill-down's sections, each with the words it is called by, in the order they
   are offered. Everything that names a page reads these and keeps no list of its own: the router
   (assets/app.js), the deep links (assets/bridge.js), the count of what was looked at (assets/track.js,
   worker/dash.js) and the owner's dashboard (assets/admin.js). A new tab is one line here.
   tools/dev/frame.mjs fails a build where a second copy of this list has drifted from it. */
export const ROUTES = {home: 'Search', build: 'Build', trade: 'Trade', farms: 'Farms', craft: 'Craft',
  currency: 'Currency', atlas: 'Atlas', bosses: 'Bosses', map: 'Map'};
export const SECTIONS = {gems: 'Gems', uniques: 'Uniques', tree: 'Passive tree'};
/* every page that is counted, in one list: the tabs, then the sections under the names the count gives them */
export const PAGES = {...ROUTES,
  ...Object.fromEntries(Object.entries(SECTIONS).map(([k, words]) => ['explore-' + k, words]))};

/* ---------- the frame ----------
   The slots a card has, in the order they are drawn, and the boxes the head is divided into. A field lands in
   a slot; the slot's own rule says how many of them are drawn and what happens to the rest. Nothing below is
   per kind, and no number that keeps a card or the map in shape is anywhere else. */
export const SLOTS = ['head', 'pill', 'fact', 'body', 'foot'];
export const BOXES = ['art', 'name', 'sub', 'price'];
export const FRAME = {
  /* How many pieces a slot draws in the grid. A piece is one field that drew something — a pill, a fact, a
     block, a mark — whatever markup that one field came to. The popup draws all of them, so the count in the
     grid is the way to the rest: open the card. Chosen against what the index really holds, with room over
     it: the widest card today fills 4 of the pills, 3 of the facts, 3 of the body and 1 of the foot
     (docs/frame.md, and tools/dev/frame.mjs measures it again every run). */
  cap: {pill: 6, fact: 8, body: 6, foot: 4},
  lines: 4,                        // lines one field draws in the grid where the field is itself a list
  slack: 1,                        // ...and what is not worth counting: "+1 more" is worse than the thing itself
  more: n => '+' + n + ' more',    // how a slot says what it did not draw. Always a count, never an "etc."
  /* Connections, in the popup: rows per group before the rest is a button, and how much slack is not worth a
     button (seven rows and a "See all 9" is worse than nine rows). A section wider than `filter` gets its
     filter box from the start. */
  rel: {cap: 8, slack: 2, filter: 30},
  /* The map: the whole index as one picture (tools/map.py draws it, assets/map.js frames it, docs/frame.md
     "The map" states it). It is laid out once with the data, so the page obeys no number per frame and the
     picture's own constants sit with the drawing, the way a card's markup sits in app.js. What the frame
     owns is the rule every kind is drawn by, and tools/dev/frame.mjs holds the picture to it:
       region     one per kind, named and coloured off this table (`many`, `tone`), never a list in the tool
       node       one dot per card, every one of them
       edge       a line per edge the site can already follow, and no other
       density    nothing is thinned: what is left out is a whole group's edges, counted and named on the page
       key        every kind, with its colour and its count, or named among what the picture left out
       growth     a new kind lands in the picture, the key and the count with nobody editing the tool */
  map: {key: 'data/map.json'},   // what the page reads, and what the frame check holds to the rules above
};
/* A small test on one entry, where a declaration needs one: the field it reads and what it wants of it.
   Nothing said about the field means "it carries something"; no field at all means "always". */
export const holds = (it, c) => {
  if(!c) return false;
  if(c.at === undefined) return true;
  const v = it[c.at];
  if(c.is !== undefined) return v === c.is;
  if(c.starts !== undefined) return typeof v === 'string' && v.startsWith(c.starts);
  return v !== undefined && v !== null && v !== '' && v !== false;
};
/* The answers a kind's "make" can ask for: one small thing worked out from the entry itself, once, as the
   index is read. Nothing here knows which kind asked, so a kind that needs one declares it and no code moves. */
export const MAKE = {
  // the card is its own: a base item is its own base item
  name:  it => it.n,
  // ...and an item class is its own item class, which is the id it is carded under
  id:    it => it.id,
  // the first part of the sub line: the base item a unique sits on, as its own entry says it
  sub1:  it => (it.s || '').split('·')[0].trim() || undefined,
  // how many lines it carries: every line of a base item is an implicit
  lines: it => Array.isArray(it.ls) ? it.ls.length : undefined,
  yes:   () => true,
};
/* The maps the index is turned into once per load, so a card's Connections are a lookup and never a search
   (assets/edges.js builds them; REL names the one an edge reads). Each says which field of a card puts it in
   a group, and `per: 'kind'` keeps the group inside its own kind. `of` is the kind the group is named after,
   so a group with no card behind its name is no group at all. A card is never put in its own group. */
export const MAPS = {
  base:  {at: 'base', of: 'b'},   // every card that sits on a base item, under that base item's name
  klass: {at: 'cr', of: 'i'},     // every card of one item class, under that class's own card
  place: {at: 'at'},              // every card listed in one section of the Atlas
  cat:   {at: 's', per: 'kind'},  // every card that carries the same sub line, inside its own kind
};
/* Every declaration a kind may carry. A key that is not here is a rule that reaches one kind, which is the
   shape the frame does not have: it belongs in FIELDS, FRAME, MAPS or REL. */
export const DECL = ['k', 'one', 'many', 'tone', 'place', 'sec', 'search', 'item', 'index', 'crawl', 'own',
  'fields', 'acts', 'rel', 'link', 'gone', 'notitem', 'sprite', 'px', 'few', 'rank', 'builds', 'mark', 'make',
  'kw', 'words'];

export const FIELDS = {
  art:      {type: 'art', slot: 'head', box: 'art', every: 1},
  name:     {type: 'name', slot: 'head', box: 'name', every: 1},
  sub:      {type: 'text', at: 's', slot: 'head', box: 'sub', every: 1},
  price:    {type: 'money', slot: 'head', box: 'price', every: 1},

  gemreq:   {type: 'gemreq', at: 'w', slot: 'pill'},         // gem level -> character level and attributes
  reqs:     {type: 'reqs', at: 'rq', slot: 'pill'},
  lineage:  {type: 'flag', at: 'li', slot: 'pill', is: 'Lineage', tone: 'lin'},
  corrupt:  {type: 'flag', at: 'cor', slot: 'pill', is: 'Corrupted', tone: 'warn'},
  limit:    {type: 'number', at: 'lim', slot: 'pill', pre: 'Limited to '},
  group:    {type: 'text', at: 'q', slot: 'pill'},
  nodety:   {type: 'enum', at: 'ty', slot: 'pill', of: {c: 'Choice', n: 'Notable', s: 'Small'}},
  ontree:   {type: 'number', at: 'x', slot: 'pill', post: ' on the tree', from: 2},
  warn:     {type: 'text', at: 'nt', slot: 'pill', tone: 'warn'},
  asc:      {type: 'text', at: 'asc', slot: 'pill', post: ' ascendancy'},
  region:   {type: 'text', at: 'reg', slot: 'pill', post: ' region'},
  droplv:   {type: 'number', at: 'dl', slot: 'pill', pre: 'Drops from area level '},

  usetime:  {type: 'duration', at: 'ct', slot: 'fact', post: ' use time'},
  cost:     {type: 'cost', at: 'cost', slot: 'fact'},
  spirit:   {type: 'number', at: 'sp', slot: 'fact', post: ' Spirit'},
  props:    {type: 'lines', at: 'pr', slot: 'fact'},
  implicit: {type: 'number', at: 'ni', slot: 'fact', post: ' implicit', many: ' implicits'},
  uses:     {type: 'uses', at: 'use', slot: 'fact'},
  weights:  {type: 'weights', at: 'cw', slot: 'fact'},       // how often a mod rolls here (tools/carddata.py)

  lines:    {type: 'rich', at: 'ls', slot: 'body', every: 1},   // the effect lines: mods, stats, what it adds
  text:     {type: 'rich', at: 't', slot: 'body', every: 1},    // what it does, in the game's own words
  /* the modifier it puts on an item, per kind of item: an essence adds a different one to a bow than to a body
     armour, and the game's one line says none of it. Anything else that adds a known modifier reads the same
     table, keyed by whatever "at" names (tools/essences.py). */
  adds:     {type: 'adds', at: 'n', slot: 'body', file: 'data/essences.json', label: 'What it adds'},
  /* what an item can already have, off its own item class's table: the modifiers its pool rolls, and the
     ones a corruption can add instead. `of` picks which list of the pool it reads. The table is a file per
     item class, so the field's own "file" carries the class the entry names (tools/craft.py). */
  canroll:  {type: 'pool', at: 'n', slot: 'body', file: 'data/craft/@cr.json', of: 'm', label: 'Modifiers it can roll'},
  cancorrupt: {type: 'pool', at: 'n', slot: 'body', file: 'data/craft/@cr.json', of: 'c', label: 'A corruption can add'},
  quote:    {type: 'quote', at: 'qt', slot: 'body', every: 1},   // the game's own flavour line
  options:  {type: 'options', at: 'o', slot: 'body', every: 1},
  flow:     {type: 'flow', at: 'fl', slot: 'body', every: 1},
  source:   {type: 'source', at: 'src', slot: 'body', every: 1},
  /* The way to a card that lays out what this one's own text is about: drawn where the card's words say so,
     and never on a card of a kind one of them leads to — those cards already say it. Each `card` is one of
     our own mechanics cards (tools/mechanics.py declares it) and `when` is what the card's own words have to
     read for it to be offered, so a third of them is a third line here and no code. A card about two of them
     is offered both, in this order. */
  offer:    {type: 'offer', slot: 'body', every: 1, cards: [
    {card: 'h:HowDamage', when: /\bdamage\b/,
     is: 'How damage works', sub: 'the order it is worked out in'},
    {card: 'h:HowDefences', when: /\b(?:armour|evasion|block|energy shield|resistance)/,
     is: 'How defences work', sub: 'the order a hit you take runs through'},
  ]},
  /* A switch on the card for something outside the item that changes what the item is while it is worn —
     the Monk notable that turns a pair of gloves into something else. It sits where the player is reading
     the item, not in a panel of its own, and it is off until it is pressed. Each one is `on` (which entries
     carry it), the word on the switch, and the `card` it comes from: what it does is that card's own lines,
     so nothing of the game's wording is written down twice. A card the index does not carry draws nothing. */
  swaps:    {type: 'swap', slot: 'body', every: 1, of: [
    {on: {at: 'cr', is: 'gloves'}, label: 'Stonefist', card: 'p:AscendancyMonk1Notable8'},
  ]},
  tags:     {type: 'tags', at: 'tags', slot: 'body', every: 1},
  anoint:   {type: 'anoint', at: 'rec', slot: 'body', every: 1},
  keywords: {type: 'chips', at: 'kw', slot: 'body', every: 1},   // the popup only: a way in, not a line of text

  spark:    {type: 'spark', slot: 'foot', every: 1},
  usage:    {type: 'usage', slot: 'foot', every: 1},
  // how thin the market behind the price is, off the price row: fewer than `under` listed says so
  thin:     {type: 'thin', at: 'ls', slot: 'foot', every: 1, under: 3, is: 'few listed', note: 'Only a few listed'},
  builds:   {type: 'builds', slot: 'foot', every: 1},
  /* Room for the price's own history: today the popup draws it under the card from the market row
     (detailExtras in assets/app.js), and a chart of it is a field like any other here — a name, a type, a
     slot, and the kinds that declare it. Nothing about prices is worked out in this file. */
};

/* The buttons under a card in the popup. "open" is the gold one: the kind's own tab. */
export const ACTS = {
  trade: {label: 'Trade'},
  full:  {label: 'Full stats'},
  craft: {label: 'Open in Craft'},
  open:  {label: 'Open in '},
};

/* The groups under Connections, one per category the card shows. `of` is the kind its rows are, `edge` how
   they are found (assets/edges.js), `g` which group of a keyword's own list it is, `filter` the drill-down
   filter the "see all" carries.

   `rows: 'cards'` says the group's rows are plain card ids of its own kind, which needs no code of its own.

   A label names the relationship as it reads from the card you are on, so the same edge says the right thing
   from either end: a unique "Sits on" its base, a base is "Used by uniques"; an item "Grants" a skill, a gem
   is "Granted by" items. An edge that runs both ways alike ("Listed with") keeps the one label. */
export const REL = {
  kwu:      {label: 'Used by uniques', of: 'u', edge: 'kwuse', g: 'u', rows: 'cards', filter: 'kw'},
  kwg:      {label: 'Used by gems', of: 'g', edge: 'kwuse', g: 'g', rows: 'cards', filter: 'kw'},
  kwp:      {label: 'Used by passives', of: 'p', edge: 'kwuse', g: 'p', filter: 'kw'},
  kwb:      {label: 'Used by bases', of: 'b', edge: 'kwuse', g: 'b', rows: 'cards'},
  kwe:      {label: 'Used by essences', of: 'c', edge: 'kwuse', g: 'e'},
  kwa:      {label: 'Used on the Atlas', of: 'a', edge: 'kwuse', g: 'a'},
  kwm:      {label: 'Used by crafting mods', edge: 'kwuse', g: 'm'},
  kwc:      {label: 'Used by currency', of: 'c', edge: 'kwuse', g: 'c', filter: 'currency'},
  kww:      {label: 'Used by keywords', of: 'w', edge: 'kwuse', g: 'w'},

  base:     {label: 'Sits on', of: 'b', edge: 'base', map: 'base'},
  variants: {label: 'Shares its base with', of: 'u', edge: 'variants', map: 'base', filter: 'base'},
  uniques:  {label: 'Used by uniques', of: 'u', edge: 'uniques', map: 'base', filter: 'base'},
  klass:    {label: 'Shares its class with', of: 'b', edge: 'klass', map: 'klass', filter: 'craft'},
  klassof:  {label: 'Item class', of: 'i', edge: 'klassof', map: 'klass'},
  inclass:  {label: 'Bases of this class', of: 'b', edge: 'inclass', map: 'klass', filter: 'craft'},
  grants:   {label: 'Grants', of: 'g', edge: 'grants', needs: 'grants'},
  granted:  {label: 'Granted by', edge: 'granted', needs: 'grants'},
  section:  {label: 'Listed with', of: 'a', edge: 'section', map: 'place', filter: 'atlas'},
  cat:      {label: 'Listed with', edge: 'cat', map: 'cat'},
  named:    {label: 'Names', edge: 'named'},
  namedby:  {label: 'Named by', edge: 'namedby'},
};

const HEAD = ['art', 'name', 'sub', 'price'];
// the words first, then the rest of the body: a kind with more to say puts it between the two (the currency)
const SAYS = ['lines', 'text'];
const REST = ['quote', 'options', 'flow', 'source', 'offer', 'swaps', 'tags', 'anoint', 'keywords'];
const BODY = [...SAYS, ...REST];
const FOOT = ['spark', 'usage', 'thin', 'builds'];
const KWUSE = ['kwu', 'kwg', 'kwp', 'kwb', 'kwe', 'kwa', 'kwm', 'kwc', 'kww'];

export const KINDS = [
  {k: 'g', one: 'Gem', tone: 'c-gem', many: 'Gems', place: 'Gems', sec: 'gems', link: 'explore#gems=@n', mark: 't',
   index: true, search: true, item: true, crawl: true,
   sprite: 'gems', px: {as: 'c', at: 'li'},
   builds: [{at: 'w', key: 'skills'}, {key: 'allskills'}],
   fields: [...HEAD, 'gemreq', 'lineage', 'usetime', 'cost', 'spirit', ...BODY, ...FOOT],
   acts: ['trade', 'full', 'open'],
   rel: ['granted', 'named', 'namedby', 'cat']},

  {k: 'u', one: 'Unique', tone: 'c-unique', many: 'Uniques', place: 'Uniques', sec: 'uniques', link: 'explore#uniques=@n', mark: 'ls',
   index: true, search: true, item: true, crawl: true,
   sprite: 'uniques', make: {base: 'sub1'}, few: {at: 'ls', under: 10},
   builds: [{key: 'items'}],
   fields: [...HEAD, 'reqs', 'corrupt', 'limit', 'group', 'props', 'implicit', ...BODY, ...FOOT],
   acts: ['trade', 'full', 'open'],
   rel: ['base', 'variants', 'grants', 'named', 'namedby', 'cat']},

  {k: 'p', one: 'Passive', tone: 'c-keystone', many: 'Passives', place: 'Passive tree', sec: 'tree', link: 'explore#tree=@n', mark: 'ls',
   index: true, search: true, crawl: true,
   kw: 'name',
   builds: [{at: 's', starts: 'Keystone', key: 'keypassives'}, {at: 'asc', key: 'keypassives'}, {at: 'rec', key: 'anointed'}],
   fields: [...HEAD, 'asc', 'region', 'ontree', ...BODY, ...FOOT],
   acts: ['full', 'open'],
   rel: [...KWUSE, 'grants', 'named', 'namedby', 'cat']},

  {k: 'b', one: 'Base', tone: 'muted', many: 'Bases', place: 'Craft', link: 'craft', mark: 'ls',
   index: true, search: true, item: true, crawl: true,
   make: {base: 'name', ni: 'lines'},
   fields: [...HEAD, 'reqs', 'props', 'implicit', 'weights', ...SAYS, 'canroll', 'cancorrupt', ...REST, ...FOOT],
   acts: ['trade', 'craft'],
   rel: ['uniques', 'grants', 'klassof', 'klass', 'named', 'namedby']},

  {k: 'i', one: 'Item class', tone: 'bronze', many: 'Item classes', place: 'Craft', link: 'craft',
   index: true, search: true,
   make: {cr: 'id'},
   fields: [...HEAD, 'props', ...BODY, ...FOOT],
   acts: ['craft'],
   rel: ['inclass', 'cat']},

  {k: 'a', one: 'Atlas', tone: 'int', many: 'Atlas', place: 'Atlas', link: './#/atlas?s=@at&q=@n',
   index: true, search: true, item: true, crawl: true,
   px: {as: 'c'}, notitem: {at: 'at', is: 'tree'},
   fields: [...HEAD, 'nodety', 'ontree', 'warn', 'implicit', ...BODY, ...FOOT],
   acts: ['trade', 'open'],
   rel: ['section', 'named', 'namedby']},

  {k: 'c', one: 'Currency', tone: 'c-currency', many: 'Currency', place: 'Currency', link: './#/currency?c=@id',
   index: true, search: true, item: true, crawl: true,
   px: {as: 'c'}, make: {nx: 'yes'}, gone: {at: 'nx'}, few: {at: 'vol', under: 1},
   fields: [...HEAD, 'droplv', ...SAYS, 'adds', ...REST, ...FOOT],
   acts: ['trade', 'open'],
   rel: ['named', 'namedby', 'cat']},

  {k: 'w', one: 'Keyword', tone: 'accent', many: 'Keywords', sec: 'keywords', index: true, search: true, crawl: true,
   kw: 'id', rank: -25, words: {n: 'own', f: 'alt', mark: 'game'},
   fields: [...HEAD, 'uses', ...BODY, ...FOOT],
   acts: ['full'],
   rel: [...KWUSE, 'named', 'namedby']},

  {k: 'h', one: 'Mechanics', tone: 'blood', many: 'Mechanics', index: true, search: true, mark: 'ls',
   words: {f: 'own', mark: 'ours', only: 'gate'},
   fields: [...HEAD, ...BODY, ...FOOT],
   acts: [],
   rel: ['namedby', 'cat']},

  {k: 'x', one: 'Boss', tone: 'str', many: 'Bosses', place: 'Bosses', link: './#/bosses?q=@n', own: './bosses.js',
   search: true,
   fields: [...HEAD, ...BODY, ...FOOT],
   acts: ['open'],
   rel: ['namedby', 'cat']},
];

/* A card a tab makes up for itself — a farm, a build's gear slot — has no kind in this table. It still
   draws: the head, whatever lines and facts it carries, and the name for the kind the tab passes in. */
export const DEFAULT = {k: '', fields: [...HEAD, ...BODY, ...FOOT], acts: [], rel: []};

export const KIND = {};          // k -> its declaration
for(const d of KINDS) KIND[d.k] = d;
export const NAMES = {};         // k -> what a list of it is called: the guard's report and the search chips
for(const d of KINDS) NAMES[d.k] = d.many.toLowerCase();
/* the chips over the home page's search: All, then every kind that asked for one */
export const CHIPS = [['all', 'All'], ...KINDS.filter(d => d.search).map(d => [d.k, d.many])];
/* Where a keyword id turns back into a card (KINDS kw): `own` the kind that is a keyword itself, `named` the
   kinds whose card stands for the keyword that goes by its name — a keystone is its own keyword. */
export const KW = {
  own: (KINDS.find(d => d.kw === 'id') || {}).k || '',
  named: KINDS.filter(d => d.kw === 'name').map(d => d.k),
};
/* Whose words a mark inside a line is: 'ours' is a card we wrote, so the mark is the word with a footnote;
   'game' is the game's own word, so the mark is the word underlined. A key is "<kind>:<id>", so this answers
   for any mark, wherever it was worked out. The index marks our own at build time (tools/nodelinks.py) and
   the page draws those; the game's own are worked out as the card is drawn (assets/marks.js). */
export const markOf = key => ((KIND[(key || '')[0]] || {}).words || {}).mark || null;
export const ours = key => markOf(key) === 'ours';
/* the fields of one kind that land in one slot, in the order the kind declares them */
export const fieldsOf = (k, slot) =>
  ((KIND[k] || DEFAULT).fields || []).filter(f => FIELDS[f] && FIELDS[f].slot === slot);
