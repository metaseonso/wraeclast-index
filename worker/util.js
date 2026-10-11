/* What more than one worker module needs and none owns. Imports nothing. */

/* two byte arrays equal, in constant time: a key or a hash is never compared a byte at a time where a timing could
   say how far the match got (worker/dash.js checkPassword, ownerKey; worker/files.js fromServer) */
export function same(a, b){
  let d = a.length ^ b.length;
  for(let i = 0; i < Math.max(a.length, b.length); i++) d |= (a[i] | 0) ^ (b[i] | 0);
  return d === 0;
}
