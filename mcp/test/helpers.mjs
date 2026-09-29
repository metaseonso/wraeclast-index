/* The fixture as a site: a fetch that answers from test/fixture/ and writes down every request it was asked. */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Source } from '../src/source.js';
import { Index } from '../src/wi.js';
import { Answers } from '../src/answers.js';

export const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixture');
// the fixture's clock: an hour after its price file was written
export const NOW = Date.parse('2026-09-29T07:38:03Z');

export function fixtureFetch(log = []){
  const f = async (url, init = {}) => {
    const u = new URL(url);
    log.push({url, headers: init.headers || {}});
    const file = join(FIXTURE, decodeURIComponent(u.pathname).slice(1) + (u.search ? '_' + u.search.slice(1) : ''));
    try {
      const body = await readFile(file, 'utf8');
      return new Response(body, {status: 200, headers: {'Content-Type': 'application/json'}});
    } catch {
      return new Response('not found', {status: 404});
    }
  };
  f.log = log;
  return f;
}

/* a Source on the fixture: no disk, no waiting (the limiter's own test runs it for real) */
export function fixtureSource(opts = {}){
  const fetch = fixtureFetch();
  const src = new Source({base: 'https://wraeclastindex.fyi', fetch, dir: null, gap: 0, now: () => NOW, sleep: async () => {}, ...opts});
  src.log = fetch.log;
  return src;
}
export function fixtureAnswers(opts){
  const src = fixtureSource(opts);
  const a = new Answers(new Index(src), {now: () => NOW});
  a.src = src;
  return a;
}
