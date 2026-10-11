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
const report={matches:[],movement:[],aerialKits:[],checkpointTicks:0};
function start(config){const s=new Simulation();s.createMatch(config);for(let i=0;i<180;i++)s.step();assert.equal(s.snapshot().phase,'playing');return s;}
function input(s,id,changes){return s.step([{...emptyInput(id,s.snapshot().tick+1),...changes}]);}
function place(s,id,x,y,grounded=true){const snap=s.snapshot();Object.assign(snap.fighters.find(f=>f.id===id),{x,y,grounded,vx:0,vy:0,recovery:0,stun:0,invulnerable:0,action:grounded?'idle':'jump',actionTime:0});s.restore(snap);}
try {
 const movement=start({...DEFAULT_CONFIG,arena:'lab',practice:true});
 place(movement,'p1',600,600);let snap=input(movement,'p1',{jump:true});assert.equal(snap.fighters[0].grounded,false);input(movement,'p1',{});snap=input(movement,'p1',{jump:true});assert.equal(snap.fighters[0].airJumps,0);report.movement.push('ground jump','double jump');
 input(movement,'p1',{});snap=input(movement,'p1',{dodge:true,right:true});assert.equal(snap.fighters[0].airDash,false);report.movement.push('air dash');
 for(let i=0;i<24;i++)input(movement,'p1',{});place(movement,'p1',60,550,false);snap=input(movement,'p1',{combo:true});assert.equal(snap.fighters[0].recoveryAvailable,false);report.movement.push('Signature upward recovery');
 for(let i=0;i<100;i++)input(movement,'p1',{});movement.training({action:'reset-all'});place(movement,'p1',600,450,false);snap=input(movement,'p1',{punch:true,down:true});assert.equal(snap.fighters[0].action,'air-down');report.movement.push('down aerial');
 movement.training({action:'reset-all'});place(movement,'p1',600,450,false);snap=input(movement,'p1',{punch:true});assert.equal(snap.fighters[0].action,'air-forward');report.movement.push('forward aerial');
 movement.training({action:'reset-all'});place(movement,'p1',600,600);snap=input(movement,'p1',{dodge:true,left:true});assert.equal(snap.fighters[0].action,'dodge');report.movement.push('directional dodge');
 movement.pause();const tick=movement.snapshot().tick;movement.training({action:'frame'});assert.equal(movement.snapshot().tick,tick+1);assert.equal(movement.snapshot().phase,'paused');movement.training({action:'hitboxes',enabled:true});assert.equal(movement.snapshot().training.hitboxes,true);
 movement.resume();for(let i=0;i<180;i++)movement.step();movement.training({action:'record',enabled:true});for(let i=0;i<30;i++)input(movement,'p1',{right:true,punch:i===5});movement.training({action:'record',enabled:false});movement.training({action:'playback',enabled:true});assert.equal(movement.snapshot().training.dummyRecording.length,30);
 const specialKinds={networks:'cable',design:'mouse',code:'ball',hardware:'ram',ai:'ball',robotics:'mechanical',iot:'board',vr:'displacement',games:'ricochet',printing:'piston'};
 for(const kit of Object.keys(DISCIPLINES)){
  const s=start({...DEFAULT_CONFIG,arena:'lab',practice:true,hazards:false,items:false,players:[createSeat(0,{discipline:kit}),createSeat(1,{device:'keyboard:1'})]});
  const activated={ground:new Set(),air:new Set()};
  for(const airborne of [false,true]){
   s.training({action:'reset-all'});place(s,'p1',300,airborne?100:600,!airborne);place(s,'p2',1150,600);
   const first=input(s,'p1',{special:true,down:airborne});assert.equal(first.fighters[0].action,'special');assert.equal(first.fighters[0].recoveryAvailable,true);
   for(let i=0;i<32;i++){const state=input(s,'p1',{});for(const e of state.effects.filter(e=>e.ownerId==='p1'))activated[airborne?'air':'ground'].add(e.kind);for(const d of state.deployables.filter(d=>d.ownerId==='p1'))activated[airborne?'air':'ground'].add(d.kind);}
   assert.ok(activated[airborne?'air':'ground'].has(specialKinds[kit]),`${kit} ${airborne?'air':'ground'} special missing ${specialKinds[kit]}`);
  }
  s.training({action:'reset-all'});place(s,'p1',-100,550,false);let state=input(s,'p1',{combo:true});assert.equal(state.fighters[0].action,'recover');assert.equal(state.fighters[0].recoveryAvailable,false);assert.ok(state.fighters[0].vy<-900);
  for(let i=0;i<38;i++)input(s,'p1',{});place(s,'p1',-100,550,false);state=input(s,'p1',{combo:true});assert.notEqual(state.fighters[0].action,'recover');assert.equal(state.fighters[0].recoveryAvailable,false);
  // Air Special remains available after the independent recovery charge is spent.
  state=input(s,'p1',{special:true});assert.equal(state.fighters[0].action,'special');assert.equal(state.fighters[0].recoveryAvailable,false);
  place(s,'p1',600,590,false);for(let i=0;i<10&&!s.snapshot().fighters[0].grounded;i++)input(s,'p1',{});assert.equal(s.snapshot().fighters[0].grounded,true);assert.equal(s.snapshot().fighters[0].recoveryAvailable,true);
  s.training({action:'reset-all'});place(s,'p1',300,600);state=input(s,'p1',{combo:true});assert.equal(state.fighters[0].action,'combo');assert.equal(state.fighters[0].recoveryAvailable,true);
  const bot=start({...DEFAULT_CONFIG,arena:'lab',practice:true,hazards:false,items:false,players:[createSeat(0,{discipline:kit,kind:'bot',device:'bot',difficulty:'hard'}),createSeat(1,{device:'keyboard:1'})]});
  let seeded=bot.snapshot();Object.assign(seeded.fighters[0],{x:-100,y:680,vy:200,vx:0,grounded:false,airJumps:0,airDash:false,recoveryAvailable:true,action:'jump',recovery:0,stun:0});bot.restore(seeded);let botRecovered=false;
  for(let i=0;i<90;i++){const b=bot.step();botRecovered ||= b.events.some(e=>e.seatId==='p1'&&e.action==='recover');}assert.equal(botRecovered,true,`${kit} hard bot did not use Signature recovery`);
  report.aerialKits.push({kit,groundSpecial:[...activated.ground],airSpecial:[...activated.air],recovery:'Signature once until landing/respawn',groundSignature:'combo',botRecovery:true});
 }
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
 // Objective/item/deployable edge cases run through complete authorities.
 const edge=start({...DEFAULT_CONFIG,gameMode:'training',practice:true,arena:'lab',items:true,hazards:true,players:[createSeat(0,{discipline:'iot'}),createSeat(1,{kind:'bot',device:'bot',difficulty:'dummy'})]});
 for(const kind of ['usb','fan','firewall','battery','overclock']) {
  edge.training({action:'reset-all'});place(edge,'p1',600,600);let seeded=edge.snapshot();seeded.items=[{id:`exercise-${kind}`,kind,x:600,y:550,ttl:15}];seeded.fighters[0].airJumps=0;seeded.fighters[0].airDash=false;seeded.fighters[0].recoveryAvailable=false;edge.restore(seeded);edge.step();
  if(kind==='battery'){assert.equal(edge.snapshot().fighters[0].airDash,true);assert.equal(edge.snapshot().fighters[0].recoveryAvailable,true);}else assert.ok(edge.snapshot().fighters[0].buffs[kind]>0);
  if(kind==='usb'){input(edge,'p1',{punch:true});for(let i=0;i<8;i++)edge.step();assert.ok(edge.snapshot().effects.some(e=>e.kind==='usb'&&e.vy>0));}
 }
 const hill=start({...DEFAULT_CONFIG,gameMode:'hill',mode:'teams',arena:'lab',players:Array.from({length:4},(_,i)=>createSeat(i,{team:i<2?0:1,kind:'human',device:`keyboard:${i}`}))});
 place(hill,'p1',600,600);place(hill,'p2',700,600);place(hill,'p3',200,450);place(hill,'p4',1150,450);const hillBefore=hill.snapshot();hill.step();assert.ok(Math.abs(hill.snapshot().scores.p1.hill+hill.snapshot().scores.p2.hill-hillBefore.scores.p1.hill-hillBefore.scores.p2.hill-1/60)<1e-8);
 const tie=start({...DEFAULT_CONFIG,gameMode:'royale',arena:'arcade',players:Array.from({length:8},(_,i)=>createSeat(i))});let tsnap=tie.snapshot();for(const id of ['p1','p2'])Object.assign(tsnap.fighters.find(f=>f.id===id),{y:1201,grounded:false});tie.restore(tsnap);tie.step();assert.equal(tie.snapshot().scores.p1.placement,7);assert.equal(tie.snapshot().scores.p2.placement,7);tie.forfeit(['p3','p4']);assert.equal(tie.snapshot().scores.p3.placement,5);assert.equal(tie.snapshot().scores.p4.placement,5);
 const coop=start({...DEFAULT_CONFIG,gameMode:'survival',timeLimit:0,players:[createSeat(0),createSeat(1),createSeat(2,{kind:'bot',device:'bot',difficulty:'dummy'})]});coop.forfeit(['p3']);for(let i=0;i<125;i++)coop.step();assert.equal(coop.snapshot().objective.wave,2);assert.equal(coop.snapshot().fighters.find(f=>f.id==='p3').eliminated,false);
 const strictClassic=start({...DEFAULT_CONFIG,ruleset:'classic',hazards:true,items:true,arena:'virtual',practice:true});assert.equal(strictClassic.snapshot().config.hazards,false);assert.equal(strictClassic.snapshot().config.items,false);for(let i=0;i<500;i++)strictClassic.step();assert.deepEqual(strictClassic.snapshot().platforms,ARENAS.virtual.platforms);assert.equal(strictClassic.snapshot().items.length,0);
 report.edgeCases=['five item effects','ballistic USB','one team Hill point per tick','shared Royale fall placement','shared Royale forfeit placement','two-human Survival wave respawn','Classic hazards/items disabled'];
 const trainingGroup=start({...DEFAULT_CONFIG,practice:true,gameMode:'training',arena:'lab',players:[createSeat(0),createSeat(1),createSeat(2,{kind:'bot',device:'bot',difficulty:'dummy'}),createSeat(3,{kind:'bot',device:'bot',difficulty:'dummy'})]});
 trainingGroup.training({action:'record',seatId:'p2',enabled:true});for(let i=0;i<30;i++)trainingGroup.step([{...emptyInput('p1',trainingGroup.snapshot().tick+1),right:true},{...emptyInput('p2',trainingGroup.snapshot().tick+1),left:true}]);trainingGroup.training({action:'record',enabled:false});assert.equal(trainingGroup.snapshot().training.dummyRecording.length,30);trainingGroup.training({action:'playback',enabled:true});trainingGroup.step();assert.equal(trainingGroup.snapshot().training.playbackIndex,1);for(const id of ['p3','p4'])assert.equal(trainingGroup.snapshot().runtime.fighters.find(([seatId])=>seatId===id)[1].previous.left,true);
 trainingGroup.training({action:'reset-all'});trainingGroup.training({action:'set-position',seatId:'p1',x:600,y:420});trainingGroup.training({action:'hitboxes',enabled:true});trainingGroup.pause();trainingGroup.training({action:'frame',inputs:[{...emptyInput('p1',trainingGroup.snapshot().tick+1),punch:true,down:true}]});const attackBox=trainingGroup.snapshot().training.collisionBoxes.find(box=>box.ownerId==='p1'&&box.kind==='attack');assert.equal(attackBox.height,92);assert.equal(attackBox.width,64);assert.equal(trainingGroup.snapshot().fighters[0].action,'air-down');
 report.edgeCases.push('selected human recording with synchronized multiple dummies','held-input frame advance','exact authority aerial collision boxes');
 // Missing ruleset preserves Classic's single jump and original movement.
 const classic=start({...DEFAULT_CONFIG,ruleset:undefined,practice:true});place(classic,'p1',600,600);input(classic,'p1',{jump:true});input(classic,'p1',{});const first=classic.snapshot().fighters[0].vy;input(classic,'p1',{jump:true});assert.ok(classic.snapshot().fighters[0].vy>first);report.movement.push('Classic single jump preserved');
 const fast=start({...DEFAULT_CONFIG,practice:true,arena:'lab'});fast.training({action:'set-position',seatId:'p1',x:-100,y:-150});for(let i=0;i<24;i++)input(fast,'p1',{down:true});assert.ok(fast.snapshot().fighters[0].vy>600);report.movement.push('fast fall');
 console.log(JSON.stringify(report,null,2));
} finally {await rm(build,{recursive:true,force:true});}
