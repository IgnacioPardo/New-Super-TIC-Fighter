// Full application flow with real HTML audio decoding, seeking, looping, and shuffle.
// Instrumentation retains native Audio and Worker behavior; no media is mocked.
import assert from 'node:assert/strict';
import { enterTitle, chooseMode } from './enter-title.mjs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium,firefox,webkit,expect} from '@playwright/test';

const base=process.env.STF_APP_URL??'http://127.0.0.1:8787';
const {audio}=JSON.parse(await readFile(new URL('../public/assets/manifest.json',import.meta.url),'utf8'));
const report=[];
await mkdir('tmp/qa',{recursive:true});
for(const name of (process.env.STF_BROWSERS??'chromium,firefox,webkit').split(',')){
 const browser=await ({chromium,firefox,webkit}[name]).launch({headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[],requests=new Set();
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(request.url().endsWith('.mp3'))requests.add(new URL(request.url()).pathname);});
 await page.addInitScript(()=>{
  // Audio QA must not consume unrelated input from controllers connected to the Mac.
  Object.defineProperty(navigator,'getGamepads',{value:()=>[]});
  const NativeAudio=window.Audio,NativeWorker=window.Worker;
  window.__music=[];
  window.Audio=class extends NativeAudio{constructor(...args){super(...args);window.__music.push(this);}};
  window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',event=>{if(event.data?.type==='snapshot')window.__snapshot=event.data.snapshot;});}};
 });
 const music=()=>page.evaluate(()=>{const a=window.__music.at(-1);return {path:new URL(a.src).pathname,loop:a.loop,paused:a.paused,time:a.currentTime,duration:a.duration,error:a.error?.message};});
 const playing=async()=>{
  await page.waitForFunction(()=>{const a=window.__music.at(-1);return a&&!a.paused&&a.readyState>=2&&a.currentTime>.05;},{},{timeout:20000});
  const state=await music();assert.equal(state.error,undefined);return state;
 };
 const menu=async()=>{const state=await playing();assert.equal(state.path,audio.menu);assert.equal(state.loop,true);};
 try{
  await page.goto(base);
  await page.waitForFunction(()=>window.__music.length>0);
  await enterTitle(page);
  await menu();
  assert.equal(audio.menu,'/assets/audio/original/04.mp3');
  assert.deepEqual([...requests],[audio.menu],'Only menu music loads before a match');
  await page.getByTestId('mode-settings').click();
  await page.locator('.settings-category').first().click();
  const playlist=page.getByRole('button',{name:/^Banda sonora:/});
  await expect(playlist).toContainText(`Remake · ${audio.remake.length} pistas`);
  await playlist.click();await menu();
  await page.evaluate(()=>{const a=window.__music.at(-1);a.currentTime=a.duration-.15;});
  await page.waitForFunction(()=>window.__music.at(-1).currentTime<2);
  await menu();
  await page.keyboard.press('Escape');await page.locator('.back-button').click();
  await page.getByTestId('mode-guide').click();await menu();await page.locator('.back-button').click();
  await chooseMode(page,'online');await menu();await page.locator('.back-button').click();
  await chooseMode(page,'practice');await menu();
  await page.locator('.fight-button').click();
  await page.waitForFunction(()=>window.__snapshot?.phase==='playing');
  const original=await playing();assert(audio.original.includes(original.path));assert.equal(original.loop,false);
  await page.keyboard.press('Escape');await page.locator('.pause-panel').waitFor();await menu();
  await page.locator('.pause-panel').getByRole('button',{name:'AJUSTES',exact:true}).click();
  await page.locator('.settings-category').first().click();
  await page.getByRole('button',{name:/^Banda sonora:/}).click();await page.keyboard.press('Escape');await menu();
  await page.locator('.back-button').click();await menu();
  await page.locator('.pause-panel .primary-button').click();
  await page.waitForFunction(()=>window.__snapshot?.phase==='playing');
  const cycle=[];
  for(let i=0;i<audio.remake.length;i++){
   const track=await playing();assert.equal(track.loop,false);assert(audio.remake.includes(track.path));cycle.push(track.path);
   await page.evaluate(()=>{const a=window.__music.at(-1);a.currentTime=a.duration-.15;});
   await page.waitForFunction(previous=>new URL(window.__music.at(-1).src).pathname!==previous,track.path,{timeout:20000});
  }
  assert.equal(new Set(cycle).size,audio.remake.length,'Every remake track plays once per shuffle cycle');
  assert(cycle.includes('/assets/audio/remake/la-leyenda-del-hada-y-el-mago.mp3'));
  assert.notEqual((await playing()).path,cycle.at(-1),'No immediate repeat across cycles');
  await page.keyboard.press('Escape');await page.locator('.pause-panel').waitFor();await menu();
  await page.locator('.pause-panel .text-button').click();await menu();
  await page.locator('.back-button').click();await menu();
  await page.reload();await page.waitForFunction(()=>window.__music.length>0);await enterTitle(page);await menu();
  assert.deepEqual(errors,[]);
  report.push({browser:name,menu:audio.menu,menuLoop:true,menuIndependentOfPlaylist:true,remakeCycle:cycle,errors});
  console.log(`${name}: title/menu loop, both playlists, pause/settings/resume, all ${cycle.length} remake tracks, natural track advance, and return/reload passed.`);
 }catch(error){await page.screenshot({path:`tmp/qa/audio-${name}-failure.png`});console.log((await page.locator('body').innerText()).slice(-2000));throw error;}
 finally{await browser.close();}
}
await writeFile('tmp/qa/audio-playback.json',JSON.stringify(report,null,2)+'\n');
