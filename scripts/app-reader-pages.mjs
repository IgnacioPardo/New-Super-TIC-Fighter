// Real rendered configuration/guide flow. Controller events are injected; no physical pad claim.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium,firefox,webkit,expect} from '@playwright/test';
import {enterTitle} from './enter-title.mjs';
const base=process.env.STF_APP_URL??'http://127.0.0.1:5197',language=process.env.STF_LANGUAGE??'en',es=language==='es';
await mkdir('tmp/qa',{recursive:true});
for(const engine of (process.env.STF_BROWSERS??'chromium').split(',')){
 const browser=await({chromium,firefox,webkit}[engine]).launch({headless:true});
 try{for(const viewport of [{width:1366,height:768},{width:1024,height:640},{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(language=>{localStorage.setItem('stf-settings',JSON.stringify({language,reducedMotion:true}));window.__pad={id:'Reader QA virtual controller',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[window.__pad]});},language);
  const pad=async button=>{await page.evaluate(index=>window.__pad.buttons[index].pressed=true,button);await page.waitForTimeout(80);await page.evaluate(index=>window.__pad.buttons[index].pressed=false,button);await page.waitForTimeout(60)};
  const fit=async label=>{const overflowing=await page.evaluate(()=>{const scope=document.querySelector('[data-menu-dialog]')??document.querySelector('main');return [...scope.querySelectorAll('button,input,article,h2,h3,p,kbd,.controller-status')].filter(el=>el.getClientRects().length&&!el.closest('[hidden],[inert]')).map(el=>({label:el.textContent?.slice(0,80),...Object.fromEntries(['top','right','bottom','left'].map(key=>[key,el.getBoundingClientRect()[key]]))})).filter(r=>r.top< -1||r.bottom>innerHeight+1||r.left< -1||r.right>innerWidth+1)});assert.deepEqual(overflowing,[],`${engine} ${viewport.width}x${viewport.height} ${label}`);assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight+1),false,label+' document scroll');};
  const next=()=>page.getByRole('button',{name:/^(Next page|Página siguiente)/});
  await page.goto(base);await enterTitle(page);await page.getByTestId('mode-settings').click();await fit('Settings categories');await page.screenshot({path:`tmp/qa/${engine}-settings-${language}-${viewport.width}.png`});
  for(let section=0;section<4;section++){
   await page.locator('.settings-category').nth(section).click();await fit('Settings editor '+section);
   if(section===0){await page.getByRole('slider',{name:es?'Música':'Music',exact:true}).fill('0.2');await expect(page.getByRole('slider',{name:es?'Música':'Music',exact:true})).toHaveValue('0.2')}
   if(section===2){const actions=new Set();for(let p=0;p<3;p++){for(const label of await page.locator('.binding-button > span').allTextContents())actions.add(label);await fit('Keyboard page '+p);if(p<2)await next().click()}assert.equal(actions.size,9);await page.locator('.binding-button').first().click();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(1);await expect(page.locator('.capturing')).toHaveCount(0);await page.locator('.binding-button').last().click();await pad(1);await expect(page.getByRole('dialog')).toHaveCount(1);await expect(page.locator('.capturing')).toHaveCount(0);await page.getByRole('button',{name:es?'Restaurar teclas':'Reset keys'}).click()}
   if(section===3){const choices=new Set();for(let p=0;p<3;p++){for(const label of await page.locator('.choice-main').evaluateAll(els=>els.map(el=>el.getAttribute('aria-label'))))if(label)choices.add(label.split(':')[0]);await fit('Gamepad page '+p);if(p<2)await next().click()}assert.equal(choices.size,7);await expect(page.locator('.controller-status')).toContainText('Reader QA');await pad(1)}else await page.keyboard.press('Escape');
   await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.settings-category').nth(section)).toBeFocused();
  }
  await page.getByTestId('mode-guide').click();const tabNames=await page.getByRole('tab').allTextContents(),read=new Set();
  for(const tabName of tabNames){await page.getByRole('tab',{name:tabName,exact:true}).click();let pageIndex=0;while(true){await fit('Guide '+tabName+' '+pageIndex);if(tabName===(es?'Disciplinas':'Disciplines')&&pageIndex===0)await page.screenshot({path:`tmp/qa/${engine}-guide-disciplines-${language}-${viewport.width}.png`});for(const label of await page.locator('[role=tabpanel]:visible .discipline-guide h2').allTextContents())read.add(label);const onward=page.locator('[role=tabpanel]:visible').getByRole('button',{name:/^(Next page|Página siguiente)/});if(!(await onward.isEnabled()))break;await onward.click();pageIndex++}}
  assert.equal(read.size,10,'All disciplines are reachable');await page.screenshot({path:`tmp/qa/${engine}-reader-${viewport.width}.png`});
  await page.getByRole('tab',{name:es?'Combate':'Combat',exact:true}).click();await pad(13);await pad(13);await expect(page.getByRole('button',{name:es?'Página anterior · Combate':'Previous page · Combat',exact:true})).toBeFocused();await pad(0);await expect(page.locator('[role=tabpanel]:visible .content-pager span')).toHaveText('2 / 3');await page.getByRole('tab',{name:es?'Combate':'Combat',exact:true}).focus();await pad(15);await expect(page.getByRole('tab',{name:es?'Disciplinas':'Disciplines',exact:true})).toBeFocused();await pad(1);await expect(page.locator('.settings-category')).toHaveCount(4);
  await page.locator('.settings-category').first().click();await expect(page.getByRole('slider',{name:es?'Música':'Music',exact:true})).toHaveValue('0.2');await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);console.log(`${engine} ${viewport.width}x${viewport.height}: all Settings/Guide pages fit, nine keys/seven pad bindings/ten disciplines reachable, capture Esc/B cancels, focus restored, preferences retained.`);await page.close();
 }}finally{await browser.close()}
}
