# Original Super TIC Fighter gameplay reference

This is a source-derived reference for the original XNA game, not a new game specification. It traces every method and combat branch of `Game1.cs`, plus its startup, content, saved match configuration, and font files. The Windows game has not been executed on this Mac. Behavior described as a defect or likely intent is explicitly distinguished from what the code does.

Primary source: [Game1.cs](</Users/nacho/Downloads/STF_2017/Programacion/Super Tic Fighter/Super Tic Fighter/Super Tic Fighter/Game1.cs>). Line references below are one-based in this file. Runtime source content is `/Users/nacho/Downloads/STF_2017/Programacion/Super Tic Fighter/Super Tic Fighter/Super Tic FighterContent/`. The archive/Access database inventory is covered separately by `original-archive-reference.md`.

## What the game is

Two to four people fight simultaneously on a single six-platform stage. Each player chooses an appearance and one of four TIC disciplines. Hitting opponents increases their percentage and therefore the speed at which subsequent attacks launch them. Falling below the arena costs a remaining respawn. The last active player wins; a time limit can instead award a shared victory to the players with the most remaining respawns. There are no teams, AI opponents, health bars, pickups, air attacks, double jumps, dashes, grabs, shields with a resource meter, or recovery specials in the source.

The identities are disciplines, not four fixed characters. Hair, shirt, and trousers can be mixed independently from the discipline. Names are supplied by the external configuration. The sample names are TomiSepa, Chona, Ruy, and Coni; these are not hard-coded character classes.

## Startup and configuration

`Program.Main` creates `Game1` and calls `Run()`. `Game1` sets `Content.RootDirectory` to `Content` (lines 124–128), configures a 1366×768 window (242–252), then reads `Content/Data/infoPersonajes.txt` relative to the working directory. It does not parse command-line arguments, launch a character picker, or query the Access database.

The file schema in `SetearValores` (137–158) is:

| Line | Meaning | Actual saved example |
|---|---|---|
| 1 | Number of active players | `4` |
| 2 | Intended seconds; multiplied by 30 to get countdown ticks | `30` |
| 3 | Remaining respawns assigned to all four array slots | `1` |
| 4 onward | One row per active player: `hair:shirt:trousers:discipline:name` | `0:0:0:1:TomiSepa` |

Other saved rows are `1:1:1:2:Chona`, `2:2:2:3:Ruy`, and `3:3:3:4:Coni`. Appearance values 0–2 select overlays; 3 keeps that part of the base sprite. Discipline values are 1 Redes, 2 Diseño, 3 Programación, and 4 Hardware. The array capacities and spawn branches support 2–4 players. No validation prevents malformed numbers, invalid appearance/class indices, blank/unsupported names, or invalid player counts.

All players begin at Y=30 and are marked airborne. Their X coordinates and initial facing are:

| Player count | X positions, in player order | Initially facing right |
|---|---|---|
| 2 | 455, 910 | Player 1 |
| 3 | 341, 682, 1023 | Players 1 and 2 |
| 4 | 273, 581, 819, 1042 | Players 1 and 3 |

These coordinates use C# integer division (205–230). Every attack-history slot is initially empty. HUD portrait names are `Retrato{hair}-{shirt}`; trousers and discipline do not alter the portrait (158).

`LoadContent` selects the jump body for each slot, initializes its rectangular bounds, loads textures/audio, starts the music thread, and immediately plays `Fight` (456–468). There is no countdown or input lock before play. `CargarTexturas` clears the screen and opens/closes an empty SpriteBatch as a placeholder loading screen (255–261). `UnloadContent` is empty.

## Input and player state

Input uses all currently held keyboard keys each update, not press/release edges. Held attack keys can retrigger when the applicable action and cooldown conditions permit. Multiple keys are processed in the order returned by XNA's pressed-key list; action selection is consequently sensitive to simultaneous-key ordering.

| Player | Jump / crouch / left / right | Punch / special / guard |
|---|---|---|
| 1 | W / S / A / D | Z / X / C |
| 2 | Up / Down / Left / Right | I / O / P |
| 3 | Y / H / G / J | B / N / M |
| 4 | Numpad 8 / 5 / 4 / 6 | Numpad 1 / 2 / 3 |

Bindings are fixed (159–190). Escape requests game exit and aborts the music thread (485–489); there is no pause menu. No gamepad or mouse input is read.

