// Complete screen navigation and actual worker Royale screenshots on an isolated service.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {enterTitle} from './enter-title.mjs';
const base=process.env.STF_APP_URL??'http://127.0.0.1:8790',output='tmp/qa/v2-layout';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true}),report=[];
const viewports=[{width:1366,height:768},{width:1024,height:640},{width:1440,height:1000},{width:390,height:844}].filter(viewport=>!process.env.STF_LAYOUT_WIDTH||viewport.width===Number(process.env.STF_LAYOUT_WIDTH));
async function inspect(page,label,focus=true){
 const geometry=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('.feature-home button,.feature-home input,.feature-home h2,.feature-home h3,.feature-home p,.feature-home strong,.page-heading,.app-footer>*')].filter(element=>{const box=element.getBoundingClientRect();return box.width&&box.height&&(box.left<-.5||box.right>innerWidth+.5);}).map(element=>({text:element.textContent?.trim().slice(0,70),left:Math.round(element.getBoundingClientRect().left),right:Math.round(element.getBoundingClientRect().right)}))}));
 await page.screenshot({path:`${output}/${label}.png`,fullPage:true});
 assert.ok(geometry.scrollWidth<=geometry.width,`${label}: page horizontal overflow`);assert.deepEqual(geometry.overflow,[],`${label}: clipped content`);
 let targets=0;
 if(focus){
  const ids=await page.evaluate(()=>[...document.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href],select:not(:disabled)')].filter(element=>element.tabIndex>=0&&element.getClientRects().length&&getComputedStyle(element).visibility!=='hidden').map((element,index)=>{element.dataset.layoutFocus=String(index);return String(index);}));
  targets=ids.length;const seen=new Set();
  for(let index=0;index<ids.length*2+20&&seen.size<ids.length;index++){
   const current=await page.evaluate(()=>{const active=document.activeElement,box=active?.getBoundingClientRect();return {id:active?.getAttribute('data-layout-focus'),visible:!!box&&box.bottom>0&&box.top<innerHeight&&box.right>0&&box.left<innerWidth};});
   if(current.id){assert.equal(current.visible,true,`${label}: keyboard focus scrolled outside viewport`);seen.add(current.id);}
   await page.keyboard.press('Tab');
  }
  assert.deepEqual(ids.filter(id=>!seen.has(id)),[],`${label}: unreachable keyboard targets`);
 }
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${output}/${label}.png`,fullPage:true});
 report.push({label,width:geometry.width,focusTargets:targets});
}
try {
 for(const language of (process.env.STF_LAYOUT_LANGUAGES??'es,en').split(','))for(const viewport of viewports){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(language=>{Object.defineProperty(navigator,'getGamepads',{value:()=>[]});localStorage.setItem('stf-settings',JSON.stringify({language,reducedMotion:true}));localStorage.setItem('stf-name',language==='es'?'Invitado':'Guest');},language);
  await page.goto(base);await enterTitle(page);
  for(const screen of ['solo','profile','public','tournaments']){
   await page.getByTestId(`mode-${screen}`).click();await expect(page.locator(`.screen-${screen}`)).toBeVisible();
   if(screen==='public')await expect(page.locator('.feature-panel')).toHaveCount(3);
   if(screen==='tournaments')await expect(page.getByRole('button',{name:language==='es'?'Actualizar lista':'Refresh list',exact:true})).toBeEnabled();
   await page.waitForTimeout(180);await inspect(page,`${language}-${viewport.width}x${viewport.height}-${screen}`);
   await page.locator('.brand-button').click();await expect(page.locator('.screen-title')).toBeVisible();
  }
  assert.deepEqual(errors,[]);await context.close();
  const matchContext=await browser.newContext({viewport}),match=await matchContext.newPage();
  await match.addInitScript(language=>{
   Object.defineProperty(navigator,'getGamepads',{value:()=>[]});localStorage.setItem('stf-settings',JSON.stringify({language,reducedMotion:true}));
   localStorage.setItem('stf-match',JSON.stringify({ruleset:'expanded',gameMode:'royale',bestOf:1,lives:1,players:Array.from({length:8},(_,index)=>({id:`p${index+1}`,name:index===0?(language==='es'?'Local 1':'Local 1'):`${language==='es'?'Rival':'Opponent'} ${index+1}`,discipline:['networks','design','code','hardware','ai','robotics','iot','vr'][index],appearance:{hair:index%4,shirt:index%4,pants:index%4},team:index%2,kind:index===0?'human':'bot',difficulty:'easy',device:index===0?'keyboard:0':'bot'}))}));
   const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',event=>{if(event.data?.type==='snapshot')window.__snapshot=event.data.snapshot;});}};
  },language);
  await match.goto(base);await enterTitle(match);await match.getByTestId('mode-local').click();await match.locator('.ready-button:not(:disabled)').click();await match.locator('.fight-button').click();await match.waitForFunction(()=>window.__snapshot?.phase==='playing'&&window.__snapshot.config.players.length===8);
  const objective=await match.locator('.objective-status').boundingBox();assert.ok(objective&&objective.y>=60&&objective.y+objective.height<=110,'Royale objective should remain visible below header within renderer reservation');
  await expect(match.locator('.hud-opponent')).toHaveCount(7);await expect(match.locator('.royale-local-roster .hud-fighter')).toHaveCount(1);
  const hud=await match.locator('.royale-hud').boundingBox();if(viewport.width>760)assert.ok(hud.height<=180);
  await match.locator('.match-topbar button').focus();await expect(match.locator('.match-topbar button')).toBeFocused();await inspect(match,`${language}-${viewport.width}x${viewport.height}-royale`,false);
  await matchContext.close();console.log(`${language} ${viewport.width}×${viewport.height}: Solo/Profile/Public/Tournaments keyboard reachability and eight-fighter Royale layouts passed.`);
 }
 await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));
} finally {await browser.close();}
