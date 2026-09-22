/* Every kind of thing the site cards, in one table.
   Nothing here draws anything: it says what a kind is called, which fields its cards carry, which actions they
   offer and which related lists they can build. assets/app.js turns that into a card (one renderer, one
   function per field type) and tools/dev/guard.mjs reads the same table instead of reading names back out of
   the code. A new kind — a new league's items, a new list — is one entry in KINDS plus its rows in the index,
   and no card code.

   KINDS, per kind:
     k        the letter the index marks it with
     one/many what one of it and a list of it are called
     place    the tab the gold button opens, if it has one      sec    its section on the drill-down page
     search   a chip over the home page's search                item   an item: it can be traded
     index    its rows live in data/index.json                    crawl  the crawler publishes a page for it
     own      a module that draws its card instead of us
     fields   the fields its card draws, in order (FIELDS)
     acts     the buttons under it (ACTS)
     rel      the groups under Connections it can build (REL), each one worked out from the index itself

   FIELDS, per field:
     type     which function draws it (TYPE in app.js)
     at       the field on the index entry it reads, where it reads one
     slot     where it lands on the card: head, pill, fact, body or foot
     label    the words beside the value
     file     a table of its own, fetched the first time a card asks for it and kept for the visit. Nothing of
              it is in the index or in first paint, and a card whose name the table does not hold draws nothing.
   A field draws nothing when the entry carries nothing for it, so one declaration covers a full entry and a
   bare one. Fields a player must never read (the search words, internal ids) are in no declaration.

   REL, per group under Connections: what it is called, which kind its rows are, which edge builds it, and the
   filter its "see all" link carries to the drill-down (assets/bridge.js reads those names). */

export const ROUTES = ['home', 'build', 'currency', 'trade', 'farms', 'atlas', 'bosses', 'craft'];
export const SECTIONS = {gems: 'Gems', uniques: 'Uniques', tree: 'Passive tree'};

