import type { FantasyAccountPublic, FantasyAccountResponse } from '../../../shared/fantasy-account.ts';

export type FantasyAccountOperation = 'status'|'register'|'login'|'logout'|'recover'|'password'|'recovery'|'claim';
export const validFantasyUsername = (value: string) => value===value.trim()&&/^[a-zA-Z0-9_]{3,24}$/u.test(value);
export const validFantasyPassword = (value: string) => value.length >= 10 && value.length <= 128;
export const fantasyAccountStatusNeedsBinding=(current:FantasyAccountPublic|null,ready:boolean,response:FantasyAccountResponse)=>!response.error&&!!response.account&&(!ready||current?.id!==response.account.id||current.principal!==response.account.principal);

function account(value: unknown): value is FantasyAccountPublic {
  if (!value || typeof value !== 'object') return false;
  const object=value as Record<string,unknown>;
  return typeof object.id==='string'&&object.id.length>0&&object.id.length<=128
    &&typeof object.principal==='string'&&object.principal.length>0&&object.principal.length<=200
    &&typeof object.username==='string'&&validFantasyUsername(object.username);
}

export async function requestFantasyAccount(operation: FantasyAccountOperation, body?: Record<string,string>, options: {fetch?: typeof fetch; signal?: AbortSignal} = {}): Promise<FantasyAccountResponse> {
  try {
    const result=await (options.fetch??fetch)(`/api/fantasy/account/${operation}`,{
      method:operation==='status'?'GET':'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
      ...(operation==='status'?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body??{})}),signal:options.signal,
    });
    const value:unknown=await result.json();
    if(!value||typeof value!=='object')return {account:null,error:'unavailable'};
    const object=value as Record<string,unknown>;
    if(object.account!==null&&!account(object.account))return {account:null,error:'unavailable'};
    if(typeof object.error==='string')return {account:null,error:object.error as FantasyAccountResponse['error']};
    if(!result.ok||object.account===undefined)return {account:null,error:'unavailable'};
    if(object.ticket!==undefined&&(typeof object.ticket!=='string'||object.ticket.length>512))return {account:null,error:'unavailable'};
    if(object.recoveryCode!==undefined&&(typeof object.recoveryCode!=='string'||object.recoveryCode.length>256))return {account:null,error:'unavailable'};
    return {account:object.account as FantasyAccountPublic|null,...(typeof object.ticket==='string'?{ticket:object.ticket}:{}),...(typeof object.recoveryCode==='string'?{recoveryCode:object.recoveryCode}:{})};
  } catch (error) {
    if(options.signal?.aborted)throw error;
    return {account:null,error:'unavailable'};
  }
}
