import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isIP } from 'node:net';
import { FANTASY_ACCOUNT_PASSWORD_MAX, FANTASY_ACCOUNT_PASSWORD_MIN, FANTASY_ACCOUNT_USERNAME,
  type FantasyAccountError, type FantasyAccountPublic, type FantasyAccountResponse } from '../shared/fantasy-account.ts';

interface StoredAccount extends FantasyAccountPublic { salt: string; passwordHash: string; recoveryHash: string; createdAt: number }
interface StoredSession { key: string; account: string; expiresAt: number }
interface StoredClaim { key: string; principal: string; expiresAt: number }
interface Ledger { version: 1; accounts: StoredAccount[]; sessions: StoredSession[]; claims: StoredClaim[] }
export interface AccountBinding { account: FantasyAccountPublic; sessionKey: string }
export interface FantasyAccountsOptions {
  file: string;
  now?: () => number;
  onError?: (error: unknown) => void;
  save?: (file: string, serialized: string) => void;
  trustProxy?: boolean;
  trustedProxyAddresses?: readonly string[];
  secureCookies?: boolean;
  canClaimLegacy?: (account: FantasyAccountPublic, principal: string) => boolean;
}
interface Ticket { account: string; sessionKey: string; expiresAt: number }
const SESSION_MS = 30 * 86400_000, TICKET_MS = 60_000, CLAIM_MS = 86400_000;
const BASE = '/api/fantasy/account/';
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const HEX = /^[a-f0-9]{64}(?![\s\S])/u, PRINCIPAL = new RegExp(`^fantasy:${UUID}(?![\\s\\S])`,'u');
const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const publicAccount = (account: StoredAccount): FantasyAccountPublic => ({ id: account.id, principal: account.principal, username: account.username });
const equal = (first: string, second: string) => first.length === second.length && timingSafeEqual(Buffer.from(first), Buffer.from(second));
const token = () => randomBytes(32).toString('base64url');
const passwordValid = (value: unknown): value is string => typeof value === 'string' && value.length >= FANTASY_ACCOUNT_PASSWORD_MIN && value.length <= FANTASY_ACCOUNT_PASSWORD_MAX && Buffer.byteLength(value) <= 512;
const normalizeAddress = (value?: string): string | undefined => {
  if (!value) return undefined;
  if (isIP(value) === 4) return value;
  if (isIP(value) !== 6 || value.includes('%')) return undefined;
  const address = new URL(`http://[${value}]/`).hostname.slice(1,-1);
  const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/u.exec(address);
  if (!mapped) return address;
  const first = Number.parseInt(mapped[1],16), second = Number.parseInt(mapped[2],16);
  return `${first >>> 8}.${first & 255}.${second >>> 8}.${second & 255}`;
};
const loopback = (value?: string) => { const address = normalizeAddress(value); return address === '::1' || !!address?.startsWith('127.'); };
interface TrustedProxyRange { version: 4 | 6; network: bigint; mask: bigint }
const addressValue = (address: string): { version: 4 | 6; value: bigint } | undefined => {
  if (isIP(address) === 4) {
    let value = 0n;
    for (const part of address.split('.')) value = value * 256n + BigInt(part);
    return { version: 4, value };
  }
  if (isIP(address) !== 6) return undefined;
  const halves = address.split('::');
  if (halves.length > 2) return undefined;
  const left = halves[0] ? halves[0].split(':') : [], right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if (halves.length === 1 && left.length !== 8) return undefined;
  const missing = 8 - left.length - right.length;
  if (missing < 0) return undefined;
  let value = 0n;
  for (const group of [...left, ...Array<string>(missing).fill('0'), ...right]) {
    if (!/^[a-f0-9]{1,4}$/u.test(group)) return undefined;
    value = value * 65536n + BigInt(Number.parseInt(group, 16));
  }
  return { version: 6, value };
};
// CIDR 項目は許可帯域として解釈する。全域指定（/0）は「誰の転送ヘッダでも信じる」と同義なので不正として扱う。
const parseTrustedProxyRange = (entry: string): TrustedProxyRange | undefined => {
  const slash = entry.indexOf('/');
  if (slash < 0 || entry.indexOf('/', slash + 1) >= 0) return undefined;
  const address = normalizeAddress(entry.slice(0, slash)), prefixText = entry.slice(slash + 1);
  if (!address || !/^\d+$/u.test(prefixText)) return undefined;
  const parsed = addressValue(address);
  if (!parsed) return undefined;
  const bits = parsed.version === 4 ? 32 : 128, prefix = Number(prefixText);
  if (prefix < 1 || prefix > bits) return undefined;
  const mask = ((1n << BigInt(prefix)) - 1n) << BigInt(bits - prefix);
  return { version: parsed.version, network: parsed.value & mask, mask };
};