export const FIELDS = {
  art:      {type: 'art', slot: 'head'},
  name:     {type: 'name', slot: 'head'},
  sub:      {type: 'text', at: 's', slot: 'head'},
  price:    {type: 'money', slot: 'head'},

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

  lines:    {type: 'rich', at: 'ls', slot: 'body'},          // the effect lines: mods, stats, what it adds
  text:     {type: 'rich', at: 't', slot: 'body'},           // what it does, in the game's own words
  /* the modifier it puts on an item, per kind of item: an essence adds a different one to a bow than to a body
     armour, and the game's one line says none of it. Anything else that adds a known modifier reads the same
     table, keyed by whatever "at" names (tools/essences.py). */
  adds:     {type: 'adds', at: 'n', slot: 'body', file: 'data/essences.json', label: 'What it adds'},
  quote:    {type: 'quote', at: 'qt', slot: 'body'},         // the game's own flavour line
  options:  {type: 'options', at: 'o', slot: 'body'},
  flow:     {type: 'flow', at: 'fl', slot: 'body'},
  source:   {type: 'source', at: 'src', slot: 'body'},
  offer:    {type: 'offer', slot: 'body'},
  tags:     {type: 'tags', at: 'tags', slot: 'body'},
  anoint:   {type: 'anoint', at: 'rec', slot: 'body'},
  keywords: {type: 'chips', at: 'kw', slot: 'body'},         // the popup only: a way in, not a line of text

  spark:    {type: 'spark', slot: 'foot'},
  usage:    {type: 'usage', slot: 'foot'},
  thin:     {type: 'thin', slot: 'foot'},
  builds:   {type: 'builds', slot: 'foot'},
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

   A label names the relationship as it reads from the card you are on, so the same edge says the right thing
   from either end: a unique "Sits on" its base, a base is "Used by uniques"; an item "Grants" a skill, a gem
   is "Granted by" items. An edge that runs both ways alike ("Listed with") keeps the one label. */
export const REL = {
  kwu:      {label: 'Used by uniques', of: 'u', edge: 'kwuse', g: 'u', filter: 'kw'},
  kwg:      {label: 'Used by gems', of: 'g', edge: 'kwuse', g: 'g', filter: 'kw'},
  kwp:      {label: 'Used by passives', of: 'p', edge: 'kwuse', g: 'p', filter: 'kw'},
  kwb:      {label: 'Used by bases', of: 'b', edge: 'kwuse', g: 'b'},
  kwe:      {label: 'Used by essences', of: 'c', edge: 'kwuse', g: 'e'},
  kwa:      {label: 'Used on the Atlas', of: 'a', edge: 'kwuse', g: 'a'},
  kwm:      {label: 'Used by crafting mods', edge: 'kwuse', g: 'm'},
  kwc:      {label: 'Used by currency', of: 'c', edge: 'kwuse', g: 'c', filter: 'currency'},
  kww:      {label: 'Used by keywords', of: 'w', edge: 'kwuse', g: 'w'},

  base:     {label: 'Sits on', of: 'b', edge: 'base'},
  variants: {label: 'Shares its base with', of: 'u', edge: 'variants', filter: 'base'},
  uniques:  {label: 'Used by uniques', of: 'u', edge: 'uniques', filter: 'base'},
  klass:    {label: 'Shares its class with', of: 'b', edge: 'klass', filter: 'craft'},
  grants:   {label: 'Grants', of: 'g', edge: 'grants', needs: 'grants'},
  granted:  {label: 'Granted by', edge: 'granted', needs: 'grants'},
  section:  {label: 'Listed with', of: 'a', edge: 'section', filter: 'atlas'},
  cat:      {label: 'Listed with', edge: 'cat'},
  named:    {label: 'Names', edge: 'named'},
  namedby:  {label: 'Named by', edge: 'namedby'},
};

const HEAD = ['art', 'name', 'sub', 'price'];
// the words first, then the rest of the body: a kind with more to say puts it between the two (the currency)
const SAYS = ['lines', 'text'];
const REST = ['quote', 'options', 'flow', 'source', 'offer', 'tags', 'anoint', 'keywords'];
const BODY = [...SAYS, ...REST];
const FOOT = ['spark', 'usage', 'thin', 'builds'];
const KWUSE = ['kwu', 'kwg', 'kwp', 'kwb', 'kwe', 'kwa', 'kwm', 'kwc', 'kww'];

export const KINDS = [
  {k: 'g', one: 'Gem', many: 'Gems', place: 'Gems', sec: 'gems', link: 'explore#gems=@n', mark: 't',
   index: true, search: true, item: true, crawl: true,
   fields: [...HEAD, 'gemreq', 'lineage', 'usetime', 'cost', 'spirit', ...BODY, ...FOOT],
   acts: ['trade', 'full', 'open'],
   rel: ['granted', 'named', 'namedby', 'cat']},

  {k: 'u', one: 'Unique', many: 'Uniques', place: 'Uniques', sec: 'uniques', link: 'explore#uniques=@n', mark: 'ls',
   index: true, search: true, item: true, crawl: true,
   fields: [...HEAD, 'reqs', 'corrupt', 'limit', 'group', 'props', 'implicit', ...BODY, ...FOOT],
   acts: ['trade', 'full', 'open'],
   rel: ['base', 'variants', 'grants', 'named', 'namedby', 'cat']},

  {k: 'p', one: 'Passive', many: 'Passives', place: 'Passive tree', sec: 'tree', link: 'explore#tree=@n', mark: 'ls',
   index: true, search: true, crawl: true,
   fields: [...HEAD, 'asc', 'region', 'ontree', ...BODY, ...FOOT],
   acts: ['full', 'open'],
   rel: [...KWUSE, 'grants', 'named', 'namedby', 'cat']},

  {k: 'b', one: 'Base', many: 'Bases', place: 'Craft', link: 'craft', mark: 'ls',
   index: true, search: true, item: true, crawl: true,
   fields: [...HEAD, 'reqs', 'props', 'implicit', 'weights', ...BODY, ...FOOT],
   acts: ['trade', 'craft'],
   rel: ['uniques', 'grants', 'klass', 'named', 'namedby']},

  {k: 'a', one: 'Atlas', many: 'Atlas', place: 'Atlas', link: './#/atlas?s=@at&q=@n',
   index: true, search: true, item: true, crawl: true,
   fields: [...HEAD, 'nodety', 'ontree', 'warn', 'implicit', ...BODY, ...FOOT],
   acts: ['trade', 'open'],
   rel: ['section', 'named', 'namedby']},

  {k: 'c', one: 'Currency', many: 'Currency', place: 'Currency', link: './#/currency?c=@id',
   index: true, search: true, item: true, crawl: true,
   fields: [...HEAD, 'droplv', ...SAYS, 'adds', ...REST, ...FOOT],
   acts: ['trade', 'open'],
   rel: ['named', 'namedby', 'cat']},

  {k: 'w', one: 'Keyword', many: 'Keywords', sec: 'keywords', index: true, search: true, crawl: true,
   fields: [...HEAD, 'uses', ...BODY, ...FOOT],
   acts: ['full'],
   rel: [...KWUSE, 'named', 'namedby']},

  {k: 'h', one: 'Mechanics', many: 'Mechanics', index: true, search: true, mark: 'ls',
   fields: [...HEAD, ...BODY, ...FOOT],
   acts: [],
   rel: ['namedby', 'cat']},

  {k: 'x', one: 'Boss', many: 'Bosses', place: 'Bosses', link: './#/bosses?q=@n', own: './bosses.js',
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
/* the fields of one kind that land in one slot, in the order the kind declares them */
export const fieldsOf = (k, slot) =>
  ((KIND[k] || DEFAULT).fields || []).filter(f => FIELDS[f] && FIELDS[f].slot === slot);
