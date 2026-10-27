import fs from 'node:fs';
import path from 'node:path';

const inside=(root:string,file:string)=>{const relative=path.relative(root,file);return !!relative&&!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative);};

export function resolvePublicFile(directory:string,pathname:string):string|undefined {
  try {
    const decoded=decodeURIComponent(pathname);
    if(!decoded.startsWith('/')||/[\u0000-\u001f\u007f]/u.test(decoded))return undefined;
    const root=path.resolve(directory),file=path.resolve(root,`.${decoded}`);
    if(!inside(root,file)||!fs.statSync(file).isFile())return undefined;
    // 同名接頭辞と公開領域外へのリンクを拒否する。
    if(!inside(fs.realpathSync(root),fs.realpathSync(file)))return undefined;
    return file;
  }catch{return undefined;}
}
