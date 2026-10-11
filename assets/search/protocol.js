/* What the page may ask the search worker, and what each answer carries: the one table both sides read.

   The page (assets/app.js ask) sends {op, id, ...ask} and gets back {id, ...answer}, or {id, error}. The worker
   (assets/searchworker.js OPS) answers by the same names. Neither side spells an op as a string of its own:
   `OP.heads` here is the name, and tools/dev/protocol.mjs fails a build where the page sends an op or a field this
   table does not have, or where the worker does not answer one it does. Imports nothing; costs nothing at run time. */
export const PROTOCOL = {
  fetch:   {ask: ['man', 'base'], answer: [],
            is: 'the manifest and where the site is: every kind\'s search rows asked for at once, for init to take'},
  init:    {ask: ['man', 'base', 'lang', 'market', 'runtime', 'seen'], answer: ['n'],
            is: 'the manifest, where the site is, today\'s priced keys, the cards the page makes itself, the trail and the player\'s language; answers once every kind\'s rows are in'},
  runtime: {ask: ['runtime'], answer: [],
            is: 'the cards the page makes itself, again (the bosses land after the market)'},
  market:  {ask: ['market'], answer: [],
            is: 'today\'s priced keys, again'},
  search:  {ask: ['q', 'kind', 'seen', 'n', 'from', 'take'], answer: ['keys', 'total', 'counts', 'heads'],
            is: 'the matches, best first (assets/rank.js): how many of each kind, the keys from..take of the kind asked for, and the first n as heads'},
  heads:   {ask: ['keys'], answer: ['heads'],
            is: 'the head of each key there is a card for'},
  bodies:  {ask: ['keys'], answer: ['bodies'],
            is: 'each card whole, read out of its card file'},
  rel:     {ask: ['key'], answer: ['lists'],
            is: 'the lists a card\'s groups give it (assets/graph.js), as keys'},
  find:    {ask: ['k', 'n'], answer: ['keys'],
            is: 'the keys of every card of one kind by one name'},
  words:   {ask: ['names'], answer: ['heads'],
            is: 'the heads of every card whose words mark other cards\' lines, and of the cards the named keywords stand for'},
};
/* the names, so neither side writes one out: OP.heads === 'heads' */
export const OP = Object.fromEntries(Object.keys(PROTOCOL).map(k => [k, k]));