The important per-player states (26–47, 477–735) are active, facing, airborne, crouched, guarding, executing an action, action winding up, action active, launched by a hit, damage percentage, remaining respawns, animation indices, jump cooldown, and post-action cooldown. `tipoGolpe` is 0 idle, 1 punch, 2 uppercut, 3 discipline special, 4 sweep, 5 discipline combo, and −1 hit reaction. Attacks and hit reactions share the action timer. A player executing an action or guarding cannot issue ordinary movement or new attacks. Grounded guards are released when the guard key is up and no action is executing. Most attacks do not explicitly clear a victim's guard flag; uppercuts and sweeps do.

## Movement and the arena

Movement uses elapsed seconds, independently of the animation scheduler (493–560, 698–794):

- Horizontal acceleration is 3000 units/s² toward the held direction, with a conditional nominal limit of ±600 units/s. It is not a hard clamp, so overshoot is possible at unusual time steps. Reversing direction first cancels opposite velocity to zero. Holding both horizontal directions forces zero velocity.
- Releasing the corresponding movement key stops horizontal velocity immediately, unless an action or knockback flight is preserving it. There is no gradual ground friction.
- Ordinary horizontal steering is allowed in the air. After hit reaction ends, a player can steer while still airborne; the launched-state flag otherwise preserves horizontal velocity until landing.
- Crouching is grounded only, stops X velocity, changes the body from 60×96 to 60×64, and moves its top downward 32 units. Releasing crouch reverses this when grounded and no action is executing.
- Jump is grounded only, forbidden while crouched/guarding, gives Y velocity −1000, and starts a 0.9-second jump cooldown. Holding jump may automatically jump again once grounded and the timer has expired. There is no variable jump height.
- Airborne gravity adds 3000 units/s² while downward velocity is below 600. This is another conditional limit rather than a clamp. Grounded Y velocity is zero.
- Positions are floating point; hitbox positions truncate to integer coordinates. Body hitbox width and height follow the current body frame. Decorative overlays do not create separate hitboxes.

Platforms are static and one-way from above (192–197, 776–794):

| Platform | Rectangle X, Y, width, height | Drawn texture |
|---|---|---|
| 0 | 500, 600, 800, 50 | Plataforma0 |
| 1 | 600, 300, 500, 50 | Plataforma1 |
| 2 | 320, 450, 250, 50 | Plataforma2 |
| 3 | 766, 450, 500, 50 | Plataforma1 |
| 4 | 100, 600, 250, 50 | Plataforma2 |
| 5 | 50, 300, 250, 50 | Plataforma2 |

There is no physical ground under the platforms. A player is considered airborne when its rectangle intersects none of the six platforms. Landing requires rectangle overlap, downward velocity, and feet less than 20 units below the platform's top. The player is placed with its feet one unit inside the platform, Y velocity becomes zero, and knockback flight ends with X velocity zero. The one-pixel overlap keeps the next update's support check true. Side/underside platform collisions do not block movement. There is no explicit platform drop-through or player-to-player body separation, and no left/right/top arena boundary. At high downward velocities a discrete overlap test could tunnel through a platform.

Sweep is canceled immediately when no platform overlaps the player's body (757–773). This cancellation does not take the normal sweep cleanup branch, so it does not apply its 0.8-second recovery or reliably reverse its position adjustments.

## Timing and animation cadence

`Timer` (796–1489) decrements real-time jump/recovery cooldowns every update, then uses a separate flawed animation scheduler. If its accumulator is already ≥0.033 seconds it resets to zero and skips animation/combat progression. Otherwise it adds elapsed time and progresses animation/combat. On every second such progression it decrements match time.

For a 60-update/s loop this produces **40 animation/combat steps/s and 20 countdown ticks/s**, not the commented 30 steps/s. Therefore a configured 30-second match would last about 45 real seconds at that update rate. This was checked with a small float32 simulation of the exact branch, not by executing the Windows game. No explicit target update rate is set in the source. At other update rates these values change, so source step counts are more trustworthy than inferred durations.

Let **C** mean one of those animation/combat progression steps. All hit collision tests occur before `Timer` in each update. A hitbox created by `Timer` cannot hit until a following update.

