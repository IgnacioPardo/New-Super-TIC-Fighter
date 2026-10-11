// Actual pages and services. Bounds and hit testing reject controls covered by a footer,
// another card control or an overflow clip; page scrollHeight alone cannot detect those.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {enterTitle,chooseMode} from './enter-title.mjs';
const base=process.env.STF_APP_URL??'http://127.0.0.1:8791',output='tmp/qa/v2-layout';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true}),report=[];
const viewports=[{width:1366,height:768},{width:1024,height:640},{width:1440,height:1000},{width:390,height:844}].filter(v=>!process.env.STF_LAYOUT_WIDTH||v.width===Number(process.env.STF_LAYOUT_WIDTH));
async function geometry(page,label){
 const result=await page.evaluate(()=>{
  const dialog=document.querySelector('[role=dialog]'),footer=document.querySelector('.app-footer'),header=document.querySelector('.app-header');
  const bottom=dialog?innerHeight-2:footer?.getBoundingClientRect().top??innerHeight,top=dialog?2:header?.getBoundingClientRect().bottom??0;
  const scope=dialog??document.querySelector('main');
  const targets=[...scope.querySelectorAll('button,input,select,textarea,[tabindex="0"],h2,h3,p,.feature-card strong,.discipline-guide dd')].filter(e=>!e.closest('[hidden],[inert]')&&e.getClientRects().length);
  const bad=targets.flatMap(e=>{const r=e.getBoundingClientRect(),text=e.getAttribute('aria-label')??e.textContent?.trim().slice(0,65),reasons=[];
   if(r.left<-.5||r.right>innerWidth+.5||r.top<top-.5||r.bottom>bottom+.5)reasons.push('outside content viewport');
   for(let a=e.parentElement;a&&a!==scope;a=a.parentElement){const s=getComputedStyle(a),c=a.getBoundingClientRect();if(/hidden|clip|auto|scroll/.test(s.overflowY)&&(r.top<c.top-.5||r.bottom>c.bottom+.5))reasons.push('ancestor clip');}
   if(e.matches('button,input,select,textarea'))for(const y of [r.top+Math.min(6,r.height/2),r.bottom-Math.min(6,r.height/2)]){const hit=document.elementFromPoint(r.left+r.width/2,y);if(hit&&!e.contains(hit))reasons.push(`covered by ${hit.tagName}.${hit.className}`);}
   return reasons.length?[{text,reasons,rect:r.toJSON()}]:[];
  });
  return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,scrollY,bad};
 });
 assert.equal(result.scrollY,0,`${label}: page moved`);assert.ok(result.scrollWidth<=result.width&&result.scrollHeight<=result.height,`${label}: page overflow`);assert.deepEqual(result.bad,[],`${label}: invisible or covered controls`);return result;
}
async function inspect(page,label,focus=true){
 await geometry(page,label);await page.mouse.move(5,5);await page.mouse.wheel(0,700);await page.waitForTimeout(80);await geometry(page,`${label} after wheel`);
 let targets=0;
 if(focus){
  const ids=await page.evaluate(()=>{document.querySelectorAll('[data-layout-focus]').forEach(e=>e.removeAttribute('data-layout-focus'));const scope=document.querySelector('[role=dialog]')??document;return [...scope.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href],select:not(:disabled)')].filter(e=>e.tabIndex>=0&&!e.closest('[hidden],[inert]')&&e.getClientRects().length).map((e,i)=>{e.dataset.layoutFocus=String(i);return String(i);});});
  targets=ids.length;const seen=new Set();
  for(let i=0;i<ids.length*2+10&&seen.size<ids.length;i++){const id=await page.evaluate(()=>document.activeElement?.getAttribute('data-layout-focus'));if(id)seen.add(id);await page.keyboard.press('Tab');await geometry(page,`${label} after Tab`);}
  assert.deepEqual(ids.filter(id=>!seen.has(id)),[],`${label}: unreachable keyboard target`);
 }
 await page.screenshot({path:`${output}/${label.replaceAll(/[^\w.-]/g,'_')}.png`});report.push({label,focusTargets:targets});
}
async function pages(page,scope,label){
 await inspect(page,label);
 // Traverse nested tab sets, then every page of each active list. Mounted hidden
 // panels are excluded by actual layout/visibility, never accepted as reachable.
 const tabs=scope.locator(':scope > .content-pages > .config-tabs > [role=tab]');
 const labels=await tabs.allTextContents();
 for(const name of labels){await tabs.nth(labels.indexOf(name)).click();await inspect(page,`${label}-${name}`);
  const panel=scope.locator(':scope > .content-pages > .content-page:visible');
  const nested=panel.locator('.content-pages');if(await nested.count()){
   const sub=nested.first().locator(':scope > .config-tabs > [role=tab]');const subnames=await sub.allTextContents();for(const subname of subnames){await sub.nth(subnames.indexOf(subname)).click();await inspect(page,`${label}-${name}-${subname}`);}
  }
  const next=panel.locator('.content-pager button').last();let i=1;
  while(await next.count()&&await next.isEnabled()){await next.click();await inspect(page,`${label}-${name}-page${++i}`);}
 }
}
try{
 for(const language of (process.env.STF_LAYOUT_LANGUAGES??'es,en').split(','))for(const viewport of viewports){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[],es=language==='es';page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(language=>{Object.defineProperty(navigator,'getGamepads',{value:()=>[]});localStorage.setItem('stf-settings',JSON.stringify({language,reducedMotion:true}));localStorage.setItem('stf-name','Viewport');},language);
  await page.goto(base);await enterTitle(page);const prefix=`${language}-${viewport.width}x${viewport.height}`;
  for(const screen of ['solo','profile','public','tournaments']){
   if(screen==='profile')await page.getByTestId('mode-profile').click();else await chooseMode(page,screen);await page.locator(`.screen-${screen}`).waitFor();
   if(screen==='public')await expect(page.getByRole('button',{name:es?'Buscar combate':'Find a match',exact:true})).toBeEnabled();
   if(screen==='tournaments')await expect(page.getByRole('button',{name:es?'Actualizar lista':'Refresh list',exact:true})).toBeEnabled();
   await pages(page,page.locator('.feature-home'),`${prefix}-${screen}`);
   if(screen==='solo'){await page.getByRole('button',{name:/12.*(Challenges|Desafíos)/}).click();await inspect(page,`${prefix}-challenges-page1`);const next=page.locator('.content-pager button').last();let i=1;while(await next.isEnabled()){await next.click();await inspect(page,`${prefix}-challenges-page${++i}`);}assert.equal(await page.locator('.challenge-grid .feature-card').count(),viewport.width<=760?2:4);}
   await page.locator('.brand-button').click();
  }
  await chooseMode(page,'local');await inspect(page,`${prefix}-setup`);
  const cards=page.locator('.fighter-summary:visible');for(let i=0;i<await cards.count();i++)await cards.nth(i).locator('.fighter-edit').click();
  for(const name of await cards.first().getByRole('tab').allTextContents()){for(let i=0;i<await cards.count();i++)await cards.nth(i).getByRole('tab',{name,exact:true}).click();await inspect(page,`${prefix}-setup-${name}`);
   if((es?name==='Aspecto':name==='Appearance')&&viewport.height<=720&&viewport.width>760){for(const button of await page.locator('.inline-fighter-editor .content-pager.compact button:last-child').all())await button.click();await inspect(page,`${prefix}-setup-appearance-page2`);}
  }
  await page.locator('.match-summary').click();const dialog=page.getByRole('dialog');await pages(page,dialog,`${prefix}-rules`);await dialog.locator('.config-dialog-heading button').click();
  assert.deepEqual(errors,[]);await context.close();console.log(`${prefix}: current pages, actual bounds/hit targets, wheel and keyboard passed.`);
 }
 await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));
}catch(error){await writeFile(`${output}/failure.txt`,String(error));for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:`${output}/failure.png`});throw error;}finally{await browser.close();}
