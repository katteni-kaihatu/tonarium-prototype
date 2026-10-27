import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { FantasyAccountPublic, FantasyAccountResponse } from '../../../shared/fantasy-account.ts';
import { useLocale } from '../locale.ts';
import { GameLanguageSwitch } from '../LanguageSwitch.tsx';
import { fantasyAccountStatusNeedsBinding, requestFantasyAccount, validFantasyPassword, validFantasyUsername, type FantasyAccountOperation } from './fantasy-account.ts';
import './fantasy-account.css';

const TEXT = {
  ko:{world:'기나긴 여정',title:'여정의 계정',intro:'이 월드에서 이어 갈 삶을 저장하세요.',login:'로그인',register:'계정 만들기',recover:'계정 복구',username:'월드 아이디',usernameHint:'영문·숫자·밑줄 3~24자',password:'비밀번호',passwordHint:'10~128자',confirm:'비밀번호 확인',newPassword:'새 비밀번호',currentPassword:'현재 비밀번호',code:'복구 코드',submitLogin:'여정 이어가기',submitRegister:'계정 만들기',submitRecover:'복구하고 로그인',connecting:'월드 연결을 확인하고 있어요.',binding:'여정을 불러오고 있어요.',offline:'월드에 연결한 뒤 이용할 수 있어요.',retry:'다시 확인',settings:'계정',settingsTitle:'월드 계정',close:'닫기',logout:'로그아웃',changePassword:'비밀번호 바꾸기',changed:'비밀번호를 바꿨어요.',rotateTitle:'복구 코드 새로 만들기',rotateNote:'새 코드를 만들면 이전 코드는 사용할 수 없어요.',rotate:'새 코드 만들기',codeTitle:'복구 코드를 보관해 주세요',codeNote:'이 코드는 다시 표시되지 않아요. 비밀번호를 잊었을 때 필요해요.',copy:'복사',copied:'복사했어요',download:'파일로 보관',saved:'안전한 곳에 보관했어요',continue:'여정으로',claimTitle:'이전 캐릭터 연결',claimNote:'이전 저장에 발급된 연결 코드가 있다면 입력하세요.',claimCode:'캐릭터 연결 코드',claim:'캐릭터 연결',claimed:'이전 캐릭터를 연결했어요.',invalidUsername:'아이디는 영문·숫자·밑줄 3~24자로 입력해 주세요.',invalidPassword:'비밀번호는 10~128자로 입력해 주세요.',mismatch:'비밀번호 확인이 일치하지 않아요.',missingCode:'코드를 입력해 주세요.',errorInvalid:'입력한 내용을 확인해 주세요.',errorCredentials:'아이디·비밀번호 또는 복구 코드를 확인해 주세요.',errorTaken:'이미 사용 중인 아이디예요.',errorRate:'잠시 기다린 뒤 다시 시도해 주세요.',errorExpired:'다시 로그인해 주세요.',errorUnavailable:'지금은 계정을 확인할 수 없어요. 잠시 뒤 다시 시도해 주세요.',errorSecure:'보안 연결로 접속해 주세요.',errorClaim:'이 코드를 연결할 수 없어요. 코드와 현재 캐릭터 상태를 확인해 주세요.',copyFailed:'복사하지 못했어요. 코드를 직접 보관하거나 파일로 내려받아 주세요.'},
  en:{world:'The Long Journey',title:'Your journey account',intro:'Save the life you will continue in this world.',login:'Sign in',register:'Create account',recover:'Recover account',username:'World username',usernameHint:'3–24 Latin letters, numbers or underscores',password:'Password',passwordHint:'10–128 characters',confirm:'Confirm password',newPassword:'New password',currentPassword:'Current password',code:'Recovery code',submitLogin:'Continue your journey',submitRegister:'Create account',submitRecover:'Recover and sign in',connecting:'Checking your world connection.',binding:'Loading your journey.',offline:'Connect to the world to continue.',retry:'Try again',settings:'Account',settingsTitle:'World account',close:'Close',logout:'Sign out',changePassword:'Change password',changed:'Your password has been changed.',rotateTitle:'Replace recovery code',rotateNote:'Creating a new code makes the previous one unusable.',rotate:'Create new code',codeTitle:'Keep your recovery code',codeNote:'This code will not be shown again. You will need it if you forget your password.',copy:'Copy',copied:'Copied',download:'Save as a file',saved:'I have stored it safely',continue:'Continue',claimTitle:'Link an earlier character',claimNote:'Enter the linking code issued for your earlier save, if you have one.',claimCode:'Character linking code',claim:'Link character',claimed:'Your earlier character has been linked.',invalidUsername:'Use 3–24 letters, numbers or underscores for your username.',invalidPassword:'Use a password of 10–128 characters.',mismatch:'The password confirmation does not match.',missingCode:'Enter your code.',errorInvalid:'Check the information you entered.',errorCredentials:'Check your username, password or recovery code.',errorTaken:'That username is already in use.',errorRate:'Please wait a little before trying again.',errorExpired:'Please sign in again.',errorUnavailable:'Your account is unavailable right now. Please try again shortly.',errorSecure:'Please connect using a secure connection.',errorClaim:'This code cannot be linked. Check the code and your current character.',copyFailed:'Copying failed. Keep the code yourself or save it as a file.'},
  ja:{world:'悠久の旅路',title:'旅のアカウント',intro:'この世界で続ける人生を保存しましょう。',login:'ログイン',register:'アカウント作成',recover:'アカウント復旧',username:'ワールドID',usernameHint:'英数字・アンダースコア3～24文字',password:'パスワード',passwordHint:'10～128文字',confirm:'パスワード確認',newPassword:'新しいパスワード',currentPassword:'現在のパスワード',code:'復旧コード',submitLogin:'旅を続ける',submitRegister:'アカウントを作成',submitRecover:'復旧してログイン',connecting:'ワールドへの接続を確認しています。',binding:'旅の記録を読み込んでいます。',offline:'ワールドに接続してから利用できます。',retry:'もう一度確認',settings:'アカウント',settingsTitle:'ワールドアカウント',close:'閉じる',logout:'ログアウト',changePassword:'パスワード変更',changed:'パスワードを変更しました。',rotateTitle:'復旧コードを作り直す',rotateNote:'新しく作ると、以前のコードは使えなくなります。',rotate:'新しいコードを作成',codeTitle:'復旧コードを保管してください',codeNote:'このコードは再表示できません。パスワードを忘れたときに必要です。',copy:'コピー',copied:'コピーしました',download:'ファイルに保存',saved:'安全な場所に保管しました',continue:'旅へ',claimTitle:'以前の人物を引き継ぐ',claimNote:'以前の保存記録に発行された引き継ぎコードがあれば入力してください。',claimCode:'人物の引き継ぎコード',claim:'人物を引き継ぐ',claimed:'以前の人物を引き継ぎました。',invalidUsername:'IDは英数字・アンダースコア3～24文字で入力してください。',invalidPassword:'パスワードは10～128文字で入力してください。',mismatch:'確認用パスワードが一致しません。',missingCode:'コードを入力してください。',errorInvalid:'入力内容を確認してください。',errorCredentials:'ID・パスワードまたは復旧コードを確認してください。',errorTaken:'そのIDは既に使われています。',errorRate:'少し待ってから、もう一度お試しください。',errorExpired:'もう一度ログインしてください。',errorUnavailable:'今はアカウントを確認できません。少し待ってからお試しください。',errorSecure:'安全な接続でアクセスしてください。',errorClaim:'このコードは引き継げません。コードと現在の人物の状態を確認してください。',copyFailed:'コピーできませんでした。コードを控えるか、ファイルに保存してください。'},
};