| Action | Windup progression | Active progression | Real-time cooldown after cleanup |
|---|---|---|---|
| Punch | Counter starts at 7 with windup disabled; activates on next eligible C | Counter 0→15, cleanup on following C | 0.3 s |
| Uppercut | Same as punch | Same | 0.7 s |
| Sweep | Same as punch | Same unless it leaves platform support | 0.8 s |
| Special | Seven C increment windup 0→7; next C disables windup; following C activates | Counter 0→15, cleanup on following C | 0.8 s |
| Combo | Same as special | Same; Design has a delayed damaging portion | 1.0 s |
| Hit reaction | Created active with counter 0 by collision | Counter 0→15, cleanup on following C | No added recovery |

At the example 40 C/s, special/combo windup is about 0.20 seconds from first progression to activation and the active phase about 0.40 seconds until cleanup. The intervals are uneven because every third update skips progression. Being hit interrupts the victim's action; projectile effects are tied to their owner rather than independent entities.

Body animation selection (833–975) is idle frames 0–1 held 10 C each; walking frames 0–6 held three C except the final frame occurs for one C before index reset; punch frames 0–3 held four C except its loop resets after index 14; jumping, crouching, sweeping, and uppercut use a single frame. Class windup usually uses two frames at four C each; Hardware special/combo uses three frames at three C each with early reset after index 7. Programación combo reuses the Redes combo body animation. The Design combo body files are confusingly named `CProgramacion`.

Hit bodies are fixed `Malo0` or `Malo3`, not an animated four-frame sequence. Other hit frames and the second guard body are loaded but not selected by the gameplay branches. Several arrays/fields (`ataqueSpam`, `hitboxSpam`, `primeraCarga`, etc.) are unused and do not imply extra mechanics.

## Shared attacks and guard

All actions must start grounded. Punch is standing; uppercut is crouch+punch; sweep is crouch+special. Guard starts standing, grounded, outside recovery/windup, freezes horizontal movement, and can be held indefinitely. It has no stamina, duration cap, parry window, shield size, or regeneration.

Melee collision uses **the attacker's whole current body rectangle**, not a separate fist or foot hitbox. Punch and uppercut additionally check whether the victim is in front, with a 20-unit positional tolerance (1521–1652). Sweep simply uses the attacker's facing to choose launch direction (1654–1705).

For the tables below, **K is the victim's percentage before the hit**, **s is +1 for right-facing attacker and −1 for left-facing attacker**, and negative Y velocity is upward. Percentage increases are capped at 200. These are launch velocities, not forces integrated over time.

| Action | Added percentage | Victim X velocity | Victim Y velocity | Special behavior / source |
|---|---|---|---|---|
| Punch | 6 | s×3×(100+K) | −(600+K) | Frontal guard changes outcome; 1523–1597 |
| Blocked punch | 2 | Unchanged | Unchanged | Victim moved horizontally beyond attacker, 20-unit gap; 1527–1532 / 1565–1570 |
| Uppercut | 5 | s×(100+K) | −(1200+K) | Breaks guard, ignores its protection; attacker also jumps; 1599–1651 |
| Sweep | 2 | s×5×(100+K) | −(400+K) | Breaks guard; broad horizontal knockback; 1654–1704 |

Only the normal punch checks guard protection. It is blocked only when victim faces the attacker. Uppercut, sweep, and **all discipline specials and combos ignore protection**. Uppercut sets the attacker's upward velocity to −700, changes from crouching to standing-height uppercut art, and lifts the top to preserve feet position (1021–1035). Sweep shifts the top down ten units into a 60×54 pose and moves at 300 units/s in attack direction; left sweep also shifts X by the width/height difference. Normal cleanup reverses these offsets and returns to crouching (1149–1172, 1449–1469).

Most hits set the victim to hit reaction −1, airborne, facing back toward the attacker, non-crouching, and launched-state true. The hit-reaction state prevents subsequent attackers from applying a new hit while it lasts. Landing stops the launch but does not itself end that timer. There is no separate respawn invulnerability, combo meter, attack resource, or hit-stop/camera shake.

## Discipline specials

Each player has one special/effect slot. Its hitbox is rectangular and uses the current effect frame's full dimensions, including transparent regions. Projectiles do not collide with stage surfaces, each other, or blocks. Only initial positioning of certain effects searches for a platform below.

