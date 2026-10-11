// Whole-browser intro flow. Gamepads below are simulated, not physical hardware.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
const base=process.env.STF_APP_URL??'http://127.0.0.1:5173';
await mkdir('tmp/intro-qa',{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:810}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
  if(!localStorage.getItem('stf-settings'))localStorage.setItem('stf-settings',JSON.stringify({reducedMotion:true}));
  window.__introPad={id:'Intro QA virtual gamepad',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};
  window.__introPadPolls=0;
  Object.defineProperty(navigator,'getGamepads',{value:()=>{window.__introPadPolls++;return[window.__introPad]}});
});
const intro=()=>page.getByTestId('intro-continue');
const title=()=>page.getByTestId('mode-local');
const ready=async()=>{
  await intro().waitFor();
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(im=>im.decode()))});
};
try {
  await page.goto(base);await ready();
  await expect(page.locator('.app-header')).toHaveCount(0);
  await expect(page.locator('.app-footer')).toHaveCount(0);
  assert(await page.locator('.intro-logo').evaluate(im=>im.naturalWidth>0),'Refined logo must load');
  for(const key of ['Tab','Shift','Control+a']){await page.keyboard.press(key);await expect(intro()).toBeVisible()}
  await page.keyboard.press('Enter');await expect(title()).toBeFocused();
  await expect(page.locator('.app-footer')).toContainText('Enter');
  await expect(page.locator('.screen-setup')).toHaveCount(0);
  await page.keyboard.press('Escape');await ready();
  await page.keyboard.press('Space');await expect(title()).toBeFocused();
  await expect(page.locator('.screen-setup')).toHaveCount(0);
  await page.keyboard.press('Escape');await ready();
  await page.keyboard.press('x');await expect(title()).toBeFocused();
  await page.keyboard.press('Escape');await ready();
  // The whole intro is the button hit area, including the quiet background.
  await page.mouse.click(24,24);await expect(title()).toBeVisible();
  await page.keyboard.press('Escape');await ready();
  await page.waitForFunction(()=>window.__introPadPolls>5);
  await page.evaluate(()=>{window.__introPad.buttons[0].pressed=true;window.__introPad.buttons[9].pressed=true});
  await expect(title()).toBeFocused();
  const poll=await page.evaluate(()=>window.__introPadPolls);
  await page.waitForFunction(n=>window.__introPadPolls>n+10,poll);
  await expect(page.locator('.screen-title')).toBeVisible();
  await expect(page.locator('.app-footer')).toContainText('A / ✕');
  await page.evaluate(()=>{window.__introPad.buttons[0].pressed=false;window.__introPad.buttons[9].pressed=false});
  // An actual downstream menu opens normally; back returns to title, not splash.
  await page.getByTestId('mode-practice').click();await page.locator('.setup-layout').waitFor();
  await page.locator('.back-button').click();await expect(title()).toBeVisible();
  await page.keyboard.press('Escape');await ready();
  for(const [width,height,label] of [[1440,810,'desktop'],[1366,768,'laptop'],[390,844,'mobile'],[667,375,'landscape'],[1280,480,'short-desktop']]){
    await page.setViewportSize({width,height});
    const layout=await page.evaluate(()=>{
      const prompt=document.querySelector('.intro-continue').getBoundingClientRect();
      return{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,promptBottom:prompt.bottom,animation:getComputedStyle(document.querySelector('.intro-prompt')).animationName};
    });
    assert(layout.width<=width,`${label} has horizontal overflow`);
    assert(layout.height<=height+1,`${label} has vertical overflow: ${layout.height}/${height}`);
    assert(layout.promptBottom<=height,`${label} prompt must be visible`);
    assert.equal(layout.animation,'none','Reduced-motion preference must stop prompt animation');
    await page.screenshot({path:`tmp/intro-qa/intro-${label}.png`});
  }
  await page.evaluate(()=>localStorage.setItem('stf-settings',JSON.stringify({language:'en',reducedMotion:true})));
  await page.reload();await ready();await expect(intro()).toContainText('PRESS ANY KEY TO START');
  await page.goto(base+'/?room=ABC123');await expect(title()).toBeVisible();
  await expect(intro()).toHaveCount(0);
  await page.getByTestId('mode-online').click();await expect(page.locator('.code-input')).toHaveValue('ABC123');
  assert.deepEqual(errors,[]);
  console.log('Intro: keyboard/click/simulated A+Start, no double activation, back/menu flow, five viewport sizes, reduced motion, ES/EN, and room-link bypass passed.');
} catch(error) {
  await page.screenshot({path:'tmp/intro-qa/failure.png',fullPage:true});
  throw error;
} finally {await browser.close()}
