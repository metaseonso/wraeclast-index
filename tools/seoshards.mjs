/* The crawler's half of the cut, for tools/shards.py: data/index.json through worker/seo.js cut(), so every slug
   is claimed by the same code that answers for it, and nothing about a slug is written down twice.

     node tools/seoshards.mjs <buckets> [index.json]      the cut as JSON on stdout: base, lists, items, words

   Nothing is written here; tools/shards.py names the files by their content and writes them. */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cut } from '../worker/seo.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const buckets = Math.max(1, parseInt(process.argv[2], 10) || 1);
const file = process.argv[3] || join(ROOT, 'data', 'index.json');
const index = JSON.parse(await readFile(file, 'utf8'));
process.stdout.write(JSON.stringify(cut(index, buckets)));
