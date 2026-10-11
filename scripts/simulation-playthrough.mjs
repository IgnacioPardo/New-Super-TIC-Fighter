// Integrated match playthrough: deterministic authority, checkpoint restart,
// all arenas/kits/modes and training controls. No unit-test framework or mocks.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const build=await mkdtemp(join(tmpdir(),'stf-playthrough-'));
async function compile(file){
 const source=await readFile(resolve(file),'utf8');
 const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/(from\s+['"])(\.\.?\/[^'"]+)(['"])/g,'$1$2.mjs$3');
 const target=join(build,file.replace(/\.ts$/,'.mjs'));await mkdir(dirname(target),{recursive:true});await writeFile(target,output);
}
await Promise.all(['src/shared/types.ts','src/shared/defaults.ts','src/shared/content.ts','src/simulation/Simulation.ts','src/simulation/bots.ts','src/simulation/geometry.ts'].map(compile));
const {Simulation}=await import(pathToFileURL(join(build,'src/simulation/Simulation.mjs')));
const {createSeat,DEFAULT_CONFIG}=await import(pathToFileURL(join(build,'src/shared/defaults.mjs')));
const {emptyInput}=await import(pathToFileURL(join(build,'src/shared/types.mjs')));
const {ARENAS,DISCIPLINES}=await import(pathToFileURL(join(build,'src/shared/content.mjs')));
const report={matches:[],movement:[],checkpointTicks:0};
function start(config){const s=new Simulation();s.createMatch(config);for(let i=0;i<180;i++)s.step();assert.equal(s.snapshot().phase,'playing');return s;}
function input(s,id,changes){return s.step([{...emptyInput(id,s.snapshot().tick+1),...changes}]);}
function place(s,id,x,y,grounded=true){const snap=s.snapshot();Object.assign(snap.fighters.find(f=>f.id===id),{x,y,grounded,vx:0,vy:0,recovery:0,stun:0,invulnerable:0,action:grounded?'idle':'jump',actionTime:0});s.restore(snap);}
try {
 const movement=start({...DEFAULT_CONFIG,arena:'lab',practice:true});
 place(movement,'p1',600,600);let snap=input(movement,'p1',{jump:true});assert.equal(snap.fighters[0].grounded,false);input(movement,'p1',{});snap=input(movement,'p1',{jump:true});assert.equal(snap.fighters[0].airJumps,0);report.movement.push('ground jump','double jump');
 input(movement,'p1',{});snap=input(movement,'p1',{dodge:true,right:true});assert.equal(snap.fighters[0].airDash,false);report.movement.push('air dash');
 for(let i=0;i<24;i++)input(movement,'p1',{});place(movement,'p1',60,550,false);snap=input(movement,'p1',{special:true});assert.equal(snap.fighters[0].recoveryAvailable,false);report.movement.push('upward recovery');
 for(let i=0;i<100;i++)input(movement,'p1',{});movement.training({action:'reset-all'});place(movement,'p1',600,450,false);snap=input(movement,'p1',{punch:true,down:true});assert.equal(snap.fighters[0].action,'air-down');report.movement.push('down aerial');
 movement.training({action:'reset-all'});place(movement,'p1',600,450,false);snap=input(movement,'p1',{punch:true});assert.equal(snap.fighters[0].action,'air-forward');report.movement.push('forward aerial');
 movement.training({action:'reset-all'});place(movement,'p1',600,600);snap=input(movement,'p1',{dodge:true,left:true});assert.equal(snap.fighters[0].action,'dodge');report.movement.push('directional dodge');
 movement.pause();const tick=movement.snapshot().tick;movement.training({action:'frame'});assert.equal(movement.snapshot().tick,tick+1);assert.equal(movement.snapshot().phase,'paused');movement.training({action:'hitboxes',enabled:true});assert.equal(movement.snapshot().training.hitboxes,true);
 movement.resume();for(let i=0;i<180;i++)movement.step();movement.training({action:'record',enabled:true});for(let i=0;i<30;i++)input(movement,'p1',{right:true,punch:i===5});movement.training({action:'record',enabled:false});movement.training({action:'playback',enabled:true});assert.equal(movement.snapshot().training.dummyRecording.length,30);
 for(const [index,kit] of Object.keys(DISCIPLINES).entries()){
  const arena=Object.keys(ARENAS)[index%6];const s=start({...DEFAULT_CONFIG,arena,practice:true,hazards:true,items:true,players:[createSeat(0,{discipline:kit}),createSeat(1,{discipline:'hardware',kind:'bot',difficulty:'hard',device:'bot'})]});
  const p=ARENAS[arena].platforms[0];place(s,'p1',p.x+p.width/2,p.y);const seen=new Set();
  for(let i=0;i<900;i++){
   const changes={special:i%180===0,combo:i%180===90};const state=input(s,'p1',changes);
   for(const d of state.deployables)seen.add(d.kind);for(const e of state.effects)seen.add(e.kind);
   const counts={};for(const d of state.deployables.filter(d=>d.ownerId==='p1'))counts[d.kind]=(counts[d.kind]??0)+1;
   for(const [kind,n]of Object.entries(counts))assert.ok(n<=(kind==='board'||kind==='block'?2:1));
   if(i===450){const restored=new Simulation();restored.restore(JSON.parse(JSON.stringify(state)));for(let j=0;j<60;j++){const frame={...emptyInput('p1',state.tick+j+1),right:j<20,punch:j===25};assert.deepEqual(JSON.parse(JSON.stringify(restored.step([frame]))),JSON.parse(JSON.stringify(s.step([frame]))));report.checkpointTicks++;}}
  }
  if(kit==='iot')assert.ok(seen.has('board')&&seen.has('hub'));if(kit==='robotics')assert.ok(seen.has('drone')&&seen.has('mechanical'));if(kit==='printing')assert.ok(seen.has('block')&&seen.has('piston'));if(kit==='games')assert.ok(seen.has('pad')&&seen.has('ricochet'));if(kit==='vr')assert.ok(seen.has('decoy')&&seen.has('displacement'));if(kit==='ai')assert.ok(seen.has('echo'));
  report.matches.push({kit,arena,effects:[...seen],tick:s.snapshot().tick});
 }
 for(const mode of ['stock','timed','hill','royale','survival']){
  const count=mode==='royale'?8:4;const players=Array.from({length:count},(_,i)=>createSeat(i,{kind:mode==='survival'&&i===0?'human':'bot',device:mode==='survival'&&i===0?'keyboard:0':'bot',difficulty:'hard',discipline:Object.keys(DISCIPLINES)[i%10]}));
  const s=start({...DEFAULT_CONFIG,gameMode:mode,arena:mode==='royale'?'arcade':'lab',timeLimit:8,lives:1,players});
  const startAt=performance.now();for(let i=0;i<(mode==='royale'?14460:mode==='survival'?1800:1800)&&s.snapshot().phase!=='finished';i++)s.step();
  const state=s.snapshot();assert.ok(state.fighters.every(f=>Number.isFinite(f.x)&&Number.isFinite(f.y)));if(mode!=='survival')assert.equal(state.phase,'finished');
  report.matches.push({mode,tick:state.tick,phase:state.phase,result:state.result,wallMs:Math.round(performance.now()-startAt)});
 }
 // Missing ruleset preserves Classic's single jump and original movement.
 const classic=start({...DEFAULT_CONFIG,ruleset:undefined,practice:true});place(classic,'p1',600,600);input(classic,'p1',{jump:true});input(classic,'p1',{});const first=classic.snapshot().fighters[0].vy;input(classic,'p1',{jump:true});assert.ok(classic.snapshot().fighters[0].vy>first);report.movement.push('Classic single jump preserved');
 console.log(JSON.stringify(report,null,2));
} finally {await rm(build,{recursive:true,force:true});}