export function saveFantasyAccountsAtomic(file: string, serialized: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, serialized, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}

function validLedger(value: unknown): value is Ledger {
  if (!plain(value) || value.version !== 1 || !Array.isArray(value.accounts) || !Array.isArray(value.sessions) || !Array.isArray(value.claims)
    || value.accounts.length > 100_000 || value.sessions.length > 100_000 || value.claims.length > 100_000) return false;
  const ids = new Set<string>(), names = new Set<string>(), owners = new Set<string>(), sessions = new Set<string>(), claims = new Set<string>();
  for (const account of value.accounts) {
    if (!plain(account) || typeof account.id !== 'string' || !new RegExp(`^${UUID}(?![\\s\\S])`,'u').test(account.id)
      || typeof account.username !== 'string' || !FANTASY_ACCOUNT_USERNAME.test(account.username) || account.username !== account.username.toLowerCase()
      || typeof account.principal !== 'string' || !PRINCIPAL.test(account.principal)
      || typeof account.salt !== 'string' || !/^[a-f0-9]{32}(?![\s\S])/u.test(account.salt)
      || typeof account.passwordHash !== 'string' || !/^[a-f0-9]{128}(?![\s\S])/u.test(account.passwordHash)
      || typeof account.recoveryHash !== 'string' || !HEX.test(account.recoveryHash)
      || typeof account.createdAt !== 'number' || !Number.isFinite(account.createdAt)
      || ids.has(account.id) || names.has(account.username) || owners.has(account.principal)) return false;
    ids.add(account.id); names.add(account.username); owners.add(account.principal);
  }
  for (const session of value.sessions) {
    if (!plain(session) || typeof session.key !== 'string' || !HEX.test(session.key) || typeof session.account !== 'string' || !ids.has(session.account)
      || typeof session.expiresAt !== 'number' || !Number.isFinite(session.expiresAt) || sessions.has(session.key)) return false;
    sessions.add(session.key);
  }
  for (const claim of value.claims) {
    if (!plain(claim) || typeof claim.key !== 'string' || !HEX.test(claim.key) || typeof claim.principal !== 'string' || !PRINCIPAL.test(claim.principal)
      || typeof claim.expiresAt !== 'number' || !Number.isFinite(claim.expiresAt) || claims.has(claim.key)) return false;
    claims.add(claim.key);
  }
  return true;
}

class AccountFailure extends Error {
  constructor(readonly code: FantasyAccountError, readonly status: number) { super(code); }
}

export class FantasyAccounts {
  readonly file: string;
  loadError: string | null = null;
  private ledger: Ledger = { version: 1, accounts: [], sessions: [], claims: [] };
  private now: () => number;
  private save: NonNullable<FantasyAccountsOptions['save']>;
  private onError: NonNullable<FantasyAccountsOptions['onError']>;
  private options: FantasyAccountsOptions;
  private readonly trustedProxyAddresses: Set<string>;
  private readonly trustedProxyRanges: TrustedProxyRange[];
  private tickets = new Map<string, Ticket>();
  private attempts = new Map<string, { count: number; until: number }>();
  private hashing = 0;