| Discipline | Special and visual / spawn | Travel or animation | Hit and cleanup |
|---|---|---|---|
| Redes | UTP cable; first frame 68×32; Y=player top−5; begins at right edge −9 or left edge −width +9 | 15 frames: widths 68,96,124,152,180,208,236,264,264,236,208,180,152,124,96. Height stays 32. X follows player edge as frame width changes; Y stays at spawn. | +3%; X=s×3×(100+K), Y=−(600+K). Early hit when effect index≤7 changes index to14−index and active counter to that value, starting retraction early. Does not immediately disappear. 1038–1062,1298–1316,1712–1768. |
| Diseño | Mouse pointer with dotted trail, 99×32; Y=player top; X=right edge−5 or left edge−width+5 | Travels horizontally at 1900 units/s; 10 frames cycling once per C | +6%; X=s×2×(100+K), Y=−(600+K). First hit removes effect and immediately starts 0.8-second recovery. 1063–1084,1317–1332,1770–1830,2164–2174. |
| Programación | Green code ball, 45×20; centered vertically with an extra−20 offset; just outside player edge | Travels horizontally at 700 units/s; 6 frames, each held 2 C | +6%; X=s×3×(150+K), Y=−(600+K). First hit removes effect and immediately starts 0.8-second recovery. 1085–1103,1333–1348,1832–1892,2175–2185. |
| Hardware | RAM chips rising from a surface; begins 50×48;50-unit gap from player edge | Initial bottom aligned with player feet, then lowered one pixel at a time until overlapping a platform or top reaches 800. 15 frames grow to 150×124; changes in height move top upward to retain bottom alignment. X follows player's edge and current width; no traveling projectile. | +5%; X=s×2×(150+K), Y=−2×(600+K). Continues through its normal active lifetime. 1104–1147,1349–1368,1894–1943. |

RAM frame sizes are 0–4: 50×48; 5–6: 100×45; 7: 100×58; 8: 100×75; 9: 100×93; 10–12: 150×93; 13: 150×107; 14: 150×124. The growing picture is also the growing hitbox. Special activation initially selects some arrays by player index rather than frame zero (`MOUSE[b]`, `BOLA[b]`, `RAM[b]`); subsequent animation resets to frame zero. This changes the initial visual for different player slots and appears incidental.

## Input combos and discipline combos

`Combo` shifts a three-element action history (130–135). Left, Right, successfully starting crouch, successfully starting jump, standing punch, and standing special append their labels only when different from the newest label. It is not a timed buffer. Releasing a key does not add an action. Guard, uppercut, and sweep do not add labels. Repeated identical actions do not break the history.

Standing special after **Left→Down→Special** or **Right→Down→Special** selects combo type 5 with that direction (593–658). Since Down actually crouches, the user must release crouch and become standing before special, otherwise special is the sweep. History can survive a long pause or other unrecorded actions. History is cleared when the combo becomes active (1175–1178). Unlike ordinary specials, the combo-selection branches fail to require post-action cooldown=0, permitting combos during recovery once no action is executing.

| Discipline | Combo effect / placement and movement | Damage and launch | Source |
|---|---|---|---|
| Redes | 140×66 cluster of cables, 50-unit horizontal gap. Initially searches downward for a platform as RAM does; 15 frames; X follows player edge. | +9%; X=s×2×(50+K), Y=−2×(600+K). |1179–1222,1375–1396,1948–1997 |
| Hardware | 52×52 disc at player's vertical center −20, just outside edge; travels horizontally 1900 units/s; 4 cycling frames | **Right +6%, left +9%**; X=s×2×(50+K), Y=−(600+K). It persists after a hit, unlike mouse/ball. |1223–1243,1397–1404,1999–2049,2190–2200 |
| Diseño | 120×96 selection rectangle, 20-unit gap, feet aligned. Allocated immediately at request and visible through windup. 22 frames total: 0–6 during windup, 7–21 during active progression. X follows player edge. |Only damaging when effect index ≥15; +4%; X=s×3×(150+K), Y=−(600+K). |609–627,639–657,998–1006,1405–1423,2051–2099 |
| Programación | 60×96 vertical code text, 20-unit horizontal gap. Searches downward for a platform at spawn ; then travels upward 1900 units/s,regardless of left/right direction. Single effect image. |+4%; X=s×2×(50+K), Y=−2×(600+K). |1244–1287,2102–2150,2201–2211 |

Combo placement/travel uses remembered `ataqueDer` while collision launch direction uses current `lastDer`. Those normally coincide, but historical buffered direction and current facing need not agree. The Hardware combo's different left/right damage is an explicit source asymmetry, not an inferred balancing rule.

## Hit detection ordering and edge cases

