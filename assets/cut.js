/* The index's cut (tools/shards.py), read back: what the page and the search worker (assets/searchworker.js)
   both do to a file of it as it arrives, and nowhere else.

   data/manifest.json names every file: per kind its search rows and its card files, each file with its bytes
   and a card file with how many cards it holds, in the index's order. A file of rows is {k, rows, dict}: every
   word said many times is said once in "dict" and the rows carry numbers into it (tools/appdata.py pack). */

/* The words back on every row, from the file's own "dict", before anything else sees a row. */
export function unpack(part){
  const W = part && part.dict;
  if(!W) return part;
  const word = (f, v) => typeof v === 'number' ? W[f][v] : Array.isArray(v) ? v.map(i => W[f][i]) : v;
  for(const list of Object.values(part)) if(Array.isArray(list)) for(const it of list)
    if(it && typeof it === 'object' && !Array.isArray(it)) for(const f in W) if(it[f] !== undefined) it[f] = word(f, it[f]);
  delete part.dict;
  return part;
}

/* The index's own order: the manifest's runs of [kind, how many], each kind's rows taken in turn. */
export function inOrder(order, byKind){
  const at = {}, out = [];
  for(const [k, n] of order){
    const list = byKind[k] || [];
    at[k] = at[k] || 0;
    for(let i = 0; i < n && at[k] < list.length; i++) out.push(list[at[k]++]);
  }
  return out;
}

/* The fields a row is first drawn with, before its card is in: a search result, a Connections row, a pin, and
   the words a keyword or mechanics card is marked by. What assets/app.js prep and card() make of a card that
   carries only these is its head: name, sub line, art and price. */
export const HEAD = ['id', 'n', 's', 'ic', 'img', 'lo', 'li', 'cr', 'at', 'f', 'fg'];
