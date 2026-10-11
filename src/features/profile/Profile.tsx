import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Language } from '../../shared/types';
import { authClient } from './auth-client';
import { COSMETICS, cosmeticXP, loadProgress, mergeProgress, saveProgress } from './progress';
import type { LocalProgress } from './progress';
import '../features.css';
import { ContentTabs, PagedContent, usePageSize } from '../../ui/ContentPages';

interface ProfileData { userId: string; handle: string; cosmetic: string; local: LocalProgress; verified: { matches: number; wins: number; xp: number } }
interface AuthConfig { enabled: boolean; google: boolean; github: boolean; passkey: boolean }
export function Profile({ language }: { language: Language }) {
 const es = language === 'es';
 const [config,setConfig] = useState<AuthConfig>({ enabled:false,google:false,github:false,passkey:false });
 const [profile,setProfile] = useState<ProfileData|null>(null);
 const [local,setLocal] = useState(loadProgress());
 const [handle,setHandle] = useState(localStorage.getItem('stf-name') ?? '');
 const [cosmetic,setCosmetic] = useState(localStorage.getItem('stf-cosmetic') ?? 'original');
 const [passkeys,setPasskeys] = useState<{ id:string;name?:string }[]>([]);
 const [providers,setProviders] = useState<string[]>([]);
 const [busy,setBusy] = useState(false), [message,setMessage] = useState(()=>{
  const error=new URLSearchParams(location.search).get('error');
  if(!error)return '';
  if(error==='account_not_linked')return es?'Entra con tu método habitual y vincula esta cuenta desde Cuenta → Acceso.':'Sign in with your usual method, then link this account from Account → Access.';
  if(error==='access_denied')return es?'Acceso cancelado. Puedes seguir jugando o volver a intentarlo.':'Sign-in cancelled. You can keep playing or try again.';
  return es?'No se pudo conectar la cuenta. Puedes volver a intentarlo; tu progreso sigue guardado.':'The account could not be connected. You can retry; your progress is still saved.';
 });
 useEffect(()=>{const url=new URL(location.href);if(url.searchParams.has('error')){url.searchParams.delete('error');url.searchParams.delete('error_description');history.replaceState(history.state,'',url);}},[]);
 const refresh = useCallback(async () => {
  const configured = await fetch('/api/auth-config').then(r => {if(!r.ok)throw Error('offline');return r.json();}); setConfig(configured);
  if (!configured.enabled) return;
  const response = await fetch('/api/profile');
  if (response.status === 401) {
   const guest=loadProgress(),saved=localStorage.getItem('stf-guest-cosmetic')??localStorage.getItem('stf-cosmetic');
   const style=COSMETICS.find(item=>item.id===saved&&item.xp<=cosmeticXP(guest))?.id??'original';
   localStorage.removeItem('stf-active-profile');localStorage.setItem('stf-cosmetic',style);
   setProfile(null);setLocal(guest);setHandle(localStorage.getItem('stf-name')??'');setCosmetic(style);setProviders([]);setPasskeys([]);
   window.dispatchEvent(new Event('stf-profile'));return;
  }
  if (!response.ok) throw Error('offline');
  const next:ProfileData = await response.json(); setProfile(next);const merged=mergeProgress(next.local,loadProgress(next.userId));setLocal(merged);setHandle(next.handle);setCosmetic(next.cosmetic);
  if(!localStorage.getItem('stf-active-profile'))localStorage.setItem('stf-guest-cosmetic',localStorage.getItem('stf-cosmetic')??'original');
  saveProgress(merged,next.userId);localStorage.setItem('stf-active-profile',next.userId);localStorage.setItem('stf-cosmetic',next.cosmetic);window.dispatchEvent(new Event('stf-profile'));
  const [keys,accounts] = await Promise.all([authClient.passkey.listUserPasskeys(),authClient.listAccounts()]);
  setPasskeys(keys.data ?? []);setProviders(accounts.data?.map(a=>a.providerId) ?? []);
  if(JSON.stringify(merged)!==JSON.stringify(next.local)){const saved=await fetch('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({local:merged})});if(!saved.ok)throw Error('sync');}
 },[]);
 useEffect(()=>{let mounted=true;void refresh().catch(()=>{if(mounted)setMessage(es?'El perfil online no está disponible. Tu progreso local está guardado.':'Online profile is unavailable. Your local progress is saved.');});return()=>{mounted=false;};},[refresh]);
 const act=async(task:()=>Promise<unknown>)=>{setBusy(true);setMessage('');try{await task();await refresh();}catch{setMessage(es?'No se completó la operación. Puedes volver a intentarlo; tu progreso sigue guardado.':'The operation did not finish. You can retry; your progress is still saved.');}finally{setBusy(false);}};
 const oauth=(provider:'google'|'github',link=false)=>act(async()=>{
  const options={provider,callbackURL:`${location.origin}/?screen=profile`,errorCallbackURL:`${location.origin}/?screen=profile`};
  const result=link?await authClient.linkSocial(options):await authClient.signIn.social(options);
  if(result.error)throw Error(result.error.message);
 });
 const persist=async(progress=local)=>{
  if(!handle.trim())return;
  if(profile){const result=await fetch('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle,cosmetic,local:progress})});if(!result.ok)throw Error('profile');}
  else {localStorage.setItem('stf-name',handle.trim());localStorage.setItem('stf-cosmetic',cosmetic);localStorage.setItem('stf-guest-cosmetic',cosmetic);saveProgress(progress);}
  window.dispatchEvent(new Event('stf-profile'));setMessage(es?'Perfil guardado.':'Profile saved.');
 };
 const pageSize=usePageSize(4,3);
 const xp=cosmeticXP(local,profile?.verified.xp ?? 0);
 return <div className="feature-home profile-home" data-menu-linear>
  <ContentTabs label={es?'Perfil':'Profile'} pages={[
   {id:'identity',label:es?'Perfil':'Profile',content:(<>  <section className="feature-panel" style={{'--config-accent':'#a0e769'} as CSSProperties}>
   <header className="feature-heading"><span className="feature-number">P1</span><div><h2>{profile?profile.handle:es?'Perfil local':'Local profile'}</h2><p>{profile?(es?'Progreso sincronizado · Invitados del sofá por separado':'Synced progress · Couch guests remain separate'):(es?'Juega sin cuenta. Tu progreso queda en este navegador.':'Play without an account. Progress stays in this browser.')}</p></div><b>{xp} XP</b></header>
   <div className="feature-body">
    <label className="config-row name-row"><span>{es?'Nombre público':'Public name'}</span><input value={handle} maxLength={24} onChange={e=>setHandle(e.target.value)} aria-label={es?'Nombre público':'Public name'} placeholder={es?'Jugador':'Player'} data-keyboard-required autoComplete="nickname"/></label>
    <div className="feature-stats"><span><strong>{local.completedChallenges.length}/12</strong>{es?'Desafíos':'Challenges'}</span><span><strong>{local.arcadeClears}</strong>Arcade</span><span><strong>{local.survivalBest}</strong>{es?'Mejor oleada':'Best wave'}</span></div>
    <button className="primary-button" disabled={busy||!handle.trim()} onClick={()=>void act(()=>persist())}>{es?'Guardar perfil':'Save profile'}</button>
   </div>
  </section>
</>)},
   {id:'styles',label:es?'Aspectos':'Styles',content:(<><section className="feature-panel"><header className="feature-heading"><div><h2>{es?'Aspectos':'Styles'}</h2><p>{es?'Solo cosméticos · Todos los luchadores están disponibles.':'Cosmetic only · Every fighter is available.'}</p></div><b>{xp} XP</b></header><div className="feature-body">    <h3>{es?'Aspectos · Solo cosméticos':'Styles · Cosmetic only'}</h3>
    <div className="cosmetic-options">{COSMETICS.map(item=><button key={item.id} className={cosmetic===item.id?'selected':''} disabled={busy||xp<item.xp} aria-pressed={cosmetic===item.id} style={{'--config-accent':item.color} as CSSProperties} onClick={()=>setCosmetic(item.id)}><i style={{background:item.color}}/><strong>{item[language]}</strong><small>{xp<item.xp?`${item.xp} XP`:es?'Disponible':'Available'}</small></button>)}</div>
    <button className="primary-button" disabled={busy||!handle.trim()} onClick={()=>void act(()=>persist())}>{es?'Guardar perfil':'Save profile'}</button>
   </div>
  </section>
</>)},
   {id:'account',label:es?'Cuenta':'Account',content:(<>  <section className="feature-panel" style={{'--config-accent':'#57d4f1'} as CSSProperties}>
   <header className="feature-heading"><div><h2>{es?'Cuenta y sincronización':'Account and sync'}</h2><p>{es?'Todos los luchadores están disponibles sin cuenta.':'Every fighter is available without an account.'}</p></div></header>
   <div className="feature-body">
    {!config.enabled&&<p className="config-note">{es?'La cuenta online aún no está disponible. Puedes jugar como invitado.':'Online accounts are not available yet. You can play as a guest.'}</p>}
    {profile?<ContentTabs label={es?'Cuenta y sincronización':'Account and sync'} pages={[
     {id:'links',label:es?'Acceso':'Access',content:(<>    <div className="feature-actions">{(['google','github'] as const).map(provider=><button key={provider} disabled={busy||!config[provider]||providers.includes(provider)} onClick={()=>void oauth(provider,!!profile)}>{providers.includes(provider)?(es?'Vinculado':'Linked'):profile?(es?'Vincular':'Link'):(es?'Entrar con':'Continue with')} {provider==='google'?'Google':'GitHub'}</button>)}
    {!profile&&<button disabled={busy||!config.passkey} onClick={()=>void act(async()=>{const r=await authClient.signIn.passkey();if(r.error)throw Error(r.error.message);})}>{es?'Entrar con passkey':'Sign in with passkey'}</button>}</div>
<div className="feature-actions">
     <button disabled={busy||!providers.length} onClick={()=>void act(async()=>{const r=await authClient.passkey.addPasskey({name:'Super TIC Fighter'});if(r.error)throw Error(r.error.message);})}>{es?'Añadir passkey':'Add passkey'}</button>
     <button disabled={busy} onClick={()=>void act(async()=>{const result=await authClient.signOut();if(result.error)throw Error(result.error.message);})}>{es?'Cerrar sesión':'Sign out'}</button></div>
    <p className="config-note">{es?'Las passkeys requieren una cuenta vinculada. Conserva Google o GitHub para recuperar el acceso.':'Enroll a passkey after linking an account. Keep Google or GitHub linked for recovery.'}</p></>)},
     {id:'progress',label:es?'Progreso online':'Online progress',content:(<><div className="feature-stats"><span><strong>{profile.verified.matches}</strong>{es?'Partidas verificadas':'Verified matches'}</span><span><strong>{profile.verified.wins}</strong>{es?'Victorias online':'Online wins'}</span><span><strong>{profile.verified.xp}</strong>XP online</span></div>
     <p className="config-note">{es?'Las partidas locales y de práctica no cuentan como victorias online.':'Local and practice matches do not count as online wins.'}</p>
     <div className="feature-actions"><button disabled={busy} onClick={()=>void act(async()=>{const progress=mergeProgress(local,loadProgress());await persist(progress);})}>{es?'Incorporar progreso de invitado':'Import guest progress'}</button></div></>)}
    ]}/>:<>    <div className="feature-actions">{(['google','github'] as const).map(provider=><button key={provider} disabled={busy||!config[provider]||providers.includes(provider)} onClick={()=>void oauth(provider,!!profile)}>{providers.includes(provider)?(es?'Vinculado':'Linked'):profile?(es?'Vincular':'Link'):(es?'Entrar con':'Continue with')} {provider==='google'?'Google':'GitHub'}</button>)}
    {!profile&&<button disabled={busy||!config.passkey} onClick={()=>void act(async()=>{const r=await authClient.signIn.passkey();if(r.error)throw Error(r.error.message);})}>{es?'Entrar con passkey':'Sign in with passkey'}</button>}</div>
    <p className="config-note">{es?'Las passkeys requieren una cuenta vinculada. Conserva Google o GitHub para recuperar el acceso.':'Enroll a passkey after linking an account. Keep Google or GitHub linked for recovery.'}</p></>}

   </div>
  </section>
</>)}
   ,...(profile?[{id:'security',label:es?'Passkeys':'Passkeys',content:(<section className="feature-panel"><header className="feature-heading"><div><h2>Passkeys</h2><p>{es?'Administra las claves de acceso de tu cuenta.':'Manage your account’s access keys.'}</p></div></header><div className="feature-body">     {passkeys.length>0&&<PagedContent size={pageSize} language={language} label="Passkeys" className="feature-list">{passkeys.map(key=><li key={key.id}><span>{key.name||'Passkey'}</span><button disabled={busy||!providers.length} onClick={()=>void act(async()=>{const r=await authClient.passkey.deletePasskey({id:key.id});if(r.error)throw Error(r.error.message);})}>{es?'Quitar':'Remove'}</button></li>)}</PagedContent>}
{!passkeys.length&&<p className="config-note">{es?'Aún no has añadido una passkey.':'You have not added a passkey yet.'}</p>}<p className="config-note">{es?'Conserva Google o GitHub para recuperar el acceso.':'Keep Google or GitHub linked for recovery.'}</p></div></section>)}]:[])
  ]}/>
  {message&&<p className="feature-status" role="status">{message}</p>}
 </div>;
}