The update order is input-down → input-up → sync body positions → support check → integrate bodies → platform landing → fall/respawn → integrate effects → collisions → visual facing → timer/animation → victory (2298–2316). This gives precise implications:

- Collision happens every game update, not only on C. Attack visual frames and effect bounds change later in the update.
- Victims are visited in slot order, then attackers in slot order. First unblocked hit sets hit reaction and prevents later attackers from hitting that victim. This can create index-based priority, rather than simultaneous trades.
- Melee requires active attack and active victim but does not require active attacker. Effect collisions require both active players but **do not require the effect to have entered its active phase**. They check attack type and rectangle. Most effects spawn only when active, but stale rectangles can remain after interruption and therefore overlap during a subsequent windup.
- Except mouse and ball on hit, effects remain capable of hitting other players until their action ends. The hit-reaction immunity prevents a victim from being hit again immediately; there is no per-effect list of already-hit targets.
- Standard special/combo cleanup moves the effect to (1500,1500), resets action state, and starts recovery. This is a hide-position convention, not destruction of an independent projectile. Being hit changes attack type and hides its draw branch, but does not move the old effect rectangle away.
- Normal punch guard pushback occurs without hit stun. It moves the victim beyond the attacker's rectangle; no health damage or shield meter exists.

## Respawns, win conditions, and result handoff

`ChequearCaida` (1491–1511) checks all four slots, including unused slots. If Y >1200 and remaining respawns >0: subtract one, reset percentage to 0, stop X velocity, set Y=0, and choose integer X uniformly from 100 inclusive to`1250−bodyWidth` exclusive. **Y velocity, jump state, hit state, guard, attack, cooldown, and combo history are not reset.** The player can therefore reappear already falling or acting. There is no spawn platform, protected period, or respawn animation.

If Y >1200 and remaining respawns =0, the value becomes −1 and the player is marked inactive. Thus configured 1 means **two falls until elimination**. A player at displayed `x0` is still alive. Eliminated players stop rendering but their physics is still integrated. The same fall code also spends the initially assigned respawns of unused slots, even though they never render or accept input.

`ChequearVictoria` (2234–2296) first counts active players among the configured player count. If exactly one remains, it writes the winner name and colon-separated other names to `Content/Data/Ganador.txt` and `Perdedor.txt`, starts `Winner.exe`, aborts music, and exits. No in-game results UI or rematch is implemented. Full archive inspection found no `Winner.exe` or launcher source/executable.

If time ≤0, a configured player is considered a winner when no array slot has more remaining respawns. It compares against all four slots rather than just entered players. Tied winners are all written to the winner file; percentage is not a tiebreaker. There is no sudden death. This comparison can be contaminated by the unused slots' independently evolving fall/respawn counts, particularly in a two- or three-player match. If no winner is collected, removing the trailing colon from the empty string throws. Simultaneous elimination to zero active players has no immediate winner branch and waits for timeout. The survivor and timeout branches are independent `if` blocks, so both could execute in the same update. External result launch failure is not caught.

## Rendering, camera, HUD, and appearance

There is one fixed camera at screen origin: no scrolling, zoom, split screen, screen shake, safe-area logic, letterboxing, responsive scaling, or offscreen indicators. Window size is 1366×768; fullscreen is commented out. `Draw` clears to CornflowerBlue, then renders in this order (2319–2385):

1. Six platform images at their collision coordinates.
2. Active standard special images in player slot order.
3. Active combos; Design selection is also drawn during windup.
4. Active players: base body, hair overlay, shirt overlay, trousers overlay, all at body's current dimensions and horizontally flipped together.
5. Portrait HUDs for active players only.
6. Remaining respawn count, damage percentage, and player name; then centered timer.

`SpriteBatch` uses non-premultiplied blending. Portrait images are 140×52 with 16 hair/shirt combinations, mirrored for players 2/4. Portrait positions are (60,20),(1166,20),(60,696),(1166,696). Damage/name sit alongside portraits; the respawn count is outside the portrait. Eliminated players' entire HUD disappears, so final standings are not displayed. Timer formatting prepends a literal `0` to the minute string and pads seconds only; it is aimed at short matches rather than arbitrary long durations.

Fonts are `Jing Jing`, regular, kerning on: 24pt for timer/respawn count; 14pt for names/percentage. Both spritefont files only contain characters 32–126 (basic ASCII); accented Spanish names are not supported by those compiled fonts. No font source file is supplied by these two descriptions.

