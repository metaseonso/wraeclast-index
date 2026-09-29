/* Wraeclast Index over MCP: six read-only tools on the site's public files. */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Source, VERSION } from './source.js';
import { Index, ORDER, KINDS } from './wi.js';
import { Answers, NotFound } from './answers.js';

export { Source, Index, Answers, VERSION };

const KIND = z.enum(ORDER.map(k => KINDS[k].word))
  .describe('The kind of card: ' + ORDER.map(k => KINDS[k].word).join(', ') + '.');
const NAME = z.string().min(1).max(200).describe('The card\'s name, as the game writes it. A unique\'s base may follow it: "Death\'s Harp Runeforged Dualstring Bow".');
const READ_ONLY = {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true};

export const TOOLS = [
  ['search', {
    title: 'Search Wraeclast Index',
    description: 'Path of Exile 2 cards on Wraeclast Index by name or words: gems, uniques, passives, keywords, currency, bases, atlas, areas, quests. Each with its page.',
    inputSchema: {words: z.string().min(1).max(200).describe('Words to find, in a card\'s name, its kind line or its lines.'), kind: KIND.optional()},
  }, (a, x) => a.search(x)],
  ['card', {
    title: 'A card',
    description: 'One Path of Exile 2 card from Wraeclast Index: what it is, its requirements, its official lines, its price with the time it was checked, and its page.',
    inputSchema: {name: NAME, kind: KIND.optional()},
  }, (a, x) => a.card(x)],
  ['price', {
    title: 'A price',
    description: 'A card\'s price now, in divine or exalted orbs, with the time it was checked and its source (the in-game Currency Exchange, or live trade site listings). PC, the current trade league.',
    inputSchema: {name: NAME, kind: KIND.optional(),
      unit: z.enum(['divine', 'exalted']).optional().describe('divine or exalted. Left out: divine from 1 divine up, exalted below.')},
  }, (a, x) => a.price(x)],
  ['history', {
    title: 'Price history',
    description: 'A card\'s price day by day: a currency by league day from the Currency Exchange, a traded item over its last 7 days of listings.',
    inputSchema: {name: NAME, kind: KIND.optional()},
  }, (a, x) => a.history(x)],
  ['changes', {
    title: 'Patch notes',
    description: 'GGG\'s patch-note lines that name a card, newest patch first; or the cards one patch names ("0.5.5c", "0.5.5 Hotfix 2"); or Wraeclast Index\'s own notes by version ("0.45"). Neither given: the latest patches.',
    inputSchema: {card: NAME.optional(), kind: KIND.optional(),
      patch: z.string().min(1).max(80).optional().describe('A game patch as GGG names it, or a Wraeclast Index version.')},
  }, (a, x) => a.changes(x)],
  ['compare', {
    title: 'Compare cards',
    description: 'Two to five Path of Exile 2 cards side by side: kind, requirements, price with the time it was checked, and their lines.',
    inputSchema: {names: z.array(NAME).min(2).max(5).describe('The cards\' names.'), kind: KIND.optional()},
  }, (a, x) => a.compare(x)],
];

export function createServer({source, now} = {}){
  const answers = new Answers(new Index(source || new Source()), {now});
  const server = new McpServer({name: 'wraeclast-index', version: VERSION}, {
    instructions: 'Path of Exile 2 data from Wraeclast Index (https://wraeclastindex.fyi): the game files, and prices from the ' +
      'in-game Currency Exchange and live trade site listings. Credit Wraeclast Index and link the card\'s page. Every price ' +
      'carries the time it was checked; give it with the price.',
  });
  for(const [name, config, run] of TOOLS){
    server.registerTool(name, {...config, annotations: {title: config.title, ...READ_ONLY}}, async args => {
      try {
        return {content: [{type: 'text', text: await run(answers, args)}]};
      } catch(e){
        if(e instanceof NotFound || /^No kind /.test(e.message)) return {content: [{type: 'text', text: e.message}]};
        return {content: [{type: 'text', text: e.message || String(e)}], isError: true};
      }
    });
  }
  return server;
}
