/* The server as a client sees it: six read-only tools, each answering in text. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, VERSION } from '../src/server.js';
import { fixtureSource, NOW } from './helpers.mjs';

async function connect(){
  const server = createServer({source: fixtureSource(), now: () => NOW});
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({name: 'test', version: '1.0.0'});
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}
const text = r => r.content.map(c => c.text).join('\n');

test('six tools, all read-only', async () => {
  const client = await connect();
  const {tools} = await client.listTools();
  assert.deepEqual(tools.map(t => t.name), ['search', 'card', 'price', 'history', 'changes', 'compare']);
  for(const t of tools){
    assert.equal(t.annotations.readOnlyHint, true, t.name);
    assert.equal(t.annotations.destructiveHint, false, t.name);
    assert.ok(t.description.length > 20, t.name);
  }
  const card = tools.find(t => t.name === 'card');
  assert.deepEqual(card.inputSchema.required, ['name']);
  assert.deepEqual(card.inputSchema.properties.kind.enum, ['unique', 'gem', 'passive', 'keyword', 'currency', 'base', 'atlas', 'area', 'quest']);
  await client.close();
});

test('a call answers in text; a name that is no card is an answer, not an error', async () => {
  const client = await connect();
  const r = await client.callTool({name: 'price', arguments: {name: 'Headhunter'}});
  assert.ok(!r.isError);
  assert.match(text(r), /Price: 250 div, up 14% in 7 days\.\nChecked: /);
  const none = await client.callTool({name: 'card', arguments: {name: 'Mirror of Nothing'}});
  assert.ok(!none.isError);
  assert.match(text(none), /^No card named "Mirror of Nothing"\./);
  const bad = await client.callTool({name: 'compare', arguments: {names: ['Headhunter']}});
  assert.ok(bad.isError);   // the schema wants two names at least
  await client.close();
});

test('the bin starts on stdio and says its version', async () => {
  const bin = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'wraeclast-index-mcp.js');
  const out = await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [bin, '--version']);
    let s = '';
    p.stdout.on('data', d => { s += d; });
    p.on('error', reject);
    p.on('close', () => resolve(s.trim()));
  });
  assert.equal(out, VERSION);
});