  constructor(options: FantasyAccountsOptions) {
    this.options = options; this.file = options.file; this.now = options.now ?? Date.now;
    this.trustedProxyAddresses = new Set(); this.trustedProxyRanges = [];
    for (const entry of options.trustedProxyAddresses ?? []) {
      const range = entry.includes('/') ? parseTrustedProxyRange(entry) : undefined;
      if (range) { this.trustedProxyRanges.push(range); continue; }
      const address = normalizeAddress(entry);
      if (address !== undefined) this.trustedProxyAddresses.add(address);
    }
    this.save = options.save ?? saveFantasyAccountsAtomic; this.onError = options.onError ?? (() => {});
    try {
      if (fs.existsSync(this.file)) {
        if (fs.statSync(this.file).size > 32 * 1024 * 1024) throw Error('Account ledger exceeds its limit');
        const value: unknown = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (!validLedger(value)) throw Error('Invalid account ledger');
        this.ledger = value;
      }
    } catch { this.loadError = 'unavailable'; this.onError(new Error('World account storage could not be loaded')); }
  }

  private trustedProxy(req: IncomingMessage): boolean {
    const address = normalizeAddress(req.socket.remoteAddress);
    return !!address && (this.trustedProxyAddresses.has(address) || this.trustedProxyRangeMatches(address) || !!this.options.trustProxy && loopback(address));
  }
  private trustedProxyRangeMatches(address: string): boolean {
    if (!this.trustedProxyRanges.length) return false;
    const parsed = addressValue(address);
    return !!parsed && this.trustedProxyRanges.some(range => range.version === parsed.version && (parsed.value & range.mask) === range.network);
  }
  private secure(req: IncomingMessage): boolean {
    return (req.socket as typeof req.socket & { encrypted?: boolean }).encrypted === true
      || this.trustedProxy(req) && req.headers['x-forwarded-proto'] === 'https';
  }
  private transportAllowed(req: IncomingMessage): boolean {
    if (this.secure(req)) return true;
    try { const hostname = new URL(`http://${req.headers.host ?? ''}`).hostname; return loopback(req.socket.remoteAddress) && ['localhost','127.0.0.1','[::1]'].includes(hostname); } catch { return false; }
  }
  private cookieName(req: IncomingMessage): string { return this.secure(req) || this.options.secureCookies ? '__Host-tonarium_fantasy' : 'tonarium_fantasy_session'; }
  private cookie(req: IncomingMessage, res: ServerResponse, value: string, clear = false): void {
    const secure = this.secure(req) || this.options.secureCookies;
    res.setHeader('Set-Cookie', `${this.cookieName(req)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_MS / 1000}${secure ? '; Secure' : ''}`);
  }
  private sessionKey(req: IncomingMessage): string | undefined {
    if (!this.transportAllowed(req)) return undefined;
    const name = this.cookieName(req), matches = (req.headers.cookie ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${name}=`));
    if (matches.length !== 1) return undefined;
    const value = matches[0].slice(name.length + 1);
    return /^[A-Za-z0-9_-]{43}(?![\s\S])/u.test(value) ? hash(value) : undefined;
  }
  readBinding(req: IncomingMessage): AccountBinding | undefined {
    const key = this.sessionKey(req); if (!key || this.loadError) return undefined;
    const session = this.ledger.sessions.find(session => session.key === key && session.expiresAt > this.now());
    const account = session && this.ledger.accounts.find(account => account.id === session.account);
    return account ? { account: publicAccount(account), sessionKey: key } : undefined;
  }
  readSession(req: IncomingMessage): FantasyAccountPublic | undefined { return this.readBinding(req)?.account; }
  getAccountFromRequest(req: IncomingMessage): FantasyAccountPublic | undefined { return this.readSession(req); }
  bindingCurrent(binding: AccountBinding | undefined): boolean {
    if (!binding || this.loadError) return false;
    const session = this.ledger.sessions.find(session => session.key === binding.sessionKey && session.account === binding.account.id && session.expiresAt > this.now());
    const account = session && this.ledger.accounts.find(account => account.id === session.account);
    return !!account && account.principal === binding.account.principal && account.username === binding.account.username;
  }
  isPrincipal(id: string): boolean { return id.startsWith('fantasy:') || this.ledger.accounts.some(account => account.principal === id); }
  accountForPrincipal(principal: string): FantasyAccountPublic | undefined {
    const account = this.ledger.accounts.find(account => account.principal === principal); return account && publicAccount(account);
  }
  private ticket(binding: AccountBinding): string {
    const now = this.now(); for (const [key, ticket] of this.tickets) if (ticket.expiresAt <= now) this.tickets.delete(key);
    if (this.tickets.size >= 10_000) this.tickets.delete(this.tickets.keys().next().value!);
    const value = token(); this.tickets.set(hash(value), { account: binding.account.id, sessionKey: binding.sessionKey, expiresAt: now + TICKET_MS }); return value;
  }
  consumeTicket(value: string): AccountBinding | undefined {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}(?![\s\S])/u.test(value)) return undefined;
    const key = hash(value), ticket = this.tickets.get(key); this.tickets.delete(key);
    if (!ticket || ticket.expiresAt <= this.now()) return undefined;
    const account = this.ledger.accounts.find(account => account.id === ticket.account);
    const binding = account && { account: publicAccount(account), sessionKey: ticket.sessionKey };
    return binding && this.bindingCurrent(binding) ? binding : undefined;
  }
  private persist(next: Ledger): void {
    if (this.loadError) throw new AccountFailure('unavailable',503);
    next.sessions = next.sessions.filter(session => session.expiresAt > this.now()); next.claims = next.claims.filter(claim => claim.expiresAt > this.now());
    try { this.save(this.file, JSON.stringify(next)); this.ledger = next; }
    catch { this.onError(new Error('World account storage could not be saved')); throw new AccountFailure('unavailable',503); }
  }
  /** 接続元。信頼するプロキシからの接続だけ、そのプロキシが X-Forwarded-For の末尾に足したアドレスを使う（先頭は送り手が選べる） */
  clientAddress(req: IncomingMessage): string {
    const forwarded=this.trustedProxy(req)&&typeof req.headers['x-forwarded-for']==='string'?req.headers['x-forwarded-for'].split(',').at(-1)?.trim():undefined;
    return normalizeAddress(forwarded)??normalizeAddress(req.socket.remoteAddress)??'unknown';
  }
  private rate(req: IncomingMessage, action: string, username = ''): void {
    const now=this.now(); for(const [key,value] of this.attempts) if(value.until<=now)this.attempts.delete(key);
    const address=this.clientAddress(req);
    const keys=[`ip:${address}`,`${action}:ip:${address}`,`${action}:username:${username}`];
    for(const [index,key] of keys.entries()){
      const previous=this.attempts.get(key), value=previous&&previous.until>now?previous:{count:0,until:now+15*60_000};
      if(value.count >= (index===0?80:index===1?action==='register'?10:30:10)) throw new AccountFailure('rate-limited',429);
      value.count++;this.attempts.set(key,value);
    }
    if(this.attempts.size>20_000)throw new AccountFailure('rate-limited',429);
  }
  private async passwordHash(password: string, salt: string): Promise<string> {
    if(this.hashing>=2)throw new AccountFailure('rate-limited',429);
    this.hashing++;
    try{return await new Promise<string>((resolve,reject)=>scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:32*1024*1024},(error,key)=>error?reject(error):resolve(key.toString('hex'))));}
    finally{this.hashing--;}
  }
  private async verifyPassword(username: string, password: string): Promise<StoredAccount> {
    const account=this.ledger.accounts.find(account=>account.username===username);
    const computed=await this.passwordHash(password,account?.salt??'00000000000000000000000000000000');
    const current=account&&this.ledger.accounts.find(value=>value.id===account.id);
    if(!account||!current||!equal(computed,account.passwordHash)||current.passwordHash!==account.passwordHash)throw new AccountFailure('invalid-credentials',401);
    return current;
  }
  private finishLogin(req:IncomingMessage,res:ServerResponse,next:Ledger,account:StoredAccount,recoveryCode?:string):FantasyAccountResponse{
    const value=token(),key=hash(value);
    next.sessions=next.sessions.filter(session=>session.account!==account.id);
    next.sessions.push({key,account:account.id,expiresAt:this.now()+SESSION_MS});this.persist(next);
    this.cookie(req,res,value);
    const binding={account:publicAccount(account),sessionKey:key};
    return {account:binding.account,ticket:this.ticket(binding),...(recoveryCode?{recoveryCode}:{})};
  }
  private assertOrigin(req:IncomingMessage):void{
    if(req.headers['sec-fetch-site']==='cross-site')throw new AccountFailure('origin-denied',403);
    const origin=req.headers.origin;
    try{
      if(typeof origin!=='string'||new URL(origin).origin!==`${this.secure(req)?'https':'http'}://${req.headers.host}`)throw Error('origin');
    }catch{throw new AccountFailure('origin-denied',403);}
  }
  private async body(req:IncomingMessage):Promise<Record<string,unknown>>{
    if(!/^application\/json(?:\s*;|$)/iu.test(req.headers['content-type']??''))throw new AccountFailure('invalid',415);
    const length=Number(req.headers['content-length']??0);if(length>2048)throw new AccountFailure('payload-too-large',413);
    return await new Promise((resolve,reject)=>{
      const chunks:Buffer[]=[];let size=0,done=false;
      const timer=setTimeout(()=>{if(!done){done=true;reject(new AccountFailure('invalid',408));}},5000);
      const fail=(error:unknown)=>{if(!done){done=true;clearTimeout(timer);reject(error);}};
      req.on('data',(chunk:Buffer|string)=>{if(done)return;const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>2048){fail(new AccountFailure('payload-too-large',413));return;}chunks.push(bytes);});
      req.on('aborted',()=>fail(new AccountFailure('invalid',400)));req.on('error',()=>fail(new AccountFailure('invalid',400)));
      req.on('end',()=>{if(done)return;done=true;clearTimeout(timer);try{const value:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!plain(value))throw Error('body');resolve(value);}catch{reject(new AccountFailure('invalid',400));}});
    });
  }
  private respond(res:ServerResponse,status:number,value:FantasyAccountResponse):void{
    if(res.destroyed||res.writableEnded)return;
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(value));
  }
  async handleHttp(req:IncomingMessage,res:ServerResponse):Promise<boolean>{
    let pathname:string;try{pathname=new URL(req.url??'/',`http://${req.headers.host??'localhost'}`).pathname;}catch{return false;}
    if(!pathname.startsWith(BASE))return false;
    try{
      if(this.loadError)throw new AccountFailure('unavailable',503);
      if(!this.transportAllowed(req))throw new AccountFailure('secure-connection-required',403);
      const action=pathname.slice(BASE.length);
      if(action==='status'&&req.method==='GET'){
        if(req.headers['sec-fetch-site']==='cross-site')throw new AccountFailure('origin-denied',403);
        const binding=this.readBinding(req);this.respond(res,200,{account:binding?.account??null,...(binding?{ticket:this.ticket(binding)}:{})});return true;
      }
      if(req.method!=='POST'||!['register','login','logout','recover','password','recovery','claim'].includes(action))throw new AccountFailure('invalid',405);
      this.assertOrigin(req);
      const body=await this.body(req),username=typeof body.username==='string'?body.username.toLowerCase():'';
      this.rate(req,action,username);
      let result:FantasyAccountResponse;
      if(action==='register'){
        if(!FANTASY_ACCOUNT_USERNAME.test(username)||!passwordValid(body.password)||Object.keys(body).some(key=>!['username','password'].includes(key)))throw new AccountFailure('invalid',400);
        if(this.ledger.accounts.some(account=>account.username===username))throw new AccountFailure('username-taken',409);
        const salt=randomBytes(16).toString('hex'),passwordHash=await this.passwordHash(body.password,salt);
        if(this.ledger.accounts.some(account=>account.username===username))throw new AccountFailure('username-taken',409);
        const id=randomUUID(),recoveryCode=token(),account={id,principal:`fantasy:${id}`,username,salt,passwordHash,recoveryHash:hash(recoveryCode),createdAt:this.now()};
        const next=structuredClone(this.ledger);next.accounts.push(account);result=this.finishLogin(req,res,next,account,recoveryCode);
      }else if(action==='login'){
        if(!FANTASY_ACCOUNT_USERNAME.test(username)||!passwordValid(body.password)||Object.keys(body).some(key=>!['username','password'].includes(key)))throw new AccountFailure('invalid-credentials',401);
        const account=await this.verifyPassword(username,body.password);result=this.finishLogin(req,res,structuredClone(this.ledger),account);
      }else if(action==='recover'){
        if(!FANTASY_ACCOUNT_USERNAME.test(username)||!passwordValid(body.password)||typeof body.recoveryCode!=='string'||!Object.keys(body).every(key=>['username','password','recoveryCode'].includes(key)))throw new AccountFailure('invalid-credentials',401);
        const account=this.ledger.accounts.find(account=>account.username===username);
        if(!account||!equal(hash(body.recoveryCode),account.recoveryHash))throw new AccountFailure('invalid-credentials',401);
        const salt=randomBytes(16).toString('hex'),passwordHash=await this.passwordHash(body.password,salt),current=this.ledger.accounts.find(value=>value.id===account.id);
        if(!current||current.recoveryHash!==account.recoveryHash)throw new AccountFailure('invalid-credentials',401);
        const recoveryCode=token(),next=structuredClone(this.ledger),updated=next.accounts.find(value=>value.id===account.id)!;
        updated.salt=salt;updated.passwordHash=passwordHash;updated.recoveryHash=hash(recoveryCode);result=this.finishLogin(req,res,next,updated,recoveryCode);
      }else{
        const binding=this.readBinding(req);if(!binding)throw new AccountFailure('unauthenticated',401);
        if(action==='logout'){
          if(Object.keys(body).length)throw new AccountFailure('invalid',400);
          const next=structuredClone(this.ledger);next.sessions=next.sessions.filter(session=>session.key!==binding.sessionKey);this.persist(next);this.cookie(req,res,'',true);result={account:null};
        }else if(action==='claim'){
          if(typeof body.code!=='string'||Object.keys(body).some(key=>key!=='code'))throw new AccountFailure('invalid-claim',400);
          const codeHash=hash(body.code),claim=this.ledger.claims.find(claim=>equal(claim.key,codeHash)&&claim.expiresAt>this.now());
          if(!claim)throw new AccountFailure('invalid-claim',400);
          if(this.ledger.accounts.some(account=>account.principal===claim.principal)||!this.options.canClaimLegacy?.(binding.account,claim.principal))throw new AccountFailure('claim-unavailable',409);
          const next=structuredClone(this.ledger),account=next.accounts.find(account=>account.id===binding.account.id)!;
          account.principal=claim.principal;next.claims=next.claims.filter(value=>value.principal!==claim.principal);result=this.finishLogin(req,res,next,account);
        }else{
          if(!passwordValid(body.password)||Object.keys(body).some(key=>!['password',...(action==='password'?['newPassword']:[])].includes(key)))throw new AccountFailure('invalid',400);
          const account=await this.verifyPassword(binding.account.username,body.password);
          if(!this.bindingCurrent(binding))throw new AccountFailure('unauthenticated',401);
          if(action==='password'){
            if(!passwordValid(body.newPassword))throw new AccountFailure('invalid',400);
            const salt=randomBytes(16).toString('hex'),passwordHash=await this.passwordHash(body.newPassword,salt);
            if(!this.bindingCurrent(binding))throw new AccountFailure('unauthenticated',401);
            const next=structuredClone(this.ledger),updated=next.accounts.find(value=>value.id===account.id)!;
            updated.salt=salt;updated.passwordHash=passwordHash;result=this.finishLogin(req,res,next,updated);
          }else{const recoveryCode=token(),next=structuredClone(this.ledger),updated=next.accounts.find(value=>value.id===account.id)!;updated.recoveryHash=hash(recoveryCode);result=this.finishLogin(req,res,next,updated,recoveryCode);}
        }
      }
      this.respond(res,200,result);
    }catch(error){
      if(error instanceof AccountFailure)this.respond(res,error.status,{account:null,error:error.code});
      else{this.onError(new Error('World account request failed'));this.respond(res,503,{account:null,error:'unavailable'});}
    }
    return true;
  }
  issueLegacyClaim(principal:string):string{
    if(this.loadError)throw new AccountFailure('unavailable',503);
    if(!PRINCIPAL.test(principal)||this.ledger.accounts.some(account=>account.principal===principal))throw new AccountFailure('claim-unavailable',409);
    const code=token(),next=structuredClone(this.ledger);next.claims=next.claims.filter(claim=>claim.principal!==principal);next.claims.push({key:hash(code),principal,expiresAt:this.now()+CLAIM_MS});this.persist(next);return code;
  }
}
