/* Every stylesheet closes what it opens. An @media block left open swallows every rule after it: those rules
   then hold only where the media query does (29 Sep 2026: the Build tab's styles and the Data page's held only
   for players who asked for less motion). Run by the guard's budget check; on its own: node tools/dev/cssbraces.mjs */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export async function checkBraces(){
  const bad = [];
  const files = (await readdir(join(ROOT, 'assets'))).filter(f => f.endsWith('.css'));
  for(const f of files){
    const s = await readFile(join(ROOT, 'assets', f), 'utf8');
    let i = 0, line = 1; const open = [];
    while(i < s.length){
      if(s.startsWith('/*', i)){ const j = s.indexOf('*/', i + 2); if(j < 0){ bad.push(f + ': a comment opened on line ' + line + ' never closes'); break; } line += s.slice(i, j).split('\n').length - 1; i = j + 2; continue; }
      const c = s[i];
      if(c === '"' || c === "'"){ const j = s.indexOf(c, i + 1); if(j < 0) break; line += s.slice(i, j).split('\n').length - 1; i = j + 1; continue; }
      if(c === '\n') line++;
      else if(c === '{') open.push(line);
      else if(c === '}'){ if(open.length) open.pop(); else bad.push(f + ': a } on line ' + line + ' closes nothing'); }
      i++;
    }
    for(const l of open) bad.push(f + ': the { on line ' + l + ' never closes');
  }
  return {bad, said: files.length + ' stylesheets close what they open'};
}
if(process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]){
  const r = await checkBraces();
  console.log(r.bad.length ? r.bad.join('\n') : 'ok   css: ' + r.said);
  process.exit(r.bad.length ? 1 : 0);
}
