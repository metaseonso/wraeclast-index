#!/usr/bin/env node
/* Wraeclast Index MCP server on stdio. Every line on stdout is the protocol's: messages go to stderr. */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, VERSION } from '../src/server.js';

const major = +process.versions.node.split('.')[0];
if(major < 18){
  process.stderr.write('wraeclast-index-mcp needs Node 18 or later; this is ' + process.versions.node + '.\n');
  process.exit(1);
}
if(process.argv.includes('--version')){
  process.stdout.write(VERSION + '\n');
  process.exit(0);
}
const server = createServer();
await server.connect(new StdioServerTransport());
process.stderr.write('wraeclast-index-mcp ' + VERSION + ' on stdio\n');
