import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

// Windows の cmd.exe の引数長制限を避け、同時実行数も抑える。
const files=JSON.parse(fs.readFileSync(new URL('./fantasy-test-files.json',import.meta.url),'utf8'));
if(!Array.isArray(files)||!files.length||files.some(file=>typeof file!=='string'||!file.endsWith('.test.ts')&&!file.endsWith('.test.tsx')||!fs.existsSync(file)))throw new Error('Invalid fantasy test manifest');
const result=spawnSync(process.execPath,['--import','./scripts/register-test-css.mjs','--import','tsx','--test','--test-concurrency=2',...process.argv.slice(2),...files],{stdio:'inherit'});
if(result.error)console.error(result.error);
process.exit(result.status??1);
