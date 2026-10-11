# Super TIC Fighter: Unity remake and Drive art reference

This is a read-only discovery record, not an implementation plan or an instruction imported from the old project. It distinguishes assets, code, scene wiring, and unfinished ideas. The current Unity snapshot was inspected statically; it was not run or compiled. The owner's historical working online demo can coexist with regressions in the later snapshot.

## Sources and coverage

- Unity repository: https://github.com/IgnacioPardo/Super-TIC-Fighter-Remake (private), `main` at `fe16da3d64f386e531b9133750e67b60aa13403c`, December 7, 2020.
- Local audit clone: `/tmp/stf-remake-audit-ThKloi`. Root agent is independently tracing full Git history; this document describes current HEAD.
- Drive export: `/Users/nacho/Downloads/Super TIC Fighter Remake`.
- Original runtime art used for comparisons: `/Users/nacho/Downloads/STF_2017/Programacion/Super Tic Fighter/Super Tic Fighter/Super Tic FighterContent/Texturas`.
- Full original design archive was also indexed for PNG byte/pixel matches. No original, Drive, or Unity tracked source file was modified.

All 320 tracked files, 117,665,955 bytes, and every containing directory in the Unity tree were inventoried, including hidden root/configuration files. The directory/file manifest is `docs/remake-inventory.json`. All 17 first-party C# scripts were read. Both scenes, all seven prefabs, four animation clips, four controllers, all 20 ProjectSettings files, both Packages files, root documents, `.vscode/settings.json`, `.gitignore`, `.collabignore`, and all asset metadata were inspected or structurally parsed. All 71 PNGs were decoded and compared; representative artwork was visually inspected. The 17 MP3s and font were inventoried and metadata inspected; listening/track identification is a separate audit.

Vendored code is explicitly distinguished: eight MLAPI editor scripts plus their metadata in `Assets/Editor/MLAPI` (16 files, 146,166 bytes), and MLAPI DLL/XML documentation plus metadata in `Assets/MLAPI/Lib` (four files, 846,243 bytes). These were inventoried and their integration inspected rather than reviewed line by line. Unity Packages are registry/built-in dependency declarations, not additional local gameplay code.

There are no nested source archives, PSD/XCF files, design documents, gameplay videos, hidden alternate game projects, test suites, build artifacts, or additional scenes in this Unity tree. `.vscode/settings.json` hides many Unity assets from the editor UI, but they were included in this filesystem audit. `.git` object history is repository storage, handled by the root agent rather than mistaken for extra game content.

## Overall game identity and current completeness

The game remains a 2D platform fighter with damage percentages and knockback, four technical disciplines, configurable-looking appearance layers, punches and discipline attacks, and elimination by falling. The remake product name is **Super TIC Fighter X** (`ProjectSettings/ProjectSettings.asset`), version `0.1`; engine version is **Unity 2019.4.15f1**. Its title/logo is blue and white with a pink X. The menu uses white outlined pixel-font LOCAL and ONLINE buttons.

The meaningful remake direction was internet host/client play, a proper initial menu, integrating the existing city backdrop, assembling modular animation sheets, and experimenting with camera framing and a playlist. Several of these are unfinished or disabled in the saved scene. The original contains more complete fighting rules than current Unity HEAD. Ground jump, acceleration, crouch, punch, uppercut, sweep, block, and discipline attacks were already original concepts; do not call them new Unity improvements. No double jump, dash, air dodge, charged attacks, free directional aiming, bots, controller gameplay, room browser, matchmaking, or account system was found in current first-party Unity code.

