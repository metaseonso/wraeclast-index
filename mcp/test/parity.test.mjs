/* The package keeps its own copy of a few of the site's rules, so it can ship alone. Here, in the repo, each copy is
   held to the site's own: the slugs, the buckets, the kinds, the patch-note rule and a card's words. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { slugify, bucketOf, KINDS } from '../src/wi.js';
import { itemWords } from '../src/words.js';
import { namedIn } from '../src/answers.js';
import { fixtureSource, FIXTURE } from './helpers.mjs';
import { Index } from '../src/wi.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const SEO = join(REPO, 'worker', 'seo.js'), KJS = join(REPO, 'assets', 'kinds.js');
const inRepo = existsSync(SEO) && existsSync(KJS);
const skip = !inRepo && 'not in the Wraeclast Index repo';

test('slugify and bucketOf are worker/seo.js\'s', {skip}, async () => {
  const seo = await import(pathToFileURL(SEO).href);
  for(const s of ["Death's Harp Runeforged Dualstring Bow", 'Mjölner', 'Waystone (Tier 15)', "Ahn's Citadel", '  --odd--  name ', 'Ürn’s Fall', ''])
    assert.equal(slugify(s), seo.slugify(s), s);
  for(const s of ['divine-orb', 'fireball', 'deaths-harp-dualstring-bow', 'a', ''])
    for(const n of [1, 2, 32]) assert.equal(bucketOf(s, n), seo.bucketOf(s, n));
});

test('the kinds with a page are assets/kinds.js\'s, in its claim order', {skip}, async () => {
  const k = await import(pathToFileURL(KJS).href);
  const crawl = Object.fromEntries(k.KINDS.filter(d => d.crawl && typeof d.crawl === 'object').map(d => [d.k, {one: d.one, word: d.crawl.word, rank: d.crawl.rank}]));
  assert.deepEqual(KINDS, crawl);
});

test('the patch-note rule is assets/kinds.js namedIn', {skip}, async () => {
  const k = await import(pathToFileURL(KJS).href);
  const lines = ['Freeze now lasts longer.', 'Fixed a bug with Freeze Mine.', 'Enemies you Freeze take more damage.', 'Cold hits Freeze.',
    'The Freeze support gem now works.', 'Fireball: now has more damage.', 'Reduced Freeze Buildup.'];
  for(const key of ['w:Freeze', 'g:Freeze', 'g:Fireball', 'u:Headhunter', 'd:Chill'])
    for(const l of lines) assert.equal(namedIn(key, l), k.namedIn(key, l), key + ' / ' + l);
});

test('a card\'s words are the words the site ships', async () => {
  const ix = new Index(fixtureSource());
  const man = await ix.manifest();
  let n = 0;
  for(const k of Object.keys(man.seo.words)){
    for(const w of await ix.words(k)){
      const e = await ix.entry(w.slug);
      assert.ok(e, w.slug);
      assert.equal(itemWords(e), w.words, w.slug);
      n++;
    }
  }
  assert.ok(n >= 12, n + ' cards');
});

test('the package stays out of the site\'s build', {skip}, () => {
  const ignore = readFileSync(join(REPO, '.assetsignore'), 'utf8').split(/\r?\n/).map(l => l.trim());
  assert.ok(ignore.some(l => /^\/?mcp\/?$/.test(l)), '.assetsignore leaves out mcp/');
});

test('the Data page names the package, once published', {skip}, () => {
  const data = readFileSync(join(REPO, 'assets', 'data.js'), 'utf8');
  assert.match(data, /wraeclast-index-mcp/);
  assert.match(data, /once published/);
});

test('the fixture is a local copy, not the live site', () => {
  assert.ok(existsSync(join(FIXTURE, 'data', 'manifest.json')));
});