Three overlays plus the base appearance for each of hair/shirt/trousers yield 64 possible visual combinations. They share one body/movement skeleton and all gameplay stats. Discipline is a separate 1–4 choice. No skin tone, sex/body choice, shoes, cosmetic unlock, or saved profile menu is implemented here. The Access database's extra body/shoes/profile fields are historical data, not proof of functioning options.

The separate finished background at `/Users/nacho/Downloads/STF_2017/Diseño/Fondos/Fondo.png` and ORT CORP logo are never loaded by `Game1`. There is no title/menu/settings screen, character-selection UI, loading animation, match-ready screen, win portrait, tutorial, or control-remapping screen in the XNA source. Those are missing handoff/UI areas, not evidence that the archive art should all be drawn in battle.

## Effects and soundtrack

Eighteen WAV effects are loaded (263–280). Triggers are:

| File | Actual trigger |
|---|---|
|Fight|Once after content loads; no countdown gate.|
|Golpe / Golpe2|Random 50/50 on punch or uppercut request.|
|Golpeado|A normal punch is successfully blocked.|
|Gancho|An unblocked punch or uppercut hits.|
|Barrida|Sweep requested; no additional sweep-hit sound.|
|Redes|First windup C of Redes special.|
|Latigo|Redes special hits.|
|UTP|Loaded but never played.|
|Mouse|Design special becomes active.|
|golpeMouse|Design special hits; also Hardware disc combo hits.|
|Prog|First windup C of Programming special.|
|Bola|Programming special hits.|
|Hard|First windup C of Hardware special **and Redes combo**.|
|RAM|Hardware special becomes active.|
|Disco|Hardware combo becomes active.|
|Programacion|Programming combo becomes active.|
|Seleccion|First windup C of Design combo.|

RAM, Redes combo, Design combo, and Programming combo have no additional hit sound. Jump, land, fall, respawn, elimination, and victory do not directly play a sound in this source. Effect playback uses the default `SoundEffect.Play()` values; no mix sliders or spatialization exist.

Eight songs named `Sonidos/Cancion 0` through `Cancion 7` load into a playlist (282–285). Music volume is 0.6, unmuted, not repeating a single song. A separate thread continuously polls the player. Whenever stopped **or paused**, it randomly selects one of eight songs excluding the immediately previous choice and starts it (432–453). Thus pause would skip rather than hold the current track, and the loop has no sleep. The same random generator is also used for respawns/punch sound selection. An unused separate `ReproductorMusica` class exists; it is not constructed by the actual game and should not be mistaken for the active implementation.

Source MP3s exist, so web music does not require decoding XNB. The supplied Drive export's eight WMA audio/data payloads are SHA-256-identical to the original built WMA files at matching indices 0–7; their differing file hashes come from metadata. Drive's one-page `Lista OST.docx` is a 15-song historical reference playlist, not a gameplay plan. It lists Danger Zone, Welcome to the Jungle, Crazy Train, Chop Suey, Thunderstruck, Holy Wars, Du Hast, Master of Puppets, Robot Rock, Hot for teacher, Rock me amadeus, Duke Nukem, Burn, Creeping Death, and Seek and destroy; the last eight have YouTube links. This list does not reliably identify every numbered original/remake file. The broader archive contains Mortal Kombat-named audio collections. These are provenance observations, not a decision to include or replace the recordings in a new release.

## Fidelity decisions versus defects

The distinctive reusable design is the platform-ringout loop, percentage-based launch strength, shared grounded martial-arts moves, modular appearance, and four computer-discipline attack sets. All are concretely implemented. A port can preserve these while separately deciding which historical balance details are desirable.

Source-confirmed quirks that should not silently become a new specification include: match/animation cadence dependent on update rate; respawn count presented as lives; no complete respawn reset; inactive-slot physics influencing timeout comparison; missing zero-survivor handling; guard protecting only punches; combo recovery bypass; indefinite historical combo input; left/right disc damage asymmetry; direction used for effect placement differing from damage direction; whole-frame rather than silhouette hitboxes; attacks potentially hitting stale rectangles during windup; and inconsistent sweep cleanup off platforms. Smooth networked play also needs explicit deterministic timing and random decisions rather than a literal translation of these shared timers and thread-dependent random calls.

This reference does not authorize changing those choices or implementing a port. It records the original precisely so the owner can distinguish remembered gameplay, verified mechanics, unused assets, unfinished UI, and accidental behavior.