Current HEAD has compile-breaking `Connection.cs` HUD edits (`or` instead of a C# boolean operator; variable declarations in unbraced conditional branches and use outside their scope). Four folder `.meta` files retain merge-conflict markers: `Assets/OST.meta`, `Assets/Prefabs/Spam.meta`, `Assets/ButtonImages.meta`, `Assets/Prefabs.meta`. Therefore all runtime descriptions below are statements about source intent/wiring, not a claim that current HEAD is playable.

## Start, menu, online join, and absent flows

Build order is `Assets/menu.unity` then `Assets/game.unity`. Both use orthographic cameras initially at `(0,0,-10)`, size 5, and a dark blue camera background. Desktop default window is 683×384, windowed/nonresizable; stored Web default size is 960×600. UI canvases use constant pixel size with a nominal 800×600 reference, not responsive scaling.

`Intro.Start()` initializes a splash state, hides LOCAL/ONLINE and all connection fields/buttons, and displays the logo and `Press any key to play`. The prompt blinks every 35 fixed frames, about 0.58 seconds at the stored 60 Hz timestep. Any key enters the main menu. Main menu reduces logo dimensions to 70% of the initial ~339.32×183.29 size and shows LOCAL and ONLINE. Escape returns from main menu to splash. ONLINE enters the connection form; Escape returns from that form to main menu. LOCAL has an empty `m_OnClick` event list in the scene and does nothing.

Connection form contains a 10-character name field, a 15-character field internally called PIN, a Host button, and a Join button visually labeled `>`. Name placeholder is `Enter your name`; PIN placeholder is `join`. There is no ready state, player roster before entering the arena, character/class selector, appearance selector, connection progress/status, failure message, timeout recovery UI, or input validation. Name and PIN are uppercased. A nonempty PIN is assigned directly to the remote IP string; empty PIN defaults to `127.0.0.1`. It is not a generated room code.

Both Host and Join immediately load `game`; `LoadGame.Start()` calls `Connect()` on the persistent menu NetworkManager, then marks `ingame=true` without waiting for a successful session. Host starts MLAPI `StartHost()`, joining uses UNET `ConnectAddress` then `StartClient()`. No pause/menu/quit input is handled in the game scripts. There is no implemented end-of-match, timer, winner, results, rematch, or return-to-menu flow.

### Scene hierarchy and UI geometry

`menu.unity` has 21 GameObjects. Root objects:

- `Main Camera`
- `music_handler` (empty transform, active)
- `Audio Source` (**inactive**; intro clip configured, PlayOnAwake enabled but never activated by first-party code)
- `NetworkManager` (active; Connection + UNET + MLAPI, configured to persist across scenes)
- `EventSystem`
- `Canvas` (Intro + UI scaler/raycaster), containing:
  - `Panel` (background panel)
  - `Logo`, using `Assets/STFX.png`
  - `start_inst`, 18-point Arcade Normal, white
  - `Local` and `Online`, image buttons
  - `Name`, with `Text` and `Placeholder` children
  - `PIN`, with `Text` and `Placeholder` children
  - `Host/Text`
  - `Join/Text`

Most connection text is 14-point Arcade Normal; the join arrow is 25-point. All main elements are center-anchored. Logo position is `(0,122.645)` with top-center pivot. LOCAL/ONLINE centers are `(-75.5,-50.4)` and `(75.5,-50.4)`, each about 151×45.2. Start prompt center is `(0,-120)`. Name is about 302×38 at `(0,-42.987)`. Host is 160×30 at `(-80,-77)`. PIN is about 236.7×32.6 at `(164,-77)`; Join is about 90.3×33.2 at `(75.5,-103.3)`. These are literal historical layout values, not responsive layout recommendations.

`game.unity` has 12 direct GameObjects and three prefab instances:

- `Main Camera` (active; LoadGame script)
- `Canvas` with `UI_PlayerID` and `UI_PlayerID2`
- `EventSystem`
- `Respawn1` at `(4.48,1.13,0)` and `Respawn2` at `(-5.12,1.13,0)`
- `Background1` at `(0,0,10)`, scale `(2.0666666,1.76,1)`, using Map1
- `FollowPlayer` (**inactive**; FollowPlayers script)
- `NetworkManager` (**inactive** duplicate; menu manager is the active persistent one)
- `StageBorders` (**inactive**)
- `Music Manager` (**inactive**)
- Prefab instances: `Plataforma`, `Plataforma (1)`, and one stationary `Attack` test object.

Players are not scene instances: MLAPI is configured to create the Player prefab when a client connects.

The two HUD Text objects are 300×150, centered at `(-204,55)` and `(204,55)`, with outer-facing pivots, left/right alignment, black 14-point Arcade Normal text. Serialized initial content is `New Text`. `Connection.FixedUpdate()` intends to rebuild both columns from all objects tagged `player`: entries 0/2 on the left and 1/3 on the right. The intended strings show `X{lives} {name} {percentage}%` with reversed order on the right; eliminated players get `{name} >:B`. Entries are separated by three newlines. This is simple text, not the richer original/Drive portrait HUD. Ordering is whatever object enumeration returns, not stable player slots. This HUD code is also the current compile blocker.

## Arena, camera, physics, and movement

`Assets/Prefabs/Plataforma.prefab` is a white 4×4 texture stretched across a platform, not the original girder-platform art. It has a static Rigidbody2D, EdgeCollider2D at offset `(0,0.5)`, and one-way PlatformEffector2D. Scene instances both have x=0, x-scale 18, inherited y-scale 0.7; y positions are -3 and -1.11. The scene surface arc is 170 degrees. This is a two-wide-platform test arrangement, different from the original six-platform arena.

Inactive StageBorders has four colliders: side centers x=±10.75 with size 1×10, top/bottom centers y=±5.5 with size 20.75×1. Mouse and programming projectiles only destroy themselves on collisions tagged Borders, so their intended cleanup borders are disabled.

Physics settings: 2D gravity `(0,-39.0625)`, fixed timestep `0.016666668` (60 Hz), max allowed timestep 0.1. Player prefab scale is 1.3020834, dynamic rigidbody mass 1, zero linear drag, gravity scale 1, rotation constrained, initial body collider size 0.4×0.96 and x offset -0.1. Textures generally import at 100 pixels/unit.

Movement values from `Player.prefab`:

| Parameter | Value |
|---|---:|
| Horizontal acceleration | 54.90483 world units/s² |
| Horizontal speed cap | 7.8125 |
| Fall-speed cap | 7.8125 |
| Jump velocity | 13.020833 |
| Jump cooldown | 0.9 seconds |
| Hit lockout | 1 second when struck |

Movement input executes only for the locally owned player. Each fixed update subtracts hit/jump cooldowns, considers exactly-zero vertical velocity to mean grounded, handles crouch, accelerates horizontally, and applies velocity caps. If velocity and requested horizontal direction have a nonpositive product, x velocity is first zeroed; this also stops x immediately when no horizontal direction is pressed. Ground jump requires up/W held, exactly-zero y velocity, expired jump cooldown, and expired hit lockout. Holding jump can retrigger after landing/cooldown. There is no explicit reliable contact test, coyote time, jump buffering, multiple jumps, or downward platform drop action.

Crouch requires down/S, zero vertical velocity, and no hit lockout; entering changes collider to 0.6×0.7 at `(0,-0.13)`, zeros velocity, and switches sprite. Returning upright restores 0.4×0.96. Facing changes x-offset between -0.11/+0.11 and flips the renderer. The separate `Player.Crouched` property used by Attack is not updated by Movement's private network variable, so the two state systems are incomplete/inconsistent. STFAnimator later writes the same renderer, potentially overriding movement's crouch/hit sprite choices.

`FollowPlayers.cs` implements an experimental auto-center/zoom: find tagged players, compute min/max positions, center camera, fit to an assumed 16:9 aspect with 1.25 padding plus 1 unit, clamp orthographic size to at least 3. However its object is inactive in current game scene. Its arrays have capacity four; all slots are considered by min/max, including unused/stale slots, and eliminated players are never filtered. There is no camera smoothing, bounds clamp, or active-player-count enforcement. For one player, the method does nothing. Preserve this as an intended improvement, not a currently active behavior.

## Combat and stock rules

`Attack.cs` is a regular MonoBehaviour with no ownership gate, so every replicated player object can read the local machine's input. It reads Z on key-down, X/C while held, down/S, and horizontal axis. Input priority is:

1. If down: horizontal+X selects combo; otherwise Z selects uppercut; otherwise X selects sweep. All three paths only log strings.
2. Otherwise Z plays BasicAttack if cooldown allows, not blocking, and not Player.Crouched. Cooldown is 0.1 seconds.
3. Otherwise X locally instantiates a discipline special if allowed.
4. Otherwise C retains player position and sets Blocking.

Block release clears the boolean and retained position. Entering block requests a Block animation state that is absent from STFAnimator's dictionary; repeated held input also toggles animation state rather than setting it idempotently. HitDetection does not check Blocking or attack direction for defense. No working blocking damage reduction is present.

The code declaration special cooldown is 5 seconds, but Player prefab overrides it to **1 second**. BasicAttack only selects an animation; it never instantiates a HitBox. The four special prefabs do not contain the HitBox script and are not tagged Attack. They are not registered/spawned as network objects.

| Discipline | Local special scaffold | Saved prefab limitations |
|---|---|---|
| Diseño | Mouse/pointer projectile, AddForce 300 in last horizontal direction; spawn `(0.45,0.2)` | Trigger collider, no gravity; only complete special animation; destroys on Borders, which are inactive |
| Hardware | RAM visual, spawn `(0.5,-0.25)`, z=1; retain player position until AnimationEnded | No collider; empty animation/controller, no completion event, so release path is not wired |
| Programación | Green projectile, AddForce 300, spawn `(0.23,0.2)`; opposite sprite flip convention | Trigger collider, no gravity; empty animation/controller; destroys only on inactive Borders |
| Redes | Extending cable visual, spawn `(0.07,0.15)`; retain player position until AnimationEnded | Tiny 0.0001×0.0001 non-trigger collider; empty animation/controller, no completion event |

All instantiated specials are parented to the fighter, even moving projectiles. `Player.LastDirection` is updated from local input without ownership gating, separately from Movement's networked facing flag.

`HitDetection` recognizes collider tag Attack on locally owned victims. Its attack table contains eleven IDs: punch; uppercut; sweep; four discipline specials; four discipline combos. Every attack deals 20 percentage points. Punch base knockback is `(4,6.5)`; every other table entry is placeholder `(5,15)`. Damage percentage caps at 200. A right-facing hit scales velocity by `1+percentage/200`; a left-facing hit uses `1+percentage/100` and negative x, an asymmetry to treat as a bug. Victim is turned opposite attack direction and locked for 1 second. No invulnerability, shield logic, attacker immunity, team rules, or per-attack hit deduplication is implemented here.

`Assets/Prefabs/Attack.prefab` is a 1×1 trigger with white sprite, HitBox script, and NetworkedObject. One stationary test instance is already in the game scene at `(-2.24,0.68,0)` with attack ID 1, zero velocity, and effectively infinite lifetime. Actual melee does not spawn it. HitBox decrements TTL only if IsLocalPlayer (not a usual property of attack objects); expiration destroys the script component rather than the whole GameObject/collider.

`Respawn.cs` gives each player **3 stocks**. At y≤-25, local owner loses one. If stocks remain it clears hit state, chooses a random object tagged `respawn`, moves there, and resets percentage. It does not explicitly clear velocity. At zero stocks it does not despawn, disable input, determine a winner, or end the match. The two scene objects use `respawn`, but that tag is missing from `ProjectSettings/TagManager.asset`, a further inconsistent saved-project condition. Unlike the original, Unity has no match time limit or setup values.

## Player visuals and animation implementation

`Player.Type` is Diseño, Hardware, Redes, Programación, with prefab value 1 (Hardware). `playerID`, `headColor`, `bodyColor`, `legsColor` are owner-writable NetworkedVars. No UI changes the type/colors; STFAnimator explicitly leaves color selection TODO. The prefab's three child renderers (`Remera`, `Pantalon`, `Cabeza`) have no sprites assigned. STFAnimator assumes children 0/1/2 mean head/chest/leg, which disagrees with actual serialized child names/order; currently unused references hide this mismatch.

The custom animator has only Idle and BasicAttack in its state dictionary, despite enum members Spam, Combo, Block, Crouch. It loads individual sprites from `Resources/Idle` (two files) and `Resources/BasicAttack` (four files). It uses 1/60 second as a base, Idle speed 7 and BasicAttack speed 1. The indexing mixes speed-gated elapsed time with an unscaled elapsed-frame increment, so it should not be treated as a reliable animation timing specification. PlayOnce returns to Idle when wrapping. There is no walk/jump/hit state registration, nor any combat animation events.

`Animations/Spam/SpamDiseno.controller` has one base-layer state, no parameters or transitions. Its 0.85-second looping clip advances through ten mouse PNGs at 1/12-second intervals and returns to frame zero. The other three controllers have **no layers**, and their clips have no sprite curves or events. Art files exist for those animations, but animation wiring is incomplete.

Ten combined fighter sheets are 420×576, seven 60×96 cells per row and six rows, with **38 populated cells** each. All 380 populated tiles match the Drive `Sprites Sin editar` frames exactly after decoding RGBA. They are repacks of existing normalized art, not newly drawn characters. Their metadata defines 38 named slices per sheet. The four last cells are empty. The spare Defensa1 body frame is not included in those sheets and has no corresponding color-overlay variants.

## Networking model

MLAPI DLL plus UNET transport; there is no current Mirror code despite stale MIRROR preprocessor symbols in ProjectSettings. Active menu manager is persistent (`DontDestroy=1`) and runs in background. Direct IP transport ports: client/server 7777, stored WebSocket port 8887, but WebSocket support is disabled. MLAPI relay is disabled. Generic MaxConnections is 100; this does not establish supported player count, because camera/HUD assume roughly four and no validation enforces it.

Network event/receive rates are 64 Hz. Player transform component sends 20 times per second with position interpolation, snap distance 2, 0.15 minimum position movement, no extrapolation. Owner writes velocity, hit/crouch/facing, damage, stocks, name, colors. Victim client determines taking damage and falling out. No deterministic shared simulation, server validation, lag compensation, rollback, disconnection handling, late-join rules, match readiness, host migration, or room persistence exists. NetworkConfig enables automatic player creation and only registers the Player prefab in active menu manager.

This explains the historical direct-IP demo direction, but gives the web port no reusable browser transport or room lifecycle. Architecture decisions should use the owner's current free-hosting/South-America requirements; this document does not prescribe a hosting change.

## Music, audio, and source asset provenance

Unity contains `Assets/Music/Cancion0.mp3` through `Cancion15.mp3` (111,035,664 bytes total) and `Assets/OST/intro.mp3` (3,905,328 bytes). Song MP3 tags mostly identify the encoder (`Lavf58.45.100`); title/artist identity cannot be inferred from numbering. Intro metadata references GarageBand. Root agent is auditing actual soundtrack identity separately.

Menu Audio Source correctly references intro.mp3, has PlayOnAwake enabled, no loop, volume 1, and is **inactive**. No first-party script enables it. In game, Music Manager is **inactive**, AudioSource initially has no clip and PlayOnAwake is off. Its serialized `songs` array has **eight GUIDs, all missing from the current asset metadata**. It does not map to the sixteen current MP3s. There is therefore no valid current scene playlist mapping to claim.

MusicManager's intended behavior is for server to choose a random first song, then random unplayed entries until all have been selected, reset the list, and repeat; clients observe musicID and select the corresponding local clip. Implementation has issues beyond scene wiring: initial song zero equals lastMusicID zero so it will not initially play through the ID-change branch; `skipSong` bypasses the server condition due to boolean precedence; next-song selection happens whenever audio is stopped and may immediately replace the startup selection. No sound-effect code, announcer, hit sound, menu SFX, mixer, volume settings, mute UI, or audio preference persistence exists.

Drive export contains eight `OST/Cancion 0.wma` through `Cancion 7.wma`, no newer sound effects. Separate Drive/audio audit found identical ASF audio payloads to the original WMA build files at corresponding indices, with only metadata/header differences. They are not exact whole-file byte matches. Do not map these to Unity MP3 indices without audio evidence. `Lista OST.docx` is covered by the separate document/audio audit.

Root LICENSE is MIT, copyright Ignacio Pardo 2020. No asset-specific credits/license files are present. Embedded font name table identifies `ARCADE_N.TTF` as Arcade Normal, Regular, copyright 1997–2003 Yuji Adachi; it is not an originally authored STF font. This is provenance, not an inferred license grant.

## Drive art comparison and recommended reference selection

Each of `Sprites` and `Sprites Sin editar` contains **489 PNGs**, with exactly the same relative paths as the original runtime Texturas tree when extensions are matched case-insensitively. An uppercase `Golpe1_Pantalon0.PNG` explains earlier lower-case-only counts of 488. Each tree contains 88 attack images, three platform images, 16 HUD portraits, and 382 fighter/overlay images.

The Drive edited set is overwhelmingly the old runtime art: **487 of 489 files are byte-identical** to files in the original archive. The two exceptions are body crouch `Jugadores/Cuerpos/Agachado/Agachado0.png` and body block `Jugadores/Cuerpos/Defensa/Defensa0.png`. No new discipline, extra arena, additional fighter, or new attack family is added by the export.

Between the two Drive sets:

| Category | Files | Meaning |
|---|---:|---|
| Exact file bytes | 108 | Truly identical files |
| Exact decoded pixels | 339 | Encoding/metadata changes only |
| Same drawn content, different canvas | 39 | Crop/padding changes, not new artwork |
| Other body differences | 3 | Edited crouch, edited block, and a resized solid-black placeholder |

All **381 usable fighter/body/overlay files in Sprites Sin editar are 60×96**. The remaining `Cuerpos/CuerpoAgachado1.png` is a solid black opaque rectangle, 72×96 (edited/original version is 72×64); it is not usable character animation. Relative to original runtime images, raw Drive has 448 exact decoded matches, 40 identical drawn contents on different canvases, and that one black placeholder change.

Edited sprites preserve irregular original canvases: crouch overlays 60×64, sweep 60×54, first hardware-special frame 60×92, uppercut 61×96. Edited crouch **body** is now 59×70 and visibly differs from the original pose/head while its overlays remain 60×64; simply stacking those files at the same origin produces misalignment. Edited block **body** is 60×98 with a revised head, but its overlays remain 60×96. The edited block is byte-identical to Unity's separate `Sprites/Player/Block/Defensa0.png`. Unity's combined sheets use the normalized raw versions. Prefer normalized Drive frames or equivalent Unity sheet tiles as the consistent baseline for modular characters; keep edited bodies as optional art references requiring matching overlay work.

The 38 common poses per appearance layer are: crouch 1; sweep 1; walk 7; Design-named combo 2; Hardware combo 3; Networks combo 2; block 1; punch 4; hit 4; idle 2; jump 1; Design special 2; Hardware special 3; Programming special 2; Networks special 2; uppercut 1. Each overlay layer (hair, shirt, trousers) has three colored alternatives, with the body/base colors supplying the fourth appearance choice in the original system. Body also has Defensa1. There is no separate player `Combo Programacion` folder; the `Combo Diseno` filenames are `CProgramacion0/1`, so source semantics need the original code's mapping rather than assumptions from directory names.

| Attack asset family | Frames | Dimensions / identity |
|---|---:|---|
| Diseño special | 10 | 99×32, mouse pointer trail |
| Diseño combo | 22 | 120×96, selection rectangle/cursor |
| Hardware special | 15 | RAM pieces, varying 50–150 px wide and 45–124 high |
| Hardware combo | 4 | 52×52 optical discs |
| Programación special | 6 | 45×20 green projectile |
| Programación combo | 1 | 60×96 green code column |
| Redes special | 15 | Extending UTP cable, 68–264×32 |
| Redes combo | 15 | 140×66 rising cable connectors |

Sequence numbers in these attack groups are contiguous. Files existing does not establish playback duration or hit windows; use original combat code to interpret them. Preserve partial transparency: mouse/cable frames and many fighter-edge pixels have intermediate alpha, not merely binary transparency. All images decode successfully and none are fully transparent. Two Design combo final frames (`Cdiseno20.png` and `Cdiseno21.png`) are opaque black-filled selection rectangles rather than transparent fills; do not blindly remove black as a color key. The solid-black CuerpoAgachado1 placeholder should be excluded.

HUD has sixteen 140×52 portraits (`Retrato0-0` through `Retrato3-3`). Platform girder images are 800×50, 500×50, and 250×50. These are absent from current Unity assets but present in both Drive sets and the original runtime tree. They are useful for restoring original presentation/combat completeness; they are not new remake additions.

Unity's `Backgrounds/Map1.png` and original `Diseño/Fondos/Fondo.png` are both 1156×768 and differ at only **265 of 887,808 RGBA pixel positions**. They are essentially the same industrial skyline/girder art with tiny edits, not distinct stages. The improvement is that Unity actually displays it. The Drive sprite export has no backdrop or title art; Unity remains the source for STFX logo, LOCAL/ONLINE button graphics, and the wired backdrop.

## Audit artifacts

- `docs/remake-inventory.json`: all current tracked Unity paths, sizes, categories, containing-directory counts.
- `/tmp/stf-remake-audit-ThKloi/drive-assets-report.json`: exhaustive PNG file hashes, decoded/visible pixel hashes, dimensions, alpha properties, matching paths, and edited/raw differences.
- `/tmp/stf-remake-audit-ThKloi/drive-sheet-matches.json`: every populated Unity sheet tile mapped back to its matching Drive raw frame.
- `/tmp/stf-remake-audit-ThKloi/remake-assets-preview.png`: backdrop, logo, fighter sheets, discipline special examples.
- `/tmp/stf-remake-audit-ThKloi/drive-sprite-differences.png`: edited/raw/original crouch and block, overlay alignment, black placeholder.
- `/tmp/stf-remake-audit-ThKloi/drive-additional-families.png`: combo effects, portrait HUD, original platform, Unity buttons.

## Port implications grounded in this evidence

Use original gameplay as the rule reference; use the Unity/Drive normalization as art packaging help. Integrate the existing backdrop and title/menu identity, implement the intended camera carefully, preserve readable player names/stocks/percentages and rich portrait assets, and construct a coherent start/setup/match/results/rematch flow. Complete original attacks with real hitboxes and deterministic timing rather than treating Unity stubs as finished behavior. Asset availability supports the already-known four disciplines and original moves without inventing new mechanics. The saved Unity scene does not establish new audio, active camera behavior, working customization, matchmaking, or end-game rules.
