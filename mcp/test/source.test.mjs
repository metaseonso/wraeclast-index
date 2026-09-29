/* How the package asks the site: which files, who it says it is, how often, and how long it keeps a copy. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Source, allowed, ttlOf, cacheDir, USER_AGENT, VERSION, GAP, PER_MINUTE, LIVE } from '../src/source.js';
import { fixtureFetch, fixtureSource, NOW } from './helpers.mjs';

// a clock the limiter's sleeps move forward
function clock(start = NOW){
  const c = {t: start};
  c.now = () => c.t;
  c.sleep = async ms => { c.t += ms; };
  return c;
}
const ok = body => async () => new Response(body, {status: 200});

test('reads only the public files it is allowed', () => {
  for(const p of ['data/manifest.json', 'data/seo/base.45ff4980ac.json', 'data/seo/item/00.3427ad58e3.json',
    'data/seo/words/g00.05cedd3cc5.txt', 'data/cards/u/00.c074f6a5a9.json', 'data/search/g.7419fbbfe4.json', LIVE,
    'data/market/index.json', 'data/market/cards-3.json', 'data/changelog.json', 'data/patches.json', 'data/patchnotes.json'])
    assert.ok(allowed(p), p);
  for(const p of ['data/market.json', 'data/market.json?part=hist', 'data/index.json', 'api/prices/state', 'data/seo/base.json',
    'item/divine-orb', 'md/item/divine-orb.md', '../secret', 'data/market/../index.json', 'data/rollprices.json', 'search?q=x'])
    assert.ok(!allowed(p), p);
});

test('refuses any other path before a request goes out', async () => {
  const src = fixtureSource();
  await assert.rejects(src.text('data/market.json'), /Not a Wraeclast Index public file/);
  await assert.rejects(src.text('api/health'), /Not a Wraeclast Index public file/);
  assert.equal(src.requests, 0);
});

test('names itself in the User-Agent', async () => {
  assert.equal(USER_AGENT, 'wraeclast-index-mcp/' + VERSION + ' (+https://wraeclastindex.fyi/#/data)');
  const src = fixtureSource();
  await src.json('data/manifest.json');
  assert.equal(src.log.length, 1);
  assert.equal(src.log[0].url, 'https://wraeclastindex.fyi/data/manifest.json');
  assert.equal(src.log[0].headers['User-Agent'], USER_AGENT);
});

test('keeps each copy as long as its kind allows', () => {
  assert.equal(ttlOf('data/seo/base.45ff4980ac.json'), Infinity);
  assert.equal(ttlOf(LIVE), 5 * 60e3);
  assert.equal(ttlOf('data/manifest.json'), 10 * 60e3);
  assert.equal(ttlOf('data/market/index.json'), 3600e3);
  assert.equal(ttlOf('data/patchnotes.json'), 3600e3);
});

test('prices again after 5 minutes, content-named files never', async () => {
  const c = clock();
  const src = fixtureSource({now: c.now, sleep: c.sleep});
  await src.text(LIVE);
  await src.text('data/seo/base.45ff4980ac.json');
  await src.text(LIVE);
  assert.equal(src.requests, 2);
  c.t += 5 * 60e3 - 1;
  await src.text(LIVE);
  assert.equal(src.requests, 2);
  c.t += 2;
  await src.text(LIVE);
  await src.text('data/seo/base.45ff4980ac.json');
  assert.equal(src.requests, 3);
  c.t += 365 * 86400e3;
  await src.text('data/seo/base.45ff4980ac.json');
  assert.equal(src.requests, 3);
});

test('one request for the same file asked twice at once', async () => {
  const src = fixtureSource();
  await Promise.all([src.text(LIVE), src.text(LIVE), src.text(LIVE)]);
  assert.equal(src.requests, 1);
});

test('keeps copies on disk, in the OS cache folder by default', async () => {
  assert.match(cacheDir({LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local'}, 'win32'), /AppData.Local.wraeclast-index-mcp$/);
  assert.match(cacheDir({}, 'darwin'), /Library.Caches.wraeclast-index-mcp$/);
  assert.match(cacheDir({XDG_CACHE_HOME: '/tmp/xdg'}, 'linux'), /xdg.wraeclast-index-mcp$/);
  assert.equal(cacheDir({WI_MCP_CACHE: 'off'}, 'linux'), null);
  const dir = await mkdtemp(join(tmpdir(), 'wi-mcp-'));
  try {
    const one = fixtureSource({dir});
    const text = await one.text(LIVE);
    await one.text('data/seo/base.45ff4980ac.json');
    await new Promise(r => setTimeout(r, 50));   // the disk writes finish
    const two = fixtureSource({dir});
    assert.equal(await two.text(LIVE), text);
    await two.text('data/seo/base.45ff4980ac.json');
    assert.equal(two.requests, 0);
    const later = fixtureSource({dir, now: () => NOW + 6 * 60e3});
    await later.text(LIVE);
    await later.text('data/seo/base.45ff4980ac.json');
    assert.equal(later.requests, 1);   // the price again; the content-named file from disk
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('uses the last copy when the site does not answer', async () => {
  const c = clock();
  let up = true;
  const fetch = async (url, init) => up ? fixtureFetch()(url, init) : new Response('down', {status: 503});
  const src = new Source({fetch, dir: null, gap: 0, now: c.now, sleep: c.sleep});
  const text = await src.text(LIVE);
  up = false;
  c.t += 10 * 60e3;
  assert.equal(await src.text(LIVE), text);
  await assert.rejects(src.text('data/changelog.json'), /answered 503/);
});

test('never two requests within a second, never over the cap in a minute', async () => {
  assert.equal(GAP, 1000);
  assert.ok(PER_MINUTE <= 120);
  const c = clock(), at = [];
  const src = new Source({fetch: async () => { at.push(c.t); return new Response('{}'); }, dir: null, now: c.now, sleep: c.sleep});
  await Promise.all(Array.from({length: 150}, (_, i) => src.text('data/market/m' + i + '.json')));
  assert.equal(at.length, 150);
  for(let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 1000, 'gap at ' + i);
  for(let i = 0; i < at.length; i++) assert.ok(at.filter(t => t >= at[i] && t < at[i] + 60e3).length <= 120, 'minute from ' + i);
});

test('holds to the cap in a minute on its own', async () => {
  const c = clock(), at = [];
  const src = new Source({fetch: async () => { at.push(c.t); return new Response('{}'); }, dir: null, gap: 0, perMinute: 5, now: c.now, sleep: c.sleep});
  await Promise.all(Array.from({length: 12}, (_, i) => src.text('data/market/m' + i + '.json')));
  assert.deepEqual(at.map(t => t - NOW), [0, 0, 0, 0, 0, 60e3, 60e3, 60e3, 60e3, 60e3, 120e3, 120e3]);
});

test('a 429 holds every request until Retry-After', async () => {
  const c = clock(), at = [];
  let first = true;
  const fetch = async () => {
    at.push(c.t);
    if(first){ first = false; return new Response('slow down', {status: 429, headers: {'Retry-After': '30'}}); }
    return new Response('{}');
  };
  const src = new Source({fetch, dir: null, now: c.now, sleep: c.sleep});
  await assert.rejects(src.text('data/market/a.json'), /busy \(429\)/);
  await src.text('data/market/b.json');
  assert.ok(at[1] - at[0] >= 30e3 + GAP);
});

test('drops the content-named copies a new manifest no longer names', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wi-mcp-'));
  try {
    await mkdir(join(dir, 'data', 'seo', 'item'), {recursive: true});
    await writeFile(join(dir, 'data', 'seo', 'item', '00.aaaaaaaaaa.json'), '1\n{}');
    await writeFile(join(dir, 'data', 'seo', 'item', '00.bbbbbbbbbb.json'), '1\n{}');
    const src = new Source({fetch: ok('{}'), dir});
    assert.equal(await src.prune(new Set(['data/seo/item/00.bbbbbbbbbb.json'])), 1);
    assert.deepEqual(await readdir(join(dir, 'data', 'seo', 'item')), ['00.bbbbbbbbbb.json']);
  } finally { await rm(dir, {recursive: true, force: true}); }
});
