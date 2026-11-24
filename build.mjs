import { mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const root=path.dirname(fileURLToPath(import.meta.url));
rmSync(path.join(root,'dist'),{recursive:true,force:true});
mkdirSync(path.join(root,'dist/server'),{recursive:true});
mkdirSync(path.join(root,'dist/.openai'),{recursive:true});
await build({
  entryPoints:[path.join(root,'worker.js')],
  outfile:path.join(root,'dist/server/index.js'),
  bundle:true,format:'esm',platform:'browser',target:'es2022',
  conditions:['workerd','worker','browser'],
  minify:false,legalComments:'none',logLevel:'warning'
});
copyFileSync(path.join(root,'.openai/hosting.json'),path.join(root,'dist/.openai/hosting.json'));
console.log('Worker собран с PostgreSQL HTTP-драйвером.');
