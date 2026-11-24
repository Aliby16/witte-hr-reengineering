import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root=path.dirname(new URL(import.meta.url).pathname);
const files=['security.js','db.js','seed.js','documents.js','public.js','styles.js','ui.js','client.js','operations.js','api.js','worker.js'];
const pieces=files.map(filename=>{
  let text=readFileSync(path.join(root,filename),'utf8');
  text=text.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm,'');
  text=text.replace(/^export (?!default)/gm,'');
  return `\n// Source module: ${filename}\n${text}`;
});
rmSync(path.join(root,'dist'),{recursive:true,force:true});
mkdirSync(path.join(root,'dist/server'),{recursive:true});
mkdirSync(path.join(root,'dist/.openai'),{recursive:true});
const target=path.join(root,'dist/server/index.js');
writeFileSync(target,pieces.join('\n'));
copyFileSync(path.join(root,'.openai/hosting.json'),path.join(root,'dist/.openai/hosting.json'));
const check=spawnSync(process.execPath,['--check',target],{encoding:'utf8'});
if(check.status!==0){process.stderr.write(check.stderr);process.exit(check.status||1);}
console.log('Worker собран и прошёл проверку синтаксиса.');
