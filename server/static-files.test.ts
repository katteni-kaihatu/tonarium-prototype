import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolvePublicFile } from './static-files.ts';

function fixture(t: import('node:test').TestContext) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tonarium-static-')),root=path.join(directory,'public'),privateRoot=path.join(directory,'public-private');
  fs.mkdirSync(path.join(root,'assets'),{recursive:true});fs.mkdirSync(privateRoot);
  fs.writeFileSync(path.join(root,'assets','map.txt'),'PUBLIC_MAP');fs.writeFileSync(path.join(privateRoot,'canary.txt'),'PRIVATE_CANARY');
  t.after(()=>{const relative=path.relative(os.tmpdir(),directory);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));fs.rmSync(directory,{recursive:true,force:true});});
  return {root,privateRoot};
}

test('static serving returns real files inside the public directory',t=>{
  const {root}=fixture(t);const file=resolvePublicFile(root,'/assets/map.txt');
  assert.equal(file,path.join(root,'assets','map.txt'));assert.equal(fs.readFileSync(file!,'utf8'),'PUBLIC_MAP');
});

test('static serving rejects encoded sibling-prefix escapes with either path separator',t=>{
  const {root}=fixture(t);
  for(const pathname of ['/../public-private/canary.txt','/..%2fpublic-private%2fcanary.txt','/..%5cpublic-private%5ccanary.txt','/%2e%2e%2fpublic-private%2fcanary.txt'])assert.equal(resolvePublicFile(root,pathname),undefined,pathname);
});

test('malformed encodings, nulls, missing files and directories cannot crash static serving',t=>{
  const {root}=fixture(t);
  for(const pathname of ['/%E0%A4%A','/assets/%00.txt','/missing.txt','/assets','assets/map.txt'])assert.equal(resolvePublicFile(root,pathname),undefined,pathname);
});

test('static serving follows only symlinks whose real target remains public',t=>{
  const {root,privateRoot}=fixture(t);
  fs.symlinkSync(privateRoot,path.join(root,'outside'),'junction');
  fs.symlinkSync(path.join(root,'assets'),path.join(root,'inside'),'junction');
  assert.equal(resolvePublicFile(root,'/outside/canary.txt'),undefined);
  assert.equal(fs.readFileSync(resolvePublicFile(root,'/inside/map.txt')!,'utf8'),'PUBLIC_MAP');
});