export interface FantasyAccountGateProps {
  account:FantasyAccountPublic|null;
  connected:boolean;
  ready?:boolean;
  error?:string|null;
  onAuthenticated:(response:FantasyAccountResponse)=>void;
  onLogout:()=>void;
  children:ReactNode;
}

export function FantasyAccountGate({account,connected,ready=true,error:externalError,onAuthenticated,onLogout,children}:FantasyAccountGateProps){
  const [locale]=useLocale(),t=TEXT[locale],id=useId();
  const [mode,setMode]=useState<'login'|'register'|'recover'>('login');
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[recoveryInput,setRecoveryInput]=useState('');
  const [currentPassword,setCurrentPassword]=useState(''),[recoveryPassword,setRecoveryPassword]=useState(''),[newPassword,setNewPassword]=useState(''),[newConfirmation,setNewConfirmation]=useState(''),[claimCode,setClaimCode]=useState('');
  const [checking,setChecking]=useState(connected&&!account),[busy,setBusy]=useState(false),[settings,setSettings]=useState(false),[error,setError]=useState<string|null>(null),[message,setMessage]=useState<string|null>(null);
  const [recoveryCode,setRecoveryCode]=useState<string|null>(null),[codeUsername,setCodeUsername]=useState(''),[saved,setSaved]=useState(false),[copied,setCopied]=useState(false),[waiting,setWaiting]=useState<string|null>(null);
  const callbacks=useRef({onAuthenticated,onLogout});callbacks.current={onAuthenticated,onLogout};
  const accountState=useRef({account,ready});accountState.current={account,ready};
  const currentLocale=useRef(locale);currentLocale.current=locale;
  const controller=useRef<AbortController|null>(null),epoch=useRef(0),busyRef=useRef(false),dialog=useRef<HTMLDialogElement>(null);
  const clearSecrets=()=>{setPassword('');setConfirmation('');setRecoveryInput('');setCurrentPassword('');setRecoveryPassword('');setNewPassword('');setNewConfirmation('');setClaimCode('');};
  const errorText=(code:string)=>{const text=TEXT[currentLocale.current];return ({required:text.errorExpired,'account-required':text.errorExpired,'invalid-ticket':text.errorExpired,invalid:text.errorInvalid,'invalid-credentials':text.errorCredentials,'username-taken':text.errorTaken,'rate-limited':text.errorRate,unauthenticated:text.errorExpired,'secure-connection-required':text.errorSecure,'claim-unavailable':text.errorClaim,'invalid-claim':text.errorClaim,'origin-denied':text.errorSecure,'payload-too-large':text.errorInvalid} as Record<string,string>)[code]??text.errorUnavailable;};
  const applyResponse=(response:FantasyAccountResponse)=>{
    if(response.error){setError(errorText(response.error));if(response.error==='unauthenticated'){setSettings(false);callbacks.current.onLogout();}return false;}
    if(response.account){setWaiting(response.account.id);callbacks.current.onAuthenticated(response);}
    else callbacks.current.onAuthenticated(response);
    if(response.recoveryCode){setRecoveryCode(response.recoveryCode);setCodeUsername(response.account?.username??username);setSaved(false);setCopied(false);setSettings(false);}
    return true;
  };
  const run=async(operation:FantasyAccountOperation,body?:Record<string,string>)=>{
    if(busyRef.current)return false;
    busyRef.current=true;setBusy(true);setError(null);setMessage(null);controller.current?.abort();
    const active=++epoch.current,abort=new AbortController();controller.current=abort;
    const timeout=setTimeout(()=>abort.abort(),15_000);
    try{
      const response=await requestFantasyAccount(operation,body,{signal:abort.signal});
      if(active!==epoch.current)return false;
      if(operation==='logout'&&!response.error){clearSecrets();setSettings(false);setWaiting(null);callbacks.current.onLogout();return true;}
      const ok=applyResponse(response);if(ok)clearSecrets();return ok;
    }catch{if(active===epoch.current)setError(TEXT[currentLocale.current].errorUnavailable);return false;}
    finally{clearTimeout(timeout);if(active===epoch.current){busyRef.current=false;setBusy(false);}}
  };
  const check=async()=>{
    controller.current?.abort();const active=++epoch.current,abort=new AbortController();controller.current=abort;setChecking(true);setError(null);
    const timeout=setTimeout(()=>abort.abort(),15_000);
    try{const response=await requestFantasyAccount('status',undefined,{signal:abort.signal});if(active===epoch.current&&(response.error||!response.account||fantasyAccountStatusNeedsBinding(accountState.current.account,accountState.current.ready,response)))applyResponse(response);}
    catch{if(active===epoch.current)setError(TEXT[currentLocale.current].errorUnavailable);}
    finally{clearTimeout(timeout);if(active===epoch.current)setChecking(false);}
  };
  useEffect(()=>{if(connected){if(accountState.current.account&&accountState.current.ready)setChecking(false);else void check();}else{epoch.current++;controller.current?.abort();busyRef.current=false;setBusy(false);setChecking(false);}return()=>{epoch.current++;controller.current?.abort();};},[connected]);
  useEffect(()=>{setError(null);setMessage(null);},[locale]);
  useEffect(()=>{if(waiting&&(account?.id===waiting||externalError))setWaiting(null);},[account?.id,waiting,externalError]);
  useEffect(()=>{if(settings&&account)dialog.current?.showModal();else dialog.current?.close();},[settings,!!account]);
  useEffect(()=>{if(!account)setSettings(false);},[account?.id]);
  const changeMode=(next:typeof mode)=>{if(busy)return;setMode(next);clearSecrets();setError(null);setMessage(null);};
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(!connected||busy)return;
    if(!validFantasyUsername(username.trim())){setError(t.invalidUsername);return;}
    if(!validFantasyPassword(password)){setError(t.invalidPassword);return;}
    if(mode!=='login'&&password!==confirmation){setError(t.mismatch);return;}
    if(mode==='recover'&&!recoveryInput.trim()){setError(t.missingCode);return;}
    await run(mode,{username:username.trim(),password,...(mode==='recover'?{recoveryCode:recoveryInput.trim()}:{})});
  };
  const changePassword=async(event:FormEvent)=>{
    event.preventDefault();if(!validFantasyPassword(newPassword)||!validFantasyPassword(currentPassword)){setError(t.invalidPassword);return;}
    if(newPassword!==newConfirmation){setError(t.mismatch);return;}
    if(await run('password',{password:currentPassword,newPassword})){setMessage(TEXT[currentLocale.current].changed);setSettings(false);}
  };
  const rotate=async(event:FormEvent)=>{event.preventDefault();if(!validFantasyPassword(recoveryPassword)){setError(t.invalidPassword);return;}await run('recovery',{password:recoveryPassword});};
  const claim=async(event:FormEvent)=>{event.preventDefault();if(!claimCode.trim()){setError(t.missingCode);return;}if(await run('claim',{code:claimCode.trim()})){setMessage(TEXT[currentLocale.current].claimed);setSettings(false);}};
  const copy=async()=>{try{await navigator.clipboard.writeText(recoveryCode!);setCopied(true);}catch{setError(t.copyFailed);}};
  const download=()=>{const file=new Blob([`${t.world}\n${t.username}: ${codeUsername}\n${t.code}: ${recoveryCode}\n`],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=`long-journey-recovery-${codeUsername}.txt`;link.click();setTimeout(()=>URL.revokeObjectURL(url),0);};
  const notice=error??(externalError?errorText(externalError):null);
  const currentField=(value:string,update:(value:string)=>void)=><label>{t.currentPassword}<input type="password" autoComplete="current-password" value={value} minLength={10} maxLength={128} required onChange={event=>update(event.target.value)}/></label>;

  if(recoveryCode)return <section className="fr-account-gate" lang={locale}><div className="fr-account-language"><GameLanguageSwitch/></div><div className="fr-account-card"><span className="fr-account-mark" aria-hidden="true">✦</span><h1>{t.codeTitle}</h1><p>{t.codeNote}</p><strong>{codeUsername}</strong><code className="fr-account-recovery-code">{recoveryCode}</code><div className="fr-account-actions"><button type="button" onClick={()=>void copy()}>{copied?t.copied:t.copy}</button><button type="button" onClick={download}>{t.download}</button></div>{notice&&<p role="alert" className="fr-account-error">{notice}</p>}<label className="fr-account-check"><input type="checkbox" checked={saved} onChange={event=>setSaved(event.target.checked)}/>{t.saved}</label><button type="button" className="fr-account-primary" disabled={!saved} onClick={()=>{setRecoveryCode(null);setError(null);}}>{t.continue}</button></div></section>;
  if(!account||!ready||waiting||!connected)return <section className="fr-account-gate" lang={locale} aria-busy={checking||busy||!!waiting}><div className="fr-account-language"><GameLanguageSwitch/></div><div className="fr-account-card"><span className="fr-account-mark" aria-hidden="true">✦</span><span className="fr-account-world">{t.world}</span><h1>{t.title}</h1><p>{t.intro}</p>{checking||waiting||account&&!ready?<><p role="status">{checking?t.connecting:t.binding}</p>{notice&&<p role="alert" className="fr-account-error">{notice}</p>}{notice&&<button type="button" disabled={!connected||busy} onClick={()=>void check()}>{t.retry}</button>}</>:<><nav aria-label={t.title} className="fr-account-tabs">{(['login','register','recover'] as const).map(value=><button key={value} type="button" aria-pressed={mode===value} disabled={busy} onClick={()=>changeMode(value)}>{t[value]}</button>)}</nav><form onSubmit={event=>void submit(event)}><label htmlFor={`${id}-user`}>{t.username}<input id={`${id}-user`} name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]{3,24}" required onChange={event=>setUsername(event.target.value)}/><small>{t.usernameHint}</small></label>{mode==='recover'&&<label>{t.code}<input autoComplete="off" autoCapitalize="none" spellCheck={false} value={recoveryInput} maxLength={256} required onChange={event=>setRecoveryInput(event.target.value)}/></label>}<label>{mode==='recover'?t.newPassword:t.password}<input type="password" name="password" autoComplete={mode==='login'?'current-password':'new-password'} value={password} minLength={10} maxLength={128} required onChange={event=>setPassword(event.target.value)}/><small>{t.passwordHint}</small></label>{mode!=='login'&&<label>{t.confirm}<input type="password" autoComplete="new-password" value={confirmation} minLength={10} maxLength={128} required onChange={event=>setConfirmation(event.target.value)}/></label>}{notice&&<p role="alert" className="fr-account-error">{notice}</p>}{!connected&&<p role="status">{t.offline}</p>}<button type="submit" className="fr-account-primary" disabled={!connected||busy}>{mode==='login'?t.submitLogin:mode==='register'?t.submitRegister:t.submitRecover}</button></form></>}</div></section>;
  return <><div className="fr-account-session" lang={locale}><button type="button" onClick={()=>{setError(null);setSettings(true);}}>{account.username} · {t.settings}</button>{message&&<span role="status">{message}</span>}</div>{children}{settings&&typeof document!=='undefined'&&createPortal(<dialog ref={dialog} className="fr-account-dialog" aria-labelledby={`${id}-settings`} lang={locale} onCancel={event=>{if(busy)event.preventDefault();else{setSettings(false);clearSecrets();}}} onClose={()=>{setSettings(false);clearSecrets();}}><header><div><small>{account.username}</small><h2 id={`${id}-settings`}>{t.settingsTitle}</h2></div><button type="button" disabled={busy} onClick={()=>{setSettings(false);clearSecrets();}}>{t.close}</button></header>{notice&&<p role="alert" className="fr-account-error">{notice}</p>}<details><summary>{t.changePassword}</summary><form onSubmit={event=>void changePassword(event)}>{currentField(currentPassword,setCurrentPassword)}<label>{t.newPassword}<input type="password" autoComplete="new-password" value={newPassword} minLength={10} maxLength={128} required onChange={event=>setNewPassword(event.target.value)}/></label><label>{t.confirm}<input type="password" autoComplete="new-password" value={newConfirmation} minLength={10} maxLength={128} required onChange={event=>setNewConfirmation(event.target.value)}/></label><button type="submit" disabled={busy}>{t.changePassword}</button></form></details><details><summary>{t.rotateTitle}</summary><p>{t.rotateNote}</p><form onSubmit={event=>void rotate(event)}>{currentField(recoveryPassword,setRecoveryPassword)}<button type="submit" disabled={busy}>{t.rotate}</button></form></details><details><summary>{t.claimTitle}</summary><p>{t.claimNote}</p><form onSubmit={event=>void claim(event)}><label>{t.claimCode}<input autoComplete="off" autoCapitalize="none" spellCheck={false} value={claimCode} maxLength={256} required onChange={event=>setClaimCode(event.target.value)}/></label><button type="submit" disabled={busy}>{t.claim}</button></form></details><footer><button type="button" className="fr-account-logout" disabled={busy} onClick={()=>void run('logout')}>{t.logout}</button></footer></dialog>,document.body)}</>;
}
